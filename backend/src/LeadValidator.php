<?php

declare(strict_types=1);

namespace Promix\Leads;

final class LeadValidator
{
    private const ALLOWED_LEAD_TYPES = [
        'general', 'header', 'product-consultation', 'product-support', 'partnership', 'catalog-empty',
    ];

    /** @param array<string, mixed> $payload
     *  @return array<string, string|bool>
     */
    public function validate(array $payload): array
    {
        $errors = [];
        $lead = [
            'submissionId' => $this->text($payload, 'submissionId', 64, $errors, true),
            'name' => $this->text($payload, 'name', 120, $errors, true),
            'phone' => $this->text($payload, 'phone', 40, $errors, true),
            'city' => $this->text($payload, 'city', 120, $errors),
            'message' => $this->text($payload, 'message', 3000, $errors),
            'product' => $this->text($payload, 'product', 160, $errors),
            'productSlug' => $this->text($payload, 'productSlug', 160, $errors),
            'source' => $this->text($payload, 'source', 255, $errors),
            'sourcePage' => $this->text($payload, 'sourcePage', 500, $errors),
            'leadType' => $this->text($payload, 'leadType', 64, $errors, true),
            'utm_source' => $this->text($payload, 'utm_source', 255, $errors),
            'utm_medium' => $this->text($payload, 'utm_medium', 255, $errors),
            'utm_campaign' => $this->text($payload, 'utm_campaign', 255, $errors),
            'utm_content' => $this->text($payload, 'utm_content', 255, $errors),
            'utm_term' => $this->text($payload, 'utm_term', 255, $errors),
            'website' => $this->text($payload, 'website', 255, $errors),
            'startedAt' => $this->text($payload, 'startedAt', 32, $errors, true),
            'consent' => ($payload['consent'] ?? false) === true,
        ];

        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $lead['submissionId'])) $errors['submissionId'] = 'Некорректный идентификатор отправки.';
        $lead['submissionId'] = strtolower($lead['submissionId']);
        foreach (['submissionId', 'name', 'phone', 'city', 'product', 'productSlug', 'source', 'sourcePage', 'leadType', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as $singleLineKey) {
            if (preg_match('/[\r\n]/', (string) $lead[$singleLineKey])) $errors[$singleLineKey] = 'Недопустимый перенос строки.';
        }
        $digits = preg_replace('/\D+/', '', $lead['phone']) ?? '';
        if (strlen($digits) < 7 || strlen($digits) > 15 || !preg_match('/^[0-9+()\s.-]+$/', $lead['phone'])) $errors['phone'] = 'Укажите корректный телефон.';
        if (!in_array($lead['leadType'], self::ALLOWED_LEAD_TYPES, true)) $errors['leadType'] = 'Недопустимый тип обращения.';
        if ($lead['consent'] !== true) $errors['consent'] = 'Необходимо согласие на обработку персональных данных.';
        if ($lead['website'] !== '') $errors['website'] = 'Заявка отклонена.';
        if (!ctype_digit($lead['startedAt']) || (int) $lead['startedAt'] > 9999999999999) {
            $errors['startedAt'] = 'Некорректное время начала заполнения.';
        } elseif ((int) floor(microtime(true) * 1000) - (int) $lead['startedAt'] < 1200) {
            $errors['startedAt'] = 'Форма отправлена слишком быстро.';
        }
        if ($errors !== []) throw new ValidationException($errors);
        unset($lead['website'], $lead['startedAt']);
        return $lead;
    }

    /** @param array<string, mixed> $payload
     *  @param array<string, string> $errors
     */
    private function text(array $payload, string $key, int $maxLength, array &$errors, bool $required = false): string
    {
        $value = $payload[$key] ?? '';
        if (!is_string($value)) {
            $errors[$key] = 'Некорректное значение.';
            return '';
        }
        $value = trim(str_replace("\0", '', $value));
        $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
        if ($required && $value === '') $errors[$key] = 'Обязательное поле.';
        if ($length > $maxLength) $errors[$key] = 'Превышена допустимая длина.';
        return $value;
    }
}
