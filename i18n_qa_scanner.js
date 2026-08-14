/**
 * CARA PAKAI:
 * 1. Buka aplikasi di browser (mode Bahasa Indonesia, halaman apa saja: login, staff, HRD, admin).
 * 2. Buka DevTools > Console, paste seluruh isi file ini, tekan Enter.
 * 3. Ulangi di tiap halaman/menu (karena elemen dinamis baru muncul saat menu dibuka).
 * 4. Hasilnya: daftar teks yang TERLIHAT DI LAYAR tapi TIDAK ADA di kamus EN pada i18n.js.
 *    Tambahkan teks tsb ke object EN di i18n.js.
 */
(function () {
    const EN_DICT = (typeof window.__i18nDictForScan !== 'undefined')
        ? window.__i18nDictForScan
        : null;

    // Ambil daftar key dari dictionary EN yang sudah dimuat i18n.js (lewat i18next resources)
    let knownKeys = [];
    try {
        knownKeys = Object.keys(i18next.getResourceBundle('en', 'translation') || {});
    } catch (e) {
        console.warn('Tidak bisa baca resource i18next. Pastikan halaman sudah selesai load.');
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const missing = new Set();
    let node;
    while ((node = walker.nextNode())) {
        const text = node.nodeValue.trim();
        if (!text || text.length < 2) continue;
        if (!/[A-Za-zÀ-ÿ]/.test(text)) continue; // skip angka/simbol murni
        if (node.parentElement && node.parentElement.closest('script, style, #i18nSwitchLogin, #i18nSwitchSidebar')) continue;
        if (!knownKeys.includes(text)) missing.add(text);
    }

    console.log(`%c[i18n QA] ${missing.size} teks belum ada di kamus EN:`, 'font-weight:bold;color:#e11');
    console.table([...missing]);
    return [...missing];
})();