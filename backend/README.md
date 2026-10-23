# PROMIX lead backend

Existing PHP 8.1+ / PHPMailer API: **POST `/api/lead.php`**, JSON, maximum 32768 bytes. The recipient is read only from private server configuration. No client field selects a recipient. A static Astro build does not execute PHP.

## Configuration

Install the existing Composer lock (`composer install --no-dev`), then copy `config/config.example.php` to private `config/config.php`. Composer requires PHP ZIP or an extraction utility. PHP requires JSON, OpenSSL and mbstring (the latter preserves character-count parity with the client). Never expose config, source, vendor or protection storage through the static webroot.

PHP executes `config/config.php`; the example reads **process environment via `getenv()`**. The project-root `.env` is not loaded by PHP. Configure PHP-FPM environment explicitly or put approved values in the private PHP file. Use only `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `LEADS_FROM_EMAIL`, `LEADS_TO_EMAIL`; `MAIL_FROM` / `MAIL_TO` are not aliases and are not read. Mail.ru defaults in the example preserve the existing setup; they are not FirstVDS credentials. Obtain real SMTP host, TLS mode, account and permitted From from the administrator. Do not guess them or put them in source control.

Protection configuration (also in `.env.example`):

| Variable | Default / rule |
| --- | --- |
| `LEADS_STORAGE_PATH` | `backend/storage`, private local filesystem, shared by all PHP workers, outside every public root |
| `LEADS_STORAGE_SECRET` | Required random secret, at least 32 bytes; the `CHANGE_ME` example is rejected |
| `LEADS_RATE_WINDOW_SECONDS` | 900 seconds; allowed 60–86400 |
| `LEADS_RATE_CLIENT_LIMIT` | 5 new attempts per client in that sliding window |
| `LEADS_RATE_GLOBAL_LIMIT` | 100 new attempts across the whole installation in that window |
| `LEADS_IDEMPOTENCY_TTL_SECONDS` | 86400 seconds (24h); allowed 86400–604800, never shorter than the client's 24h retry lifetime |
| `LEADS_TRUSTED_PROXIES` | Empty by default: only `REMOTE_ADDR`; comma-separated exact IP addresses if configured |
| `SMTP_TIMEOUT_SECONDS` | 8 seconds per SMTP command/read, clamped to 1–20; PHPMailer doubles its command time limit for the final DATA reply |

Use an OS cryptographic random generator for the storage secret. Preserve it and the storage directory across process restarts. Removing state discards the duplicate-protection history; changing the secret makes retained fingerprints conflict and changes client counter keys, so plan secret rotation explicitly. The directory must be writable by PHP only. Local `flock` and atomic `rename` semantics are required. This is a single-host filesystem design, not a distributed limiter: multiple servers need one shared transactional store before deployment. The numeric defaults are a documented starting policy for owner approval, not a claim about traffic capacity.

An explicitly trusted immediate proxy must **overwrite** `X-Forwarded-For` with exactly one valid client IP. Untrusted XFF is ignored. Chains, invalid addresses and invalid `REMOTE_ADDR` fail closed. Exact IP matching includes normalized IPv6; CIDR trust and arbitrary proxy chains are not supported. Check the real proxy config before setting trust.

## Atomic limits and identity

The existing validator runs before protection or SMTP. Its normalized, allowlisted lead fields form an HMAC-SHA256 content fingerprint. UUIDv4 IDs are normalized to lowercase. ID paths cannot be selected by arbitrary strings. A fixed set of 256 shard locks stays on disk; a busy shard returns a retryable `pending` response without SMTP. The held shard lock and persisted ID record prevent sequential/concurrent replays from creating another email. A separate rate lock reserves per-client and global slots atomically **before** SMTP. Accepted/unknown replays do not consume a new slot. Only validated new attempts reserve mail slots; invalid data is rejected without email.

JSON state contains the ID filename, HMAC content fingerprint, state/timestamps and HMAC client counters. It contains no phone, name, message, UTM, full URL or raw IP. Storage/configuration failure fails closed with no false success. PHP logs fixed error categories, never raw PHPMailer exception messages or lead bodies.

Counters are pruned to the configured sliding window on the next new attempt. Expired ID records are invalid immediately and are removed by bounded opportunistic cleanup on new attempts. Cleanup acquires the target request shard without waiting and re-reads expiry under that lock; it skips the current/busy shard, so it cannot delete a record refreshed by an active request. On an idle installation physical files can remain until the next request; use an administrator-controlled retention job if immediate physical deletion at expiry is required. Lock files are intentionally retained (at most 256 plus one rate lock). The API does not store full leads or a retry queue.

## Response contract

Existing `ok`, `submissionId`, `message`, and validation `fields: string[]` remain; `state` is additive:

| HTTP | Meaning |
| --- | --- |
| 201 | New SMTP acceptance: `{ok:true,state:"accepted",submissionId}` |
| 200 | Same ID/content was already accepted; no additional SMTP send |
| 202 | `ok:false,state:"pending"`, `Retry-After: 3`; owner/shard is busy; retry the same ID/content |
| 409 | `ok:false,state:"rejected"`; ID already belongs to different normalized content |
| 429 | `ok:false,state:"rejected"`, `Retry-After` seconds; new-attempt limit reached before email |
| 422 | `ok:false,state:"rejected",fields:[...]`; existing validation contract |
| 503 | Configuration/storage unavailable, or `state:"unknown"` after uncertain delivery; never show success |
| 400 / 405 / 413 / 415 | Invalid JSON / unsupported method / oversized body / unsupported media type; unchanged validation boundaries |

The UI accepts success only when HTTP is successful, `ok:true`, `state:"accepted"` and the response ID matches its submitted ID. It records `eventSent` durably before emitting `promix:lead-success`, with only context/ID fields (no name, phone or message). If both stores become unavailable after SMTP acceptance, the UI may show that confirmed result but skips the event until a durable same-ID replay can record it. Previously accepted operation state is sticky; a request-level 422/429/409/5xx cannot erase an earlier pending/unknown operation.

SMTP errors are conservatively **unknown**, including a definite fixture rejection: a generic transport exception does not prove that no message was accepted earlier. An unknown record is never automatically resent. A stale `pending` record after a worker exits becomes unknown, not a fresh send. If SMTP accepts but persisting `accepted` fails, the response is unknown and the existing pending record also prevents another send. Restarting PHP preserves records. Removing storage, changing the secret, or retrying after expiry removes this guarantee. SMTP acceptance is not proof of mailbox delivery; exactly-once delivery under every possible failure is not promised.

The browser waits 12 seconds. SMTP limits apply per stage, and DATA can take twice the configured command time; the entire server request can outlive the browser. The client retains ID + SHA-256 digest + state/revision/event flag for 24h, without form values, in sessionStorage and a namespaced `history.state.promixLeadAttemptsV1` fallback. History URL and unrelated state keys are preserved. With sessionStorage blocked, the history fallback preserves the ID across reloads in the same entry; it is not tab-wide storage for unrelated new entries. Before every attempt, stored copies are reconciled, including older BFcache documents; revision ordering preserves legitimate first-rejection correction and accepted/event flags remain sticky. The pending identity must be durably saved before POST: if neither store can be written, no new request starts and a clear recovery/phone message is shown. This does not disable forms when only sessionStorage is unavailable. Identical content retries use the same ID. Request-level rejection cannot clear an older uncertain delivery; changing content while unresolved is explicitly blocked. After a first attempt is rejected or an operation is accepted, a different standalone lead may receive a new ID. Cancelling during the asynchronous digest creates no phantom pending identity, and digest failure/timeout leaves the form retryable. Server TTL is enforced at least as long as the client's 24h lifetime. Tab closure, deleting browser/server history or TTL expiry removes continuity; no cross-tab or universal exactly-once guarantee is claimed.

## Attribution policy

With analytics consent, the latest URL containing any of the five allowlisted `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` keys replaces the tab's attribution for 30 minutes. Untagged internal navigation, reload and Back/Forward retain it until expiry; Back/Forward does not recapture an old tagged URL. A new tagged entry replaces the whole set (missing keys become empty). Without consent, stored attribution is removed and UTM fields are empty; granting consent on a tagged current page may capture it. Values are capped at 255 characters and reject controls, email/URL/phone-shaped strings. This does not prove arbitrary campaign text can never contain personal data: campaign owners must use nonpersonal labels.

Only sessionStorage is used; no new external service is enabled and no tags are added to internal links. If storage is blocked, current-page memory works, but internal full-page navigation loses attribution. Direct untagged entry in a clean tab has no UTM. The 30-minute, latest-entry policy is an explicit implementation default for company/analytics approval.

## Local and real-server verification

For manual local use: `php -S 127.0.0.1:8080 -t backend/public`, with a private local config and approved test SMTP. Astro dev proxies `/api/*` there. The built-in PHP server is local-only, not production hosting. Use only a loopback SMTP receiver for automated tests. The final QA folder records real PHP/PHPMailer, multiple workers, controlled SMTP and browser-to-API-to-test-mail proofs; mock UI tests alone do not prove mail handling.

The actual FirstVDS PHP-FPM/Nginx paths, permissions, secret provision, TLS/auth, trusted proxy overwrite, persistent storage/TTL, limiter policy, timeout budget and delivery to `simkraski@mail.ru` remain a separate administrator/owner acceptance. No real mailbox or FirstVDS delivery was tested by local fixtures.
