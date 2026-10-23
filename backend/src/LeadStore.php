<?php

declare(strict_types=1);

namespace Promix\Leads;

/** File-backed protection shared by PHP workers. No lead text or raw IP is retained. */
final class LeadStore
{
    /** @var resource|null */
    private $lock = null;
    private string $directory;
    private string $secret;
    private int $ttl;
    private string $heldShard = '';

    /** @param array<string, mixed> $config */
    public function __construct(private readonly array $config)
    {
        $this->directory = rtrim((string) ($config['storage_path'] ?? ''), '/\\');
        $this->secret = (string) ($config['storage_secret'] ?? '');
        $this->ttl = (int) ($config['idempotency_ttl_seconds'] ?? 86400);
        if ($this->directory === '' || strlen($this->secret) < 32 || str_starts_with($this->secret, 'CHANGE_ME') || $this->ttl < 86400 || $this->ttl > 604800) throw new \RuntimeException('Invalid protection configuration');
        if (!is_dir($this->directory) && !@mkdir($this->directory, 0700, true) && !is_dir($this->directory)) throw new \RuntimeException('Protection storage unavailable');
        $directory = realpath($this->directory);
        if ($directory === false) throw new \RuntimeException('Unsafe protection storage');
        foreach ([dirname(__DIR__) . '/public', dirname(__DIR__, 2) . '/public', dirname(__DIR__, 2) . '/dist', $_SERVER['DOCUMENT_ROOT'] ?? ''] as $candidate) {
            $public = $candidate === '' ? false : realpath($candidate);
            if ($public !== false && (strtolower($directory) === strtolower($public) || str_starts_with(strtolower($directory), strtolower($public . DIRECTORY_SEPARATOR)))) throw new \RuntimeException('Unsafe protection storage');
        }
        $this->directory = $directory;
    }

