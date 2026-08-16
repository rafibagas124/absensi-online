<?php
// POST /send_otp.php  { email, otp, expires_at }
// Mengirim kode OTP ke email lewat Resend API. Dipanggil dari app.js (fetch),
// menggantikan pengiriman langsung dari browser via EmailJS.
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];

$email      = trim((string)($input['email'] ?? ''));
$otp        = trim((string)($input['otp'] ?? ''));
$expiresAt  = trim((string)($input['expires_at'] ?? ''));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => 'Email tidak valid.'], 422);
}
if (!preg_match('/^\d{6}$/', $otp)) {
    jsonResponse(['success' => false, 'message' => 'Kode OTP tidak valid.'], 422);
}

$safeOtp     = htmlspecialchars($otp, ENT_QUOTES, 'UTF-8');
$safeExpires = htmlspecialchars($expiresAt !== '' ? $expiresAt : '5 menit dari sekarang', ENT_QUOTES, 'UTF-8');

$html = '
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
    <h2 style="margin-bottom:8px;">Kode Verifikasi Akun</h2>
    <p>Gunakan kode berikut untuk menyelesaikan pendaftaran akun kamu:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:16px;text-align:center;border-radius:8px;">'
        . $safeOtp .
    '</p>
    <p>Kode ini berlaku hingga <b>' . $safeExpires . '</b>. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari tim kami.</p>
    <p style="color:#6b7280;font-size:12px;">Jika kamu tidak merasa melakukan pendaftaran ini, abaikan email ini.</p>
</div>';

$payload = [
    'from'    => RESEND_FROM,
    'to'      => [$email],
    'subject' => 'Kode OTP Verifikasi Akun Anda',
    'html'    => $html,
];

$ch = curl_init('https://api.resend.com/emails');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . RESEND_API_KEY,
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_TIMEOUT    => 15,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    jsonResponse(['success' => false, 'message' => 'Gagal menghubungi layanan email: ' . $curlErr], 502);
}

$result = json_decode((string)$response, true);

if ($httpCode >= 200 && $httpCode < 300) {
    jsonResponse(['success' => true, 'message' => 'OTP terkirim.', 'id' => $result['id'] ?? null]);
}

// Resend mengembalikan detail error yang berguna untuk debugging (mis. domain belum diverifikasi,
// atau di mode testing hanya boleh kirim ke email pemilik akun Resend)
jsonResponse([
    'success'      => false,
    'message'      => $result['message'] ?? 'Gagal mengirim email OTP.',
    'resend_error' => $result,
], $httpCode ?: 500);