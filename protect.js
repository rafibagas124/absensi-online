// ================== PROTEKSI FRONTEND TINGKAT LANJUT (ANTI-DEBUGGING) ==================
// Catatan: proteksi berikut menghambat pengguna yang mencoba membuka DevTools /
// memeriksa kode sumber. Ini BUKAN pengganti perlindungan data di sisi server —
// jangan pernah menyimpan rahasia (API key service_role, secret key) di kode frontend.
(function () {
    'use strict';

    // ── 1. Cegah klik kanan (context menu) ─────────────────────────────────────
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // ── 2. Cegah shortcut umum untuk membuka DevTools / view-source ─────────────
    document.addEventListener('keydown', function (e) {
        var key = (e.key || '').toUpperCase();

        // F12
        if (key === 'F12') { e.preventDefault(); return false; }

        // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools / Console / Inspector)
        if (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) {
            e.preventDefault(); return false;
        }

        // Ctrl+U (view-source)
        if (e.ctrlKey && key === 'U') { e.preventDefault(); return false; }

        // Ctrl+S (save-page) — mencegah simpan source HTML offline
        if (e.ctrlKey && key === 'S') { e.preventDefault(); return false; }
    });

    // ── 3. Neutralisasi console (mempersulit debug output di DevTools) ────────────
    // Semua console.* diganti fungsi kosong agar tidak ada output yang bocor.
    // Ditunda 3 detik supaya inisialisasi library CDN (Supabase, face-api) selesai.
    function neutralizeConsole() {
        var noop = function () {};
        var methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'dir', 'trace', 'group', 'groupEnd', 'groupCollapsed', 'count', 'time', 'timeEnd', 'assert', 'profile', 'profileEnd'];
        if (window.console) {
            methods.forEach(function (m) {
                try { window.console[m] = noop; } catch (_e) {}
            });
        }
    }
    setTimeout(neutralizeConsole, 3500);

    // ── 4. Deteksi DevTools via perubahan ukuran window ──────────────────────────
    // DevTools yang dibuka (undocked atau docked) menyebabkan selisih ukuran window.
    // Threshold 160px menghindari false positive saat layar kecil / zoom.
    var _devToolsOpen = false;
    function checkDevToolsSize() {
        var widthDiff  = window.outerWidth  - window.innerWidth;
        var heightDiff = window.outerHeight - window.innerHeight;
        var open = widthDiff > 160 || heightDiff > 160;
        if (open && !_devToolsOpen) {
            _devToolsOpen = true;
            try {
                document.body.style.filter = 'blur(12px)';
                document.body.style.pointerEvents = 'none';
                document.body.style.userSelect = 'none';
            } catch (_e) {}
        } else if (!open && _devToolsOpen) {
            _devToolsOpen = false;
            try {
                document.body.style.filter = '';
                document.body.style.pointerEvents = '';
                document.body.style.userSelect = '';
            } catch (_e) {}
        }
    }
    setInterval(checkDevToolsSize, 800);

    // ── 5. Anti-iframe (frame-busting / clickjacking prevention) ─────────────────
    // X-Frame-Options: DENY sudah dipasang di config.php; ini layer client-side tambahan.
    try {
        if (window.self !== window.top) {
            window.top.location = window.self.location;
        }
    } catch (_e) {
        // Jika akses ke window.top diblokir (cross-origin iframe), kosongkan halaman
        document.documentElement.innerHTML = '';
    }

    // ── 6. Debugger loop tingkat lanjut ─────────────────────────────────────────
    // Menggunakan Function constructor agar lebih sulit di-bypass oleh
    // pengguna yang mencoba meng-overwrite fungsi debugger.
    var _dbg = function () {
        // eslint-disable-next-line no-new-func
        (function () { return false; }).constructor('debugger')();
    };
    try {
        setInterval(function () {
            try { _dbg(); } catch (_e) {}
        }, 1200);
    } catch (_e) {}

    // ── 7. Deteksi Firebug / ekstensi developer lama ────────────────────────────
    try {
        if (window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) {
            document.body.innerHTML = '';
        }
    } catch (_e) {}

})();
