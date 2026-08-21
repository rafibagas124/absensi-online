// ================== PROTEKSI FRONTEND TINGKAT LANJUT (ANTI-DEBUGGING) ==================
// Catatan: Proteksi ini memblokir shortcut keyboard umum (F12, Ctrl+Shift+I, Ctrl+U, dll)
// serta klik kanan agar aplikasi tidak mudah diinspeksi secara sembarangan.
(function () {
    'use strict';

    // ── 1. Cegah klik kanan (Context Menu) di seluruh halaman ─────────────────────
    function blockContextMenu(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
        return false;
    }
    window.addEventListener('contextmenu', blockContextMenu, { capture: true, passive: false });
    document.addEventListener('contextmenu', blockContextMenu, { capture: true, passive: false });

    // ── 2. Cegah Shortcut Keyboard (F12, Ctrl+Shift+I/J/C/K/E, Ctrl+U, Ctrl+S) ───
    function isDevToolsOrInspectShortcut(e) {
        var key = (e.key || '').toUpperCase();
        var code = e.code || '';
        var keyCode = e.keyCode || e.which || 0;
        var isCtrlOrCmd = e.ctrlKey || e.metaKey;
        var isShift = e.shiftKey;
        var isAlt = e.altKey;

        // F12
        if (key === 'F12' || code === 'F12' || keyCode === 123) {
            return true;
        }

        // Ctrl+Shift+I (DevTools Elements / Inspector) atau Cmd+Option+I di Mac
        if ((isCtrlOrCmd && isShift && (key === 'I' || code === 'KeyI' || keyCode === 73)) ||
            (e.metaKey && isAlt && (key === 'I' || code === 'KeyI' || keyCode === 73))) {
            return true;
        }

        // Ctrl+Shift+J (DevTools Console) atau Cmd+Option+J di Mac
        if ((isCtrlOrCmd && isShift && (key === 'J' || code === 'KeyJ' || keyCode === 74)) ||
            (e.metaKey && isAlt && (key === 'J' || code === 'KeyJ' || keyCode === 74))) {
            return true;
        }

        // Ctrl+Shift+C (Inspect Element) atau Cmd+Option+C di Mac
        if ((isCtrlOrCmd && isShift && (key === 'C' || code === 'KeyC' || keyCode === 67)) ||
            (e.metaKey && isAlt && (key === 'C' || code === 'KeyC' || keyCode === 67))) {
            return true;
        }

        // Ctrl+Shift+K (Firefox Web Console) / Ctrl+Shift+E (Firefox Network)
        if (isCtrlOrCmd && isShift && (key === 'K' || code === 'KeyK' || keyCode === 75 || key === 'E' || code === 'KeyE' || keyCode === 69)) {
            return true;
        }

        // Ctrl+U / Cmd+U (View Source)
        if (isCtrlOrCmd && (key === 'U' || code === 'KeyU' || keyCode === 85)) {
            return true;
        }

        // Ctrl+S / Cmd+S (Save Page)
        if (isCtrlOrCmd && (key === 'S' || code === 'KeyS' || keyCode === 83)) {
            return true;
        }

        return false;
    }

    function blockKeyShortcut(e) {
        if (isDevToolsOrInspectShortcut(e)) {
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            return false;
        }
    }

    window.addEventListener('keydown', blockKeyShortcut, { capture: true, passive: false });
    document.addEventListener('keydown', blockKeyShortcut, { capture: true, passive: false });
    window.addEventListener('keyup', blockKeyShortcut, { capture: true, passive: false });
    document.addEventListener('keyup', blockKeyShortcut, { capture: true, passive: false });
    window.addEventListener('keypress', blockKeyShortcut, { capture: true, passive: false });
    document.addEventListener('keypress', blockKeyShortcut, { capture: true, passive: false });

    // ── 3. Anti-iframe (Frame-busting / Clickjacking prevention) ─────────────────
    try {
        if (window.self !== window.top) {
            window.top.location = window.self.location;
        }
    } catch (_e) {
        try {
            document.documentElement.innerHTML = '';
        } catch (_err) {}
    }

    // ── 4. Neutralisasi console agar tidak membocorkan data debug ─────────────────
    // Ditunda beberapa detik agar library awal selesai inisialisasi tanpa error
    function neutralizeConsole() {
        var noop = function () {};
        var methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'dir', 'trace', 'group', 'groupEnd', 'groupCollapsed', 'count', 'time', 'timeEnd', 'assert', 'profile', 'profileEnd'];
        if (window.console) {
            methods.forEach(function (m) {
                try { window.console[m] = noop; } catch (_e) {}
            });
        }
    }
    setTimeout(neutralizeConsole, 4000);

})();
