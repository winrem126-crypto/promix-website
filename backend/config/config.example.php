<?php

declare(strict_types=1);

return [
    'smtp_host' => getenv('SMTP_HOST') ?: 'smtp.mail.ru',
    'smtp_port' => (int) (getenv('SMTP_PORT') ?: 465),
    'smtp_secure' => getenv('SMTP_SECURE') !== false ? getenv('SMTP_SECURE') : true,
    'smtp_user' => getenv('SMTP_USER') ?: 'simkraski@mail.ru',
    'smtp_password' => getenv('SMTP_PASSWORD') ?: 'CHANGE_ME',
    'leads_from_email' => getenv('LEADS_FROM_EMAIL') ?: 'simkraski@mail.ru',
    'leads_to_email' => getenv('LEADS_TO_EMAIL') ?: 'simkraski@mail.ru',
    'smtp_timeout_seconds' => (int) (getenv('SMTP_TIMEOUT_SECONDS') ?: 8),
    // Private, local filesystem shared by every PHP worker. Never place under public/ or dist/.
    'storage_path' => getenv('LEADS_STORAGE_PATH') ?: dirname(__DIR__) . '/storage',
    'storage_secret' => getenv('LEADS_STORAGE_SECRET') ?: 'CHANGE_ME_WITH_AT_LEAST_32_RANDOM_BYTES',
    'rate_window_seconds' => (int) (getenv('LEADS_RATE_WINDOW_SECONDS') ?: 900),
    'rate_client_limit' => (int) (getenv('LEADS_RATE_CLIENT_LIMIT') ?: 5),
    'rate_global_limit' => (int) (getenv('LEADS_RATE_GLOBAL_LIMIT') ?: 100),
    'idempotency_ttl_seconds' => (int) (getenv('LEADS_IDEMPOTENCY_TTL_SECONDS') ?: 86400),
    // Exact IPs only. A trusted proxy must OVERWRITE X-Forwarded-For with one client IP.
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', getenv('LEADS_TRUSTED_PROXIES') ?: '')))),
];
