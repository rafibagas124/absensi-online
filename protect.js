// ================== PROTEKSI FRONTEND DASAR (ANTI-DEBUGGING) ==================
// Catatan: proteksi berikut hanya menghambat pengguna awam yang mencoba
// membuka DevTools / melihat source code lewat cara umum. Ini BUKAN
// pengaman data yang sesungguhnya (semua kode client-side pada akhirnya
// bisa dibaca oleh pengguna yang cukup mengerti). Jangan taruh rahasia
// (API key rahasia, secret, dsb) di kode frontend.
(function () {
    'use strict';

    // 1. Cegah klik kanan (context menu)
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // 2. Cegah shortcut umum untuk membuka DevTools / view-source
    document.addEventListener('keydown', function (e) {
        var key = (e.key || '').toUpperCase();

        // F12
        if (key === 'F12') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I / Ctrl+Shift+J (DevTools / Console)
        if (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J')) {
            e.preventDefault();
            return false;
        }
        // Ctrl+U (view-source)
        if (e.ctrlKey && key === 'U') {
            e.preventDefault();
            return false;
        }
    });

    // 3. Hambatan ringan bila DevTools terbuka (loop debugger sederhana).
    //    Saat DevTools tertutup, statement "debugger;" praktis tanpa biaya.
    //    Saat DevTools terbuka, browser akan berhenti di titik ini sehingga
    //    mengganggu proses inspeksi/debugging.
    try {
        setInterval(function () {
            // eslint-disable-next-line no-debugger
            debugger;
        }, 1000);
    } catch (e) {
        /* diamkan jika environment tidak mendukung */
    }
})();
