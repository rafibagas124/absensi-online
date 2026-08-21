/**
 * build.js — Build & obfuscation pipeline untuk AbsensiPro (ES Module)
 *
 * Source (index.html, app.js, supabase_client.js, protect.js, service-worker.js, manifest.json,
 * icons/) ada langsung di root folder ini — TETAP EDIT DI SINI seperti biasa.
 *
 * `npm run build` akan menghasilkan folder `dist/` berisi versi
 * ter-obfuscate yang siap di-deploy ke Vercel/GitHub Pages/Hosting.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(__dirname, 'dist');

const FILES = {
  html: 'index.html',
  manifest: 'manifest.json',
  icons: 'icons',
  models: 'models',
  faceApi: 'face-api.min.js',
  security: 'security.js',
  app: 'app.js',
  supabaseClient: 'supabase_client.js',
  protect: 'protect.js',
  serviceWorker: 'service-worker.js',
  i18n: 'i18n.js',
};

// Konfigurasi obfuscator "tinggi" untuk kode browser: app.js, protect.js, supabase_client.js
const BROWSER_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.35,
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

// Konfigurasi aman untuk service-worker.js
const SERVICE_WORKER_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
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
  if (!fs.existsSync(srcFile)) {
    console.warn(`  [SKIP] File tidak ditemukan: ${path.basename(srcFile)}`);
    return;
  }
  const code = fs.readFileSync(srcFile, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, options);
  fs.writeFileSync(destFile, result.getObfuscatedCode(), 'utf8');
  console.log(`  ✓ obfuscated: ${path.basename(srcFile)} -> dist/${path.basename(destFile)}`);
}

function copyFileIfExists(srcFile, destFile) {
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, destFile);
    console.log(`  ✓ copied: ${path.basename(srcFile)} -> dist/${path.basename(destFile)}`);
  }
}

function main() {
  console.log('== AbsensiPro Build & Obfuscate Pipeline ==');

  // 1. Bersihkan folder dist/ lama
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  console.log('1. dist/ dibersihkan');

  // 2. Salin file statis
  console.log('2. Menyalin asset & file statis...');
  copyFileIfExists(path.join(ROOT_DIR, FILES.html), path.join(DIST_DIR, FILES.html));
  copyFileIfExists(path.join(ROOT_DIR, FILES.manifest), path.join(DIST_DIR, FILES.manifest));
  copyFileIfExists(path.join(ROOT_DIR, FILES.i18n), path.join(DIST_DIR, FILES.i18n));
  copyFileIfExists(path.join(ROOT_DIR, FILES.faceApi), path.join(DIST_DIR, FILES.faceApi));

  const iconsDir = path.join(ROOT_DIR, FILES.icons);
  if (fs.existsSync(iconsDir)) {
    fs.cpSync(iconsDir, path.join(DIST_DIR, FILES.icons), { recursive: true });
    console.log('  ✓ copied: icons/ -> dist/icons/');
  }

  const modelsDir = path.join(ROOT_DIR, FILES.models);
  if (fs.existsSync(modelsDir)) {
    fs.cpSync(modelsDir, path.join(DIST_DIR, FILES.models), { recursive: true });
    console.log('  ✓ copied: models/ -> dist/models/');
  }

  // 3. Obfuscate script JavaScript penting
  console.log('3. Meng-obfuscate JavaScript (Proteksi Tinggi)...');
  obfuscateFile(path.join(ROOT_DIR, FILES.app), path.join(DIST_DIR, FILES.app), BROWSER_OPTIONS);
  obfuscateFile(path.join(ROOT_DIR, FILES.protect), path.join(DIST_DIR, FILES.protect), BROWSER_OPTIONS);
  obfuscateFile(path.join(ROOT_DIR, FILES.security), path.join(DIST_DIR, FILES.security), BROWSER_OPTIONS);
  obfuscateFile(path.join(ROOT_DIR, FILES.supabaseClient), path.join(DIST_DIR, FILES.supabaseClient), BROWSER_OPTIONS);

  // 4. Obfuscate service-worker.js
  console.log('4. Meng-obfuscate service-worker.js (PWA safe mode)...');
  obfuscateFile(
    path.join(ROOT_DIR, FILES.serviceWorker),
    path.join(DIST_DIR, FILES.serviceWorker),
    SERVICE_WORKER_OPTIONS
  );

  console.log('\n[SUCCESS] Build selesai! Folder siap deploy: ./dist\n');
}

main();