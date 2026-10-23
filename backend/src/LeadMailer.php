<?php

declare(strict_types=1);

namespace Promix\Leads;

use PHPMailer\PHPMailer\PHPMailer;

final class LeadMailer
{
    /** @param array<string, mixed> $config */
    public function __construct(private readonly array $config) {}

    /** @param array<string, string|bool> $lead */
    public function send(array $lead): void
    {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) $this->config['smtp_host'];
        $mail->Port = (int) $this->config['smtp_port'];
        $mail->SMTPAuth = true;
        $mail->Timeout = max(1, min(20, (int) ($this->config['smtp_timeout_seconds'] ?? 8)));
        $mail->getSMTPInstance()->Timelimit = $mail->Timeout;
        $mail->Username = (string) $this->config['smtp_user'];
        $mail->Password = (string) $this->config['smtp_password'];
        $secure = $this->config['smtp_secure'] ?? true;
        if ($secure === true || $secure === 'true' || $secure === 'ssl' || $secure === 'smtps') $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        elseif ($secure === 'tls' || $secure === 'starttls') $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        else { $mail->SMTPSecure = ''; $mail->SMTPAutoTLS = false; }
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->setFrom((string) $this->config['leads_from_email'], 'PROMIX');
        $mail->addAddress((string) $this->config['leads_to_email']);
        $mail->Subject = $this->subject($lead);
        $mail->isHTML(true);
        $mail->Body = $this->htmlBody($lead);
        $mail->AltBody = $this->textBody($lead);
        $mail->send();
    }

    /** @param array<string, string|bool> $lead */
    private function subject(array $lead): string
    {
        if ($lead['leadType'] === 'partnership') return 'Новая заявка PROMIX — партнёрство';
        if ($lead['product'] !== '') return 'Новая заявка PROMIX — ' . $lead['product'];
        return 'Новая заявка PROMIX — консультация';
    }

    /** @param array<string, string|bool> $lead
     *  @return array<string, string>
     */
    private function rows(array $lead): array
    {
        $labels = ['leadType' => 'Тип обращения', 'name' => 'Имя', 'phone' => 'Телефон', 'city' => 'Город', 'product' => 'Товар', 'productSlug' => 'Код товара', 'message' => 'Комментарий', 'sourcePage' => 'Страница', 'source' => 'Источник', 'utm_source' => 'UTM Source', 'utm_medium' => 'UTM Medium', 'utm_campaign' => 'UTM Campaign', 'utm_content' => 'UTM Content', 'utm_term' => 'UTM Term'];
        $rows = [];
        foreach ($labels as $key => $label) if (($lead[$key] ?? '') !== '') $rows[$label] = (string) $lead[$key];
        $rows['Дата'] = date('d.m.Y H:i:s T');
        $rows['Submission ID'] = (string) $lead['submissionId'];
        return $rows;
    }

    /** @param array<string, string|bool> $lead */
    private function htmlBody(array $lead): string
    {
        $html = '<h2 style="font-family:Arial,sans-serif">Новая заявка с сайта PROMIX</h2><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif">';
        foreach ($this->rows($lead) as $label => $value) $html .= '<tr><th align="left" valign="top" style="border-bottom:1px solid #ddd">' . htmlspecialchars($label, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</th><td style="border-bottom:1px solid #ddd">' . nl2br(htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</td></tr>';
        return $html . '</table>';
    }

    /** @param array<string, string|bool> $lead */
    private function textBody(array $lead): string
    {
        $lines = ['Новая заявка с сайта PROMIX', ''];
        foreach ($this->rows($lead) as $label => $value) $lines[] = $label . ': ' . $value;
        return implode("\n", $lines);
    }
}
