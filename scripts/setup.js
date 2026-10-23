// Menyalin mesin emulator (EmulatorJS + core yang dipakai) dan font ke folder app/.
// Dijalankan otomatis setelah `npm install` (postinstall) dan sebelum build.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const nm = path.join(root, "node_modules");
const ejsSrc = path.join(nm, "@emulatorjs", "emulatorjs", "data");
const ejsDst = path.join(root, "app", "ejs");

// Core yang dibundel: arcade/Neo Geo, NES, SNES, GB/GBC, GBA, PS1
const CORES = ["fbneo", "fceumm", "snes9x", "gambatte", "mgba", "pcsx_rearmed"];

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(ejsSrc)) {
  console.error("EmulatorJS belum terpasang. Jalankan `npm install` dulu.");
  process.exit(1);
}

fs.rmSync(ejsDst, { recursive: true, force: true });
copyDir(ejsSrc, ejsDst, (s, e) => !(e.isDirectory() && e.name === "cores"));

// Tambalan kecil: perlakukan protokol rm:// seperti http(s) supaya EmulatorJS memakai XHR
// (progress unduhan, laporan core JSON, dan permintaan HEAD bekerja normal)
const emuFile = path.join(ejsDst, "src", "emulator.js");
let emuSrc = fs.readFileSync(emuFile, "utf8");
const needle = '!["http:", "https:"].includes(url.protocol)';
if (!emuSrc.includes(needle)) { console.error("Pola tambalan EmulatorJS tidak ditemukan — versi berubah?"); process.exit(1); }
emuSrc = emuSrc.replace(needle, '!["http:", "https:", "rm:"].includes(url.protocol)');
fs.writeFileSync(emuFile, emuSrc);

const coresDst = path.join(ejsDst, "cores");
fs.mkdirSync(path.join(coresDst, "reports"), { recursive: true });
for (const core of CORES) {
  const pkg = path.join(nm, "@emulatorjs", "core-" + core);
  if (!fs.existsSync(pkg)) { console.error("Core hilang:", core); process.exit(1); }
  for (const f of fs.readdirSync(pkg)) {
    // Versi non-thread (WebGL2 dan legacy) sudah cukup; versi thread butuh isolasi lintas-origin
    if (f === `${core}-wasm.data` || f === `${core}-legacy-wasm.data`) {
      fs.copyFileSync(path.join(pkg, f), path.join(coresDst, f));
    }
  }
  const rep = path.join(pkg, "reports", core + ".json");
  if (fs.existsSync(rep)) fs.copyFileSync(rep, path.join(coresDst, "reports", core + ".json"));
}

// Font
const fontDst = path.join(root, "app", "fonts");
fs.mkdirSync(fontDst, { recursive: true });
const fonts = [
  ["pixelify-sans", "pixelify-sans-latin-400-normal.woff2"],
  ["pixelify-sans", "pixelify-sans-latin-600-normal.woff2"],
  ["atkinson-hyperlegible", "atkinson-hyperlegible-latin-400-normal.woff2"],
  ["atkinson-hyperlegible", "atkinson-hyperlegible-latin-700-normal.woff2"],
];
for (const [pkg, f] of fonts) {
  fs.copyFileSync(path.join(nm, "@fontsource", pkg, "files", f), path.join(fontDst, f));
}

console.log("Mesin emulator & font siap di app/ (core: " + CORES.join(", ") + ")");
