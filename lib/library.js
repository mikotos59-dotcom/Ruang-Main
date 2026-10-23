// Pemindai folder Games: mengenali konsol tiap file dan menyusun daftar game.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const SYSTEMS = {
  arcade: { name: "Arcade / Neo Geo", short: "Arcade", folder: "Arcade" },
  nes: { name: "NES / Famicom", short: "NES", folder: "NES" },
  snes: { name: "SNES / Super Famicom", short: "SNES", folder: "SNES" },
  gb: { name: "Game Boy / Color", short: "GB", folder: "GB" },
  gba: { name: "Game Boy Advance", short: "GBA", folder: "GBA" },
  psx: { name: "PlayStation 1", short: "PS1", folder: "PS1" },
};

const FOLDER_ALIASES = {
  arcade: "arcade", neogeo: "arcade", "neo geo": "arcade", "neo-geo": "arcade", mame: "arcade", fbneo: "arcade", fba: "arcade",
  nes: "nes", famicom: "nes", fc: "nes",
  snes: "snes", sfc: "snes", "super nintendo": "snes", "super famicom": "snes",
  gb: "gb", gbc: "gb", gameboy: "gb", "game boy": "gb", "gameboy color": "gb", "game boy color": "gb",
  gba: "gba", "gameboy advance": "gba", "game boy advance": "gba",
  ps1: "psx", psx: "psx", playstation: "psx", "playstation 1": "psx", ps: "psx",
};

const EXT_SYSTEM = {
  nes: "nes", fds: "nes", unf: "nes", unif: "nes",
  sfc: "snes", smc: "snes", fig: "snes", swc: "snes",
  gb: "gb", gbc: "gb",
  gba: "gba",
  cue: "psx", chd: "psx", pbp: "psx", m3u: "psx", ccd: "psx", iso: "psx",
};
const ARCHIVE_EXT = new Set(["zip", "7z"]);
const DISC_PARTS = new Set(["bin", "img", "sub", "ecm", "wav", "ape"]);
const IGNORED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "txt", "nfo", "dat", "sav", "srm", "state", "md", "pdf", "url", "ini", "cfg", "db", "json", "ds_store"]);

// File BIOS / perangkat pendukung arcade — bukan game, tidak ditampilkan di pustaka
const ARCADE_SUPPORT = new Set([
  "neogeo", "neocdz", "pgm", "qsound", "ym2608", "decocass", "isgsm", "nmk004", "skns", "cchip",
  "bubsys", "namcoc69", "namcoc70", "namcoc74", "namcoc75", "namcoc76", "midssio", "coh1000c", "coh3002c",
  "hng64", "naomi", "awbios", "cpzn1", "cpzn2", "taitofx1", "tps", "konamigx", "stvbios", "f355bios",
]);

const PSX_BIOS = ["scph5501.bin", "scph1001.bin", "scph7001.bin", "scph5500.bin", "scph5502.bin", "scph101.bin", "scph7502.bin", "psxonpsp660.bin"];