    /** @param array<string, string|bool> $lead
     *  @return array{state: string, retryAfter?: int}
     */
    public function begin(array $lead, string $client): array
    {
        $id = (string) $lead['submissionId']; // LeadValidator has already checked UUIDv4.
        $fingerprint = hash_hmac('sha256', json_encode($lead, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $this->secret);
        // Fixed shard locks are never deleted: unlinking an active lock would split the boundary.
        $shard = substr(hash('sha256', $id), 0, 2);
        $this->heldShard = $shard;
        $this->lock = @fopen($this->directory . '/request-' . $shard . '.lock', 'c+b');
        if ($this->lock === false) throw new \RuntimeException('Protection lock unavailable');
        if (!flock($this->lock, LOCK_EX | LOCK_NB)) return ['state' => 'pending', 'retryAfter' => 3];

        $path = $this->recordPath($id);
        $record = $this->read($path);
        if ($record !== null && ($record['expiresAt'] ?? 0) > time()) {
            if (!hash_equals((string) ($record['fingerprint'] ?? ''), $fingerprint)) return ['state' => 'conflict'];
            $state = (string) ($record['state'] ?? 'unknown');
            if ($state === 'pending') {
                // Owning worker no longer holds the lock: its delivery outcome cannot be inferred.
                $record['state'] = 'unknown';
                $this->write($path, $record);
                $state = 'unknown';
            }
            return ['state' => in_array($state, ['accepted', 'rejected', 'unknown'], true) ? $state : 'unknown'];
        }
        $retry = $this->rateLimit($client);
        if ($retry > 0) return ['state' => 'limited', 'retryAfter' => $retry];
        $this->write($path, ['fingerprint' => $fingerprint, 'state' => 'pending', 'createdAt' => time(), 'expiresAt' => time() + $this->ttl]);
        return ['state' => 'new'];
    }

    public function finish(string $id, string $state): void
    {
        if (!in_array($state, ['accepted', 'rejected', 'unknown'], true)) throw new \RuntimeException('Invalid protection state');
        $path = $this->recordPath($id);
        $record = $this->read($path);
        if ($record === null) throw new \RuntimeException('Protection record missing');
        $record['state'] = $state;
        $record['updatedAt'] = time();
        $this->write($path, $record);
    }

    public function __destruct()
    {
        if (is_resource($this->lock)) { flock($this->lock, LOCK_UN); fclose($this->lock); }
    }

    /** Only explicitly trusted immediate proxies may supply a single client address. */
    public static function clientAddress(array $server, array $trustedProxies): string
    {
        $remote = (string) ($server['REMOTE_ADDR'] ?? '');
        if (filter_var($remote, FILTER_VALIDATE_IP) === false) throw new \RuntimeException('Invalid remote address');
        $trusted = array_filter($trustedProxies, static fn ($value) => is_string($value) && filter_var($value, FILTER_VALIDATE_IP) !== false);
        $packed = inet_pton($remote);
        $isTrusted = count(array_filter($trusted, static fn ($value) => inet_pton($value) === $packed)) > 0;
        if ($isTrusted && isset($server['HTTP_X_FORWARDED_FOR'])) {
            // The configured proxy must overwrite XFF with exactly one IP, never append a chain.
            $forwarded = trim((string) $server['HTTP_X_FORWARDED_FOR']);
            if (filter_var($forwarded, FILTER_VALIDATE_IP) === false) throw new \RuntimeException('Invalid proxy address');
            return inet_ntop(inet_pton($forwarded));
        }
        return inet_ntop($packed);
    }

    private function recordPath(string $id): string { return $this->directory . '/lead-' . $id . '.json'; }

    /** @return array<string, mixed>|null */
    private function read(string $path): ?array
    {
        if (!is_file($path)) return null;
        $raw = @file_get_contents($path);
        if ($raw === false) throw new \RuntimeException('Protection storage unreadable');
        try { $value = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new \RuntimeException('Protection storage corrupt'); }
        if (!is_array($value)) throw new \RuntimeException('Protection storage corrupt');
        return $value;
    }

    private function write(string $path, array $value): void
    {
        $temporary = $this->directory . '/write-' . bin2hex(random_bytes(12)) . '.tmp';
        $bytes = json_encode($value, JSON_THROW_ON_ERROR);
        if (@file_put_contents($temporary, $bytes, LOCK_EX) !== strlen($bytes)) { @unlink($temporary); throw new \RuntimeException('Protection storage unwritable'); }
        @chmod($temporary, 0600);
        if (!@rename($temporary, $path)) { @unlink($temporary); throw new \RuntimeException('Protection storage commit failed'); }
    }

    /** Reserve both limits atomically before SMTP; accepted/unknown retries do not consume them. */
    private function rateLimit(string $client): int
    {
        $window = (int) ($this->config['rate_window_seconds'] ?? 900);
        $perClient = (int) ($this->config['rate_client_limit'] ?? 5);
        $global = (int) ($this->config['rate_global_limit'] ?? 100);
        if ($window < 60 || $window > 86400 || $perClient < 1 || $perClient > 1000 || $global < $perClient || $global > 100000) throw new \RuntimeException('Invalid rate configuration');
        $lock = @fopen($this->directory . '/rate.lock', 'c+b');
        if ($lock === false || !flock($lock, LOCK_EX)) throw new \RuntimeException('Rate storage unavailable');
        try {
            $now = time();
            $state = $this->read($this->directory . '/rate.json') ?? ['requests' => []];
            $requests = array_values(array_filter($state['requests'] ?? [], static fn ($entry) => is_array($entry) && ($entry['at'] ?? 0) > $now - $window));
            $key = hash_hmac('sha256', $client, $this->secret);
            $clientRequests = array_values(array_filter($requests, static fn ($entry) => ($entry['client'] ?? '') === $key));
            if (count($requests) >= $global || count($clientRequests) >= $perClient) {
                $oldest = count($requests) >= $global ? $requests[0]['at'] : $clientRequests[0]['at'];
                return max(1, (int) $oldest + $window - $now);
            }
            $requests[] = ['client' => $key, 'at' => $now];
            $this->write($this->directory . '/rate.json', ['requests' => $requests]);
            // A bounded cleanup also removes expired idempotency records; lock files stay bounded at 256.
            $checked = 0;
            foreach (new \DirectoryIterator($this->directory) as $file) {
                if (!$file->isFile() || !preg_match('/^lead-[0-9a-f-]{36}\.json$/i', $file->getFilename())) continue;
                if (++$checked > 200) break;
                $targetId = substr($file->getFilename(), 5, -5);
                $targetShard = substr(hash('sha256', $targetId), 0, 2);
                if ($targetShard === $this->heldShard) continue;
                $cleanupLock = @fopen($this->directory . '/request-' . $targetShard . '.lock', 'c+b');
                if ($cleanupLock === false) throw new \RuntimeException('Protection cleanup lock unavailable');
                // Never wait for a request lock while holding the global rate lock.
                if (!flock($cleanupLock, LOCK_EX | LOCK_NB)) { fclose($cleanupLock); continue; }
                try {
                    // Expiry is re-read under the same shard lock as begin()/finish().
                    $record = $this->read($file->getPathname());
                    if ($record !== null && ($record['expiresAt'] ?? PHP_INT_MAX) <= $now && !@unlink($file->getPathname())) throw new \RuntimeException('Protection cleanup failed');
                } finally { flock($cleanupLock, LOCK_UN); fclose($cleanupLock); }
            }
            return 0;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
}
