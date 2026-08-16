// api/send-otp.js
// Vercel Serverless Function — kirim OTP via Gmail SMTP (Nodemailer)
// POST /api/send-otp  { email, otp, expires_at }
//
// Setup di Vercel Environment Variables:
//   GMAIL_USER = emailkamu@gmail.com
//   GMAIL_APP_PASSWORD = xxxx xxxx xxxx xxxx  (Google App Password, bukan password Gmail biasa)

import nodemailer from 'nodemailer';

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
    if (!otp || !/^\d{6}$/.test(String(otp))) {
        return res.status(422).json({ success: false, message: 'Kode OTP tidak valid.' });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
        console.error('GMAIL_USER atau GMAIL_APP_PASSWORD belum dikonfigurasi di Vercel Environment Variables.');
        return res.status(500).json({
            success: false,
            message: 'Konfigurasi server email belum selesai. Hubungi administrator.'
        });
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

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailUser,
                pass: gmailPass,   // Google App Password (bukan password Gmail biasa)
            },
        });

        await transporter.sendMail({
            from: `"AbsensiPro" <${gmailUser}>`,
            to: email,
            subject: 'Kode OTP Verifikasi Akun AbsensiPro',
            html,
        });

        return res.status(200).json({ success: true, message: 'OTP terkirim.' });

    } catch (err) {
        console.error('Gagal kirim email via Gmail SMTP:', err.message);
        return res.status(502).json({
            success: false,
            message: 'Gagal mengirim email OTP: ' + err.message,
        });
    }
}