// Nama lengkap beberapa game arcade populer (nama file arcade biasanya singkatan)
const ARCADE_TITLES = {
  mslug: "Metal Slug", mslug2: "Metal Slug 2", mslugx: "Metal Slug X", mslug3: "Metal Slug 3", mslug4: "Metal Slug 4", mslug5: "Metal Slug 5",
  kof94: "The King of Fighters '94", kof95: "The King of Fighters '95", kof96: "The King of Fighters '96", kof97: "The King of Fighters '97",
  kof98: "The King of Fighters '98", kof99: "The King of Fighters '99", kof2000: "The King of Fighters 2000", kof2001: "The King of Fighters 2001",
  kof2002: "The King of Fighters 2002", kof2003: "The King of Fighters 2003", garou: "Garou: Mark of the Wolves", rbff2: "Real Bout Fatal Fury 2",
  samsho: "Samurai Shodown", samsho2: "Samurai Shodown II", samsho3: "Samurai Shodown III", samsho4: "Samurai Shodown IV", samsho5: "Samurai Shodown V",
  lastblad: "The Last Blade", lastbld2: "The Last Blade 2", blazstar: "Blazing Star", pulstar: "Pulstar", shocktro: "Shock Troopers",
  shocktr2: "Shock Troopers: 2nd Squad", sengoku3: "Sengoku 3", twinspri: "Twinkle Star Sprites", puzzledp: "Puzzle de Pon!", magdrop3: "Magical Drop III",
  neobombe: "Neo Bomberman", wh2: "World Heroes 2", aof: "Art of Fighting", aof3: "Art of Fighting 3", fatfury1: "Fatal Fury", fatfury2: "Fatal Fury 2",
  fatfursp: "Fatal Fury Special", sf2: "Street Fighter II", sf2ce: "Street Fighter II': Champion Edition", ssf2t: "Super Street Fighter II Turbo",
  sfa3: "Street Fighter Alpha 3", mvsc: "Marvel vs. Capcom", xmvsf: "X-Men vs. Street Fighter", dino: "Cadillacs and Dinosaurs",
  punisher: "The Punisher", ffight: "Final Fight", kod: "The King of Dragons", knights: "Knights of the Round", captcomm: "Captain Commando",
  wof: "Warriors of Fate", ddsom: "Dungeons & Dragons: Shadow over Mystara", avsp: "Alien vs. Predator", 1941: "1941: Counter Attack",
  "1944": "1944: The Loop Master", mmatrix: "Mars Matrix", progear: "Progear", pang: "Pang", tmnt: "Teenage Mutant Ninja Turtles",
  simpsons: "The Simpsons", ssriders: "Sunset Riders", dstlk: "Darkstalkers", nightwar: "Night Warriors", vsav: "Vampire Savior",
  "3wonders": "Three Wonders", sfiii3: "Street Fighter III: 3rd Strike", bublbobl: "Bubble Bobble", galaga: "Galaga", pacman: "Pac-Man",
  mspacman: "Ms. Pac-Man", dkong: "Donkey Kong", 1942: "1942", gng: "Ghosts 'n Goblins", ghouls: "Ghouls'n Ghosts", strider: "Strider",
  mk: "Mortal Kombat", mk2: "Mortal Kombat II", nbajam: "NBA Jam", wwfmania: "WWF WrestleMania", raiden: "Raiden", raiden2: "Raiden II",
  tekken: "Tekken", kov: "Knights of Valour", kovplus: "Knights of Valour Plus", orlegend: "Oriental Legend",
};

function systemFromFolder(rel) {
  const parts = rel.split(/[\\/]/).slice(0, -1);
  for (const p of parts) {
    const s = FOLDER_ALIASES[p.toLowerCase().trim()];
    if (s) return s;
  }
  return null;
}
// Folder konsol tingkat pertama (Games/<folder>/...) atau null kalau file di luar folder konsol
function topConsoleFolder(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.length < 2) return null;
  return FOLDER_ALIASES[parts[0].toLowerCase().trim()] || null;
}

// Membaca daftar nama file di dalam ZIP (central directory) tanpa membongkar isinya
function zipEntries(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const tail = Math.min(size, 65557);
    const buf = Buffer.alloc(tail);
    fs.readSync(fd, buf, 0, tail, size - tail);
    let eocd = -1;
    for (let i = tail - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return [];
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOff = buf.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff || cdSize > 16 * 1024 * 1024) return [];
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const names = [];
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const nLen = cd.readUInt16LE(p + 28), xLen = cd.readUInt16LE(p + 30), cLen = cd.readUInt16LE(p + 32);
      names.push(cd.toString("utf8", p + 46, p + 46 + nLen));
      p += 46 + nLen + xLen + cLen;
    }
    return names;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

