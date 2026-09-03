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
  style: 'style.css',
};

// Konfigurasi obfuscator "tinggi & stabil" untuk kode browser (tanpa selfDefending/debugProtection yang membekukan thread)
const BROWSER_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
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

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...parts] = trimmed.split('=');
    if (!process.env[key.trim()]) process.env[key.trim()] = parts.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
}

function encodedSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL dan SUPABASE_ANON_KEY wajib diisi di .env atau Vercel Environment Variables.');
  }
  const key = 'AbsensiPro_S3cr3t_2024!@#';
  const xorEncode = value => Buffer.from(value).reduce((result, byte, index) => (
    result + (byte ^ key.charCodeAt(index % key.length)).toString(16).padStart(2, '0')
  ), '');
  const splitIntoChunks = (value, count) => {
    const size = Math.ceil(value.length / count);
    return Array.from({ length: count }, (_, index) => value.slice(index * size, (index + 1) * size));
  };
  const encodedUrl = Buffer.from(xorEncode(url)).toString('base64');
  const encodedKey = xorEncode(anonKey);
  const midpoint = Math.floor(encodedKey.length / 2);
  const firstPart = encodedKey.slice(0, midpoint).split('').reverse().join('');
  const [partA, partB, partC] = splitIntoChunks(encodedKey.slice(midpoint), 3);
  return {
    url: encodedUrl,
    key: [Buffer.from(firstPart).toString('base64'), partA, partB, partC]
  };
}

function obfuscateSupabaseClient(destFile, options) {
  const source = fs.readFileSync(path.join(ROOT_DIR, FILES.supabaseClient), 'utf8');
  const config = encodedSupabaseConfig();
  const configuredSource = source
    .replace(/var _0xu = '[^']*';/, `var _0xu = '${config.url}';`)
    .replace(/var _0xk = \[[^\]]*\];/, `var _0xk = ['${config.key[0]}', '${config.key[1]}', '${config.key[2]}', '${config.key[3]}'];`);
  const result = JavaScriptObfuscator.obfuscate(configuredSource, options);
  fs.writeFileSync(destFile, result.getObfuscatedCode(), 'utf8');
  console.log(`  ✓ obfuscated: ${FILES.supabaseClient} -> dist/${path.basename(destFile)}`);
}

function copyFileIfExists(srcFile, destFile) {
  if (fs.existsSync(srcFile)) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(srcFile, destFile);
    console.log(`  ✓ copied: ${path.basename(srcFile)} -> dist/${path.basename(destFile)}`);
  }
}

function main() {
  console.log('== AbsensiPro Build & Obfuscate Pipeline ==');
  loadEnvFile();

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
  copyFileIfExists(path.join(ROOT_DIR, FILES.style), path.join(DIST_DIR, FILES.style));
  copyFileIfExists(
    path.join(ROOT_DIR, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
    path.join(DIST_DIR, 'supabase.js')
  );
  copyFileIfExists(
    path.join(ROOT_DIR, 'node_modules', '@fortawesome', 'fontawesome-free', 'css', 'all.min.css'),
    path.join(DIST_DIR, 'fontawesome', 'all.min.css')
  );
  const fontAwesomeFontsDir = path.join(ROOT_DIR, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts');
  if (fs.existsSync(fontAwesomeFontsDir)) {
    fs.cpSync(fontAwesomeFontsDir, path.join(DIST_DIR, 'webfonts'), { recursive: true });
    console.log('  ✓ copied: Font Awesome webfonts -> dist/webfonts/');
  }

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
  obfuscateSupabaseClient(path.join(DIST_DIR, FILES.supabaseClient), BROWSER_OPTIONS);

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