<?php

declare(strict_types=1);

use Promix\Leads\LeadMailer;
use Promix\Leads\LeadValidator;
use Promix\Leads\LeadStore;
use Promix\Leads\ValidationException;

const MAX_BODY_BYTES = 32768;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'message' => 'Method not allowed']);
}
$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if ($contentType !== 'application/json') respond(415, ['ok' => false, 'message' => 'Unsupported media type']);
$declaredLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($declaredLength > MAX_BODY_BYTES) respond(413, ['ok' => false, 'message' => 'Request too large']);
$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) respond(413, ['ok' => false, 'message' => 'Request too large']);

try {
    $payload = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($payload)) respond(400, ['ok' => false, 'message' => 'Invalid JSON']);
    $backendRoot = dirname(__DIR__, 2);
    $autoload = $backendRoot . '/vendor/autoload.php';
    $configPath = $backendRoot . '/config/config.php';
    if (!is_file($autoload) || !is_file($configPath)) throw new RuntimeException('Backend is not configured');
    require $autoload;
    $config = require $configPath;
    if (!is_array($config) || ($config['smtp_password'] ?? 'CHANGE_ME') === 'CHANGE_ME' || ($config['smtp_password'] ?? '') === '') throw new RuntimeException('SMTP is not configured');
    $lead = (new LeadValidator())->validate($payload);
    $client = LeadStore::clientAddress($_SERVER, $config['trusted_proxies'] ?? []);
    $store = new LeadStore($config);
    $decision = $store->begin($lead, $client);
    if (isset($decision['retryAfter'])) header('Retry-After: ' . $decision['retryAfter']);
    if ($decision['state'] === 'limited') respond(429, ['ok' => false, 'state' => 'rejected', 'message' => 'Слишком много обращений. Попробуйте позже.']);
    if ($decision['state'] === 'conflict') respond(409, ['ok' => false, 'state' => 'rejected', 'message' => 'Идентификатор уже связан с другой заявкой.']);
    if ($decision['state'] === 'pending') respond(202, ['ok' => false, 'state' => 'pending', 'submissionId' => $lead['submissionId'], 'message' => 'Заявка ещё обрабатывается.']);
    if ($decision['state'] === 'accepted') respond(200, ['ok' => true, 'state' => 'accepted', 'submissionId' => $lead['submissionId']]);
    if ($decision['state'] === 'unknown') respond(503, ['ok' => false, 'state' => 'unknown', 'submissionId' => $lead['submissionId'], 'message' => 'Исход отправки не установлен. Свяжитесь с нами по телефону.']);
    if ($decision['state'] === 'rejected') respond(503, ['ok' => false, 'state' => 'rejected', 'message' => 'Заявка не принята.']);
    try {
        (new LeadMailer($config))->send($lead);
    } catch (Throwable) {
        // SMTP can accept DATA before a connection fails: never resend an uncertain attempt.
        $store->finish((string) $lead['submissionId'], 'unknown');
        error_log('[PROMIX lead] delivery_outcome_unknown');
        respond(503, ['ok' => false, 'state' => 'unknown', 'submissionId' => $lead['submissionId'], 'message' => 'Исход отправки не установлен. Свяжитесь с нами по телефону.']);
    }
    $store->finish((string) $lead['submissionId'], 'accepted');
    respond(201, ['ok' => true, 'state' => 'accepted', 'submissionId' => $lead['submissionId']]);
} catch (ValidationException $exception) {
    respond(422, ['ok' => false, 'state' => 'rejected', 'message' => 'Проверьте заполнение формы.', 'fields' => array_keys($exception->errors)]);
} catch (JsonException) {
    respond(400, ['ok' => false, 'message' => 'Invalid JSON']);
} catch (Throwable $exception) {
    error_log('[PROMIX lead] configuration_or_storage_unavailable');
    // Failure can occur after SMTP accepted a message but before its state was committed.
    respond(503, ['ok' => false, 'state' => isset($lead) ? 'unknown' : 'rejected', 'message' => 'Не удалось подтвердить отправку заявки.']);
}