// Lokasi 7za: di dalam paket .asar, file biner harus diambil dari folder .asar.unpacked
let sevenZipPath = null;
function sevenZip() {
  if (sevenZipPath !== null) return sevenZipPath;
  try {
    let p = require("7zip-bin").path7za.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
    if (process.platform !== "win32") try { fs.chmodSync(p, 0o755); } catch {}
    sevenZipPath = fs.existsSync(p) ? p : "";
  } catch { sevenZipPath = ""; }
  return sevenZipPath;
}

const listCache = new Map();
// Daftar nama file di dalam arsip .zip / .7z (tanpa membongkar isinya)
function archiveEntries(file) {
  const ext = file.split(".").pop().toLowerCase();
  let key;
  try { const st = fs.statSync(file); key = file + "|" + st.size + "|" + st.mtimeMs; } catch { return []; }
  if (listCache.has(key)) return listCache.get(key);
  let names = [];
  if (ext === "zip") names = zipEntries(file);
  else if (ext === "7z" && sevenZip()) {
    try {
      const out = require("child_process").execFileSync(sevenZip(), ["l", "-slt", "-ba", "-sccUTF-8", file], { encoding: "utf8", timeout: 15000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      names = out.split(/\r?\n/).filter((l) => l.startsWith("Path = ")).map((l) => l.slice(7));
    } catch { names = []; }
  }
  listCache.set(key, names);
  return names;
}

// Menebak konsol dari isi arsip. confident = isi arsip jelas menunjukkan konsolnya
function systemFromArchive(file) {
  const names = archiveEntries(file);
  if (!names.length) return { system: null, confident: false };
  const counts = {};
  let bigBin = false;
  for (const n of names) {
    const ext = n.split(".").pop().toLowerCase();
    const s = EXT_SYSTEM[ext];
    if (s) counts[s] = (counts[s] || 0) + 1;
    if (ext === "bin" || ext === "img") bigBin = true;
  }
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (best) return { system: best, confident: true };
  // .bin tanpa .cue dan isi sedikit: kemungkinan disc PS1
  if (bigBin && names.length <= 3) return { system: "psx", confident: false };
  // banyak file tanpa ekstensi konsol yang dikenal = set ROM arcade
  return { system: "arcade", confident: false };
}

function cleanTitle(base, system) {
  if (system === "arcade" && ARCADE_TITLES[base.toLowerCase()]) return ARCADE_TITLES[base.toLowerCase()];
  let t = base.replace(/[_]+/g, " ");
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").replace(/\s{2,}/g, " ").trim();
  // "Legend of Zelda, The" -> "The Legend of Zelda"
  const m = t.match(/^(.*), (The|A|An)(\b.*)?$/i);
  if (m) t = `${m[2]} ${m[1]}${m[3] || ""}`;
  return t || base;
}

function regionTag(base) {
  const m = base.match(/\((USA|Europe|Japan|World|Asia|Korea|Brazil|USA, Europe|Japan, USA|En,[^)]*|Indonesia)\)/i);
  return m ? m[1] : "";
}

function idFor(rel) {
  return crypto.createHash("sha1").update(rel.toLowerCase().replace(/\\/g, "/")).digest("hex").slice(0, 12);
}

function walk(dir, base = dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function scan(gamesDir) {
  const files = walk(gamesDir);
  const byDir = new Map();
  for (const rel of files) {
    const d = path.dirname(rel);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(rel);
  }
  const games = [];
  for (const rel of files) {
    const full = path.join(gamesDir, rel);
    const fileName = path.basename(rel);
    const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
    const base = fileName.slice(0, fileName.length - (ext ? ext.length + 1 : 0));
    if (IGNORED_EXT.has(ext)) continue;
    const folderSys = systemFromFolder(rel);
    const siblings = byDir.get(path.dirname(rel)) || [];
    const hasSheet = siblings.some((s) => /\.(cue|m3u|ccd)$/i.test(s));

    let system = null, confident = false;
    if (DISC_PARTS.has(ext)) {
      // potongan disc (.bin dll) disatukan lewat .cue; .bin tunggal tanpa .cue dianggap disc PS1
      if (hasSheet || ext !== "bin") continue;
      if (folderSys && folderSys !== "psx") continue;
      system = "psx";
    } else if (ARCHIVE_EXT.has(ext)) {
      if (ARCADE_SUPPORT.has(base.toLowerCase())) continue;
      const guess = systemFromArchive(full);
      if (guess.confident) { system = guess.system; confident = true; }
      else if (!folderSys && guess.system === "arcade" && ARCADE_TITLES[base.toLowerCase()]) { system = "arcade"; confident = true; }
      else system = folderSys || guess.system || "arcade";
    } else if (EXT_SYSTEM[ext]) {
      system = EXT_SYSTEM[ext];
      confident = true;
      // .cue di dalam folder .m3u sudah diwakili oleh .m3u
      if ((ext === "cue" || ext === "chd") && siblings.some((s) => /\.m3u$/i.test(s))) continue;
    } else {
      continue;
    }
    if (system === "psx" && PSX_BIOS.includes(fileName.toLowerCase())) continue;

    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    games.push({
      id: idFor(rel),
      rel: rel.replace(/\\/g, "/"),
      fileName,
      base,
      ext,
      system,
      title: cleanTitle(base, system),
      region: regionTag(base),
      size: stat.size,
      added: Math.round(stat.birthtimeMs || stat.mtimeMs),
      needsBundle: ["cue", "m3u", "ccd"].includes(ext),
      confident,
      folderSystem: topConsoleFolder(rel),
    });
  }
  return games;
}

// Mengumpulkan file yang dirujuk oleh .cue/.m3u/.ccd agar bisa dikirim sebagai satu paket ZIP
function bundleFiles(full) {
  const dir = path.dirname(full);
  const files = new Set([path.basename(full)]);
  const visit = (f) => {
    const ext = f.split(".").pop().toLowerCase();
    let text;
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch { return; }
    if (ext === "cue") {
      for (const m of text.matchAll(/^\s*FILE\s+"?([^"\r\n]+?)"?\s+\w+\s*$/gim)) {
        const name = m[1].replace(/\\/g, "/");
        if (fs.existsSync(path.join(dir, name)) && !files.has(name)) files.add(name);
      }
    } else if (ext === "m3u") {
      for (const line of text.split(/\r?\n/)) {
        const name = line.trim().replace(/\\/g, "/");
        if (!name || name.startsWith("#")) continue;
        if (fs.existsSync(path.join(dir, name)) && !files.has(name)) { files.add(name); visit(name); }
      }
    } else if (ext === "ccd") {
      const b = f.slice(0, -4);
      for (const e of [".img", ".sub"]) if (fs.existsSync(path.join(dir, b + e))) files.add(b + e);
    }
  };
  visit(path.basename(full));
  return [...files].map((n) => ({ name: n, full: path.join(dir, n) }));
}

const crcCache = new Map();
function crc32File(full) {
  const st = fs.statSync(full);
  const key = full + "|" + st.size + "|" + st.mtimeMs;
  if (crcCache.has(key)) return crcCache.get(key);
  let crc = 0;
  const fd = fs.openSync(full, "r");
  const buf = Buffer.alloc(8 * 1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) crc = zlib.crc32(buf.subarray(0, n), crc);
  } finally { fs.closeSync(fd); }
  crcCache.set(key, crc >>> 0);
  return crc >>> 0;
}

