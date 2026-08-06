/**
 * build.js — Build & obfuscation pipeline untuk AbsensiPro (versi flat)
 *
 * Source (index.html, app.js, protect.js, service-worker.js, manifest.json,
 * icons/) ada langsung di root folder ini — TETAP EDIT DI SINI seperti biasa.
 *
 * `npm run build` akan menghasilkan folder `dist/` berisi versi
 * ter-obfuscate yang siap di-deploy. Folder `dist/` di-generate otomatis,
 * jangan diedit manual, dan sudah di-ignore oleh .gitignore.
 *
 * Jalankan:
 *   npm install
 *   npm run build
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(__dirname, 'dist');

// File-file source yang dibaca langsung dari root (bukan dari sub-folder)
const FILES = {
  html: 'index.html',
  manifest: 'manifest.json',
  icons: 'icons',
  app: 'app.js',
  protect: 'protect.js',
  serviceWorker: 'service-worker.js',
};

// ---------------------------------------------------------------------------
// Konfigurasi obfuscator "tinggi" untuk kode yang jalan di context browser
// biasa (index.html): app.js (logika utama) dan protect.js (anti-debug).
// ---------------------------------------------------------------------------
const BROWSER_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'browser',
};

// ---------------------------------------------------------------------------
// Konfigurasi lebih "aman" khusus untuk service-worker.js.
// selfDefending & debugProtection SENGAJA dimatikan (context worker tidak
// punya `window`, trik eval/Function-nya berisiko merusak registrasi SW).
// Caching/precache/fetch tetap 100% berjalan seperti aslinya.
// ---------------------------------------------------------------------------
const SERVICE_WORKER_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  target: 'browser-no-eval',
};

function obfuscateFile(srcFile, destFile, options) {
  const code = fs.readFileSync(srcFile, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, options);
  fs.writeFileSync(destFile, result.getObfuscatedCode(), 'utf8');
  console.log(`  obfuscated: ${path.basename(srcFile)} -> dist/${path.basename(destFile)}`);
}

function main() {
  console.log('== AbsensiPro build ==');

  // 1. Bersihkan folder dist/ lama
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  console.log('1. dist/ dibersihkan');

  // 2. Salin file statis apa adanya (TIDAK diobfuscate)
  fs.copyFileSync(path.join(ROOT_DIR, FILES.html), path.join(DIST_DIR, FILES.html));
  fs.copyFileSync(path.join(ROOT_DIR, FILES.manifest), path.join(DIST_DIR, FILES.manifest));
  const iconsDir = path.join(ROOT_DIR, FILES.icons);
  if (fs.existsSync(iconsDir)) {
    fs.cpSync(iconsDir, path.join(DIST_DIR, FILES.icons), { recursive: true });
  }
  console.log('2. index.html, manifest.json, icons/ disalin');

  // 3. Obfuscate app.js & protect.js (proteksi tinggi)
  console.log('3. Meng-obfuscate JavaScript (proteksi tinggi)...');
  obfuscateFile(path.join(ROOT_DIR, FILES.app), path.join(DIST_DIR, FILES.app), BROWSER_OPTIONS);
  obfuscateFile(path.join(ROOT_DIR, FILES.protect), path.join(DIST_DIR, FILES.protect), BROWSER_OPTIONS);

  // 4. Obfuscate service-worker.js (opsi aman, tidak merusak PWA)
  console.log('4. Meng-obfuscate service-worker.js (opsi aman untuk PWA)...');
  obfuscateFile(
    path.join(ROOT_DIR, FILES.serviceWorker),
    path.join(DIST_DIR, FILES.serviceWorker),
    SERVICE_WORKER_OPTIONS
  );

  console.log('\nBuild selesai. Folder siap deploy: ./dist');
  console.log('(Folder ini yang di-upload ke Vercel/Netlify/GitHub Pages, BUKAN root project)');
}

main();
