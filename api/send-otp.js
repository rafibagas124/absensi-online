// api/send-otp.js
// Vercel Serverless Function — menggantikan send_otp.php
// POST /api/send-otp  { email, otp, expires_at }
// Mengirim kode OTP ke email via Resend API.
// API key Resend dibaca dari Environment Variables Vercel (bukan di-hardcode).

export default async function handler(req, res) {
    // Hanya terima POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed.' });
    }

    const { email, otp, expires_at: expiresAt } = req.body ?? {};

    // Validasi input
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(422).json({ success: false, message: 'Email tidak valid.' });
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
        return res.status(422).json({ success: false, message: 'Kode OTP tidak valid.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM || 'Absensi App <onboarding@resend.dev>';

    if (!apiKey) {
        console.error('RESEND_API_KEY belum dikonfigurasi di Vercel Environment Variables.');
        return res.status(500).json({ success: false, message: 'Konfigurasi server email belum selesai. Hubungi administrator.' });
    }

    const safeOtp     = String(otp).replace(/[<>&"']/g, '');
    const safeExpires = String(expiresAt || '5 menit dari sekarang').replace(/[<>&"']/g, '');

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#ffffff;">
    <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0;">AbsensiPro</h1>
    </div>
    <h2 style="color:#1f2937;margin-bottom:8px;">Kode Verifikasi Akun</h2>
    <p style="color:#374151;">Gunakan kode berikut untuk menyelesaikan pendaftaran akun kamu:</p>
    <p style="font-size:40px;font-weight:bold;letter-spacing:12px;background:#f3f4f6;padding:20px;text-align:center;border-radius:12px;color:#1e40af;margin:24px 0;">${safeOtp}</p>
    <p style="color:#374151;">Kode ini berlaku hingga <b>${safeExpires}</b>. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari tim kami.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#6b7280;font-size:12px;">Jika kamu tidak merasa melakukan pendaftaran ini, abaikan email ini.</p>
</div>`;

    const payload = {
        from,
        to: [email],
        subject: 'Kode OTP Verifikasi Akun AbsensiPro',
        html,
    };

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok) {
            return res.status(200).json({ success: true, message: 'OTP terkirim.', id: result.id ?? null });
        }

        // Resend mengembalikan detail error (mis. domain belum diverifikasi)
        console.error('Resend API error:', result);
        return res.status(response.status).json({
            success: false,
            message: result.message || 'Gagal mengirim email OTP.',
            resend_error: result,
        });
    } catch (err) {
        console.error('Fetch ke Resend gagal:', err);
        return res.status(502).json({ success: false, message: 'Gagal menghubungi layanan email.' });
    }
}