// ZIP tanpa kompresi (store) berisi .cue + .bin — EmulatorJS akan membongkarnya sendiri
function buildStoredZip(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const data = fs.readFileSync(e.full);
    const crc = crc32File(e.full);
    const name = Buffer.from(e.name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, end]);
}

// Rencana pemindahan file game ke folder konsol yang benar.
// Hanya untuk game yang konsolnya yakin terdeteksi (atau dipilih manual) tapi berada di folder lain.
function planMoves(gamesDir, games) {
  const plans = [];
  const taken = new Set();
  for (const g of games) {
    if (!g.confident) continue;
    if (g.folderSystem === g.system) continue;
    const target = SYSTEMS[g.system];
    if (!target) continue;
    const parts = g.rel.split("/");
    // buang folder konsol yang salah di depan; subfolder lain (mis. "Metal Slug X/") tetap dipertahankan
    const restParts = g.folderSystem ? parts.slice(1) : parts;
    const full = path.join(gamesDir, g.rel);
    const srcDir = path.dirname(full);
    const files = g.needsBundle ? bundleFiles(full).map((f) => f.full) : [full];
    for (const e of ["png", "jpg", "jpeg", "webp"]) {
      const side = path.join(srcDir, g.base + "." + e);
      if (fs.existsSync(side)) files.push(side);
    }
    // Hindari bentrok nama di folder tujuan
    let destDir = path.join(gamesDir, target.folder, ...restParts.slice(0, -1));
    let mainName = path.basename(full);
    const exists = (n) => fs.existsSync(path.join(destDir, n)) || taken.has(path.join(destDir, n).toLowerCase());
    if (exists(mainName)) {
      // kalau game punya subfolder sendiri, beri nama baru pada foldernya; kalau tidak, pada filenya
      let i = 2;
      if (g.needsBundle) {
        const baseDir = destDir;
        while (fs.existsSync(destDir) && exists(mainName)) destDir = `${baseDir} (${i++})`;
      } else {
        const ext = g.ext ? "." + g.ext : "";
        while (exists(mainName)) mainName = `${g.base} (${i++})${ext}`;
      }
    }
    const moves = files.map((f) => {
      const name = f === full ? mainName : path.relative(srcDir, f);
      const to = path.join(destDir, name);
      taken.add(to.toLowerCase());
      return { from: f, to };
    });
    const newRel = path.relative(gamesDir, path.join(destDir, mainName)).replace(/\\/g, "/");
    plans.push({ game: g, moves, newRel, newId: idFor(newRel) });
  }
  return plans;
}

// Menentukan apakah sebuah file (mis. di folder Downloads) adalah game atau BIOS yang dikenali.
// Hanya hasil yang yakin yang dikembalikan, supaya file lain di Downloads tidak diganggu.
function classifyFile(full) {
  const fileName = path.basename(full);
  const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  const base = fileName.slice(0, fileName.length - (ext ? ext.length + 1 : 0));
  if (PSX_BIOS.includes(fileName.toLowerCase())) return { kind: "bios", system: "psx", files: [full], title: fileName };
  if (ARCHIVE_EXT.has(ext)) {
    if (ARCADE_SUPPORT.has(base.toLowerCase())) return { kind: "bios", system: "arcade", files: [full], title: fileName };
    const g = systemFromArchive(full);
    if (g.confident) return { kind: "game", system: g.system, files: [full], title: cleanTitle(base, g.system) };
    if (g.system === "arcade" && ARCADE_TITLES[base.toLowerCase()]) return { kind: "game", system: "arcade", files: [full], title: cleanTitle(base, "arcade") };
    return null;
  }
  // .iso sengaja tidak dipakai: di Downloads lebih sering berupa image sistem operasi
  const DL_EXT = ["nes", "fds", "sfc", "smc", "gb", "gbc", "gba", "cue", "chd", "pbp", "m3u"];
  if (!DL_EXT.includes(ext)) return null;
  const system = EXT_SYSTEM[ext];
  const files = ["cue", "m3u", "ccd"].includes(ext) ? bundleFiles(full).map((f) => f.full) : [full];
  return { kind: "game", system, files, title: cleanTitle(base, system), bundle: files.length > 1 };
}

module.exports = { SYSTEMS, PSX_BIOS, scan, bundleFiles, buildStoredZip, zipEntries, archiveEntries, planMoves, idFor, classifyFile };
