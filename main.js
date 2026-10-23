// Ruang Main — launcher game jadul (proses utama Electron)
const { app, BrowserWindow, protocol, net, ipcMain, shell, dialog, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { SYSTEMS, PSX_BIOS, scan, bundleFiles, buildStoredZip, planMoves, classifyFile } = require("./lib/library");
const { Store } = require("./lib/store");

const APP_NAME = "Ruang Main";
app.setName(APP_NAME);
// PC lama dengan driver grafis yang "diblokir" Chromium tetap boleh memakai WebGL
app.commandLine.appendSwitch("ignore-gpu-blocklist");

protocol.registerSchemesAsPrivileged([
  { scheme: "rm", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------- Lokasi data ----------
function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const t = path.join(dir, ".tulis-uji");
    fs.writeFileSync(t, "ok"); fs.unlinkSync(t);
    return true;
  } catch { return false; }
}
function resolveDataDir() {
  if (process.env.RUANGMAIN_DATA) return process.env.RUANGMAIN_DATA;
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const d = path.join(process.env.PORTABLE_EXECUTABLE_DIR, "RuangMain-Data");
    if (writable(d)) return d;
  }
  if (app.isPackaged) {
    const d = path.join(path.dirname(process.execPath), "RuangMain-Data");
    if (writable(d)) return d;
    return path.join(app.getPath("documents"), APP_NAME);
  }
  return path.join(__dirname, "RuangMain-Data");
}

let DATA, DIRS, store;
function initData() {
  DATA = resolveDataDir();
  DIRS = {
    games: path.join(DATA, "Games"),
    bios: path.join(DATA, "BIOS"),
    saves: path.join(DATA, "Saves"),
    shots: path.join(DATA, "Screenshots"),
    covers: path.join(DATA, "Covers"),
  };
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(DIRS.covers, "auto"), { recursive: true });
  for (const s of Object.values(SYSTEMS)) fs.mkdirSync(path.join(DIRS.games, s.folder), { recursive: true });
  const readme = path.join(DIRS.games, "BACA DULU.txt");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      "Taruh file game di folder ini. Ruang Main akan mendeteksinya otomatis.",
      "",
      "Subfolder membantu aplikasi mengenali konsolnya:",
      "  Arcade  -> .zip set ROM arcade / Neo Geo (contoh: mslug.zip)",
      "  NES     -> .nes",
      "  SNES    -> .sfc .smc",
      "  GB      -> .gb .gbc",
      "  GBA     -> .gba",
      "  PS1     -> .cue+.bin, .chd, .pbp, .m3u (multi-disc)",
      "",
      "File .zip/.7z juga bisa. Isinya dicek, lalu file dipindah otomatis ke folder konsol yang benar.",
      "Jadi kamu boleh menaruh file langsung di folder Games ini.",
      "Game Neo Geo butuh BIOS neogeo.zip di folder BIOS.",
      "Cover sendiri: taruh gambar bernama sama dengan game (contoh: mslug.png).",
    ].join("\r\n"));
  }
  store = new Store(path.join(DATA, "ruangmain.json"));
}

// ---------- Pustaka ----------
let games = [];
let byId = new Map();
// Konsol yang dipilih manual oleh pengguna mengalahkan hasil deteksi
function applyOverrides(list) {
  for (const g of list) {
    const m = store.peek(g.id);
    if (m.system && SYSTEMS[m.system]) { g.detectedSystem = g.system; g.system = m.system; g.confident = true; g.manual = true; }
  }
  return list;
}

function moveDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!fs.existsSync(to)) { fs.renameSync(from, to); return; }
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    if (!fs.existsSync(b)) fs.renameSync(a, b);
  }
  try { fs.rmSync(from, { recursive: true, force: true }); } catch {}
}

// Save state & save game dibuat oleh core konsol tertentu; kalau konsolnya berubah, simpan sebagai cadangan
function retireSaves(id, reason) {
  const d = path.join(DIRS.saves, id);
  if (!fs.existsSync(d) || !fs.readdirSync(d).length) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  moveDir(d, path.join(DIRS.saves, "_cadangan-konsol-lama", `${id}_${reason}_${stamp}`));
  const m = store.game(id);
  delete m.saveSystem;
  store.save();
}

// Data (statistik, save, foto, cover) mengikuti game saat file-nya dipindah
function migrateGame(oldId, newId) {
  if (oldId === newId) return;
  const d = store.data;
  if (d.games[oldId]) { d.games[newId] = { ...d.games[oldId], ...(d.games[newId] || {}) }; delete d.games[oldId]; }
  for (const s of d.sessions) if (s.id === oldId) s.id = newId;
  moveDir(path.join(DIRS.saves, oldId), path.join(DIRS.saves, newId));
  moveDir(path.join(DIRS.shots, oldId), path.join(DIRS.shots, newId));
  const m = d.games[newId];
  if (m && m.cover) {
    const ext = m.cover.split(".").pop();
    try { fs.renameSync(path.join(DIRS.covers, m.cover), path.join(DIRS.covers, `${newId}.${ext}`)); m.cover = `${newId}.${ext}`; } catch {}
  }
  try { fs.renameSync(path.join(DIRS.covers, "auto", oldId + ".png"), path.join(DIRS.covers, "auto", newId + ".png")); } catch {}
  store.save();
}

const fileIsSettled = (f) => { try { return Date.now() - fs.statSync(f).mtimeMs > 4000; } catch { return false; } };
let sortRetry = null;
let pendingSorted = []; // daftar game yang baru dirapikan, diberitahukan ke tampilan sekali

// Memindahkan file game yang salah folder ke folder konsolnya
function autoSort() {
  if (!store.data.settings.autoSort) return [];
  const done = [];
  let pending = false;
  for (const p of planMoves(DIRS.games, games)) {
    // file yang baru saja disalin mungkin belum selesai; coba lagi nanti
    if (p.moves.some((m) => !fileIsSettled(m.from))) { pending = true; continue; }
    const moved = [];
    try {
      for (const m of p.moves) {
        fs.mkdirSync(path.dirname(m.to), { recursive: true });
        fs.renameSync(m.from, m.to);
        moved.push(m);
      }
    } catch (e) {
      for (const m of moved.reverse()) try { fs.renameSync(m.to, m.from); } catch {}
      pending = true;
      continue;
    }
    const g = p.game;
    // save dari konsol lama tidak bisa dipakai konsol baru
    const meta = store.peek(g.id);
    const oldSys = meta.saveSystem || (g.folderSystem && !g.manual ? g.folderSystem : g.detectedSystem);
    if (oldSys && oldSys !== g.system) retireSaves(g.id, oldSys);
    migrateGame(g.id, p.newId);
    // bersihkan folder asal yang jadi kosong (kecuali folder Games dan folder konsol)
    const srcDir = path.dirname(path.join(DIRS.games, g.rel));
    const isConsoleRoot = Object.values(SYSTEMS).some((s) => path.join(DIRS.games, s.folder).toLowerCase() === srcDir.toLowerCase());
    if (srcDir !== DIRS.games && !isConsoleRoot) try { if (!fs.readdirSync(srcDir).length) fs.rmdirSync(srcDir); } catch {}
    done.push({ id: p.newId, title: store.peek(p.newId).title || g.title, to: SYSTEMS[g.system].folder, from: g.folderSystem ? SYSTEMS[g.folderSystem].folder : "Games" });
  }
  if (pending) {
    clearTimeout(sortRetry);
    sortRetry = setTimeout(() => { rescan(); send("lib:changed"); }, 5000);
  }
  return done;
}

function rescan() {
  games = applyOverrides(scan(DIRS.games));
  const moved = autoSort();
  if (moved.length) {
    games = applyOverrides(scan(DIRS.games));
    pendingSorted.push(...moved);
    send("lib:changed");
  }
  // save lama yang dibuat dengan konsol berbeda dipindah ke cadangan
  for (const g of games) {
    const m = store.peek(g.id);
    if (m.saveSystem && m.saveSystem !== g.system) retireSaves(g.id, m.saveSystem);
  }
  byId = new Map(games.map((g) => [g.id, g]));
  queueAutoCovers();
  return games;
}

const IMG_EXT = ["png", "jpg", "jpeg", "webp"];
function fileUrl(kind, rel, full) {
  let v = 0;
  try { v = Math.round(fs.statSync(full).mtimeMs); } catch {}
  return `rm://app/${kind}/${rel.split("/").map(encodeURIComponent).join("/")}?v=${v}`;
}
function coverFor(g) {
  const meta = store.peek(g.id);
  if (meta.cover) {
    const f = path.join(DIRS.covers, meta.cover);
    if (fs.existsSync(f)) return { url: fileUrl("cover", meta.cover, f), kind: "custom" };
  }
  const dir = path.dirname(path.join(DIRS.games, g.rel));
  for (const e of IMG_EXT) {
    const f = path.join(dir, g.base + "." + e);
    if (fs.existsSync(f)) return { url: fileUrl("gamefile", g.id + "/" + g.base + "." + e, f), kind: "sidecar" };
  }
  const auto = path.join(DIRS.covers, "auto", g.id + ".png");
  if (fs.existsSync(auto)) return { url: fileUrl("cover", "auto/" + g.id + ".png", auto), kind: "boxart" };
  const snap = path.join(DIRS.saves, g.id, "auto.png");
  if (fs.existsSync(snap)) return { url: fileUrl("save", g.id + "/auto.png", snap), kind: "snapshot" };
  return null;
}
function publicGame(g) {
  const meta = store.peek(g.id);
  const autoState = path.join(DIRS.saves, g.id, "auto.state");
  const snap = path.join(DIRS.saves, g.id, "auto.png");
  return {
    ...g,
    title: meta.title || g.title,
    originalTitle: g.title,
    manual: !!g.manual,
    detectedSystem: g.detectedSystem || g.system,
    favorite: !!meta.favorite,
    graphics: meta.graphics || null,
    seconds: meta.seconds || 0,
    plays: meta.plays || 0,
    lastPlayed: meta.lastPlayed || 0,
    firstPlayed: meta.firstPlayed || 0,
    cover: coverFor(g),
    resume: fs.existsSync(autoState) ? {
      time: Math.round(fs.statSync(autoState).mtimeMs),
      thumb: fs.existsSync(snap) ? fileUrl("save", g.id + "/auto.png", snap) : null,
    } : null,
  };
}
function biosStatus() {
  const neogeo = fs.existsSync(path.join(DIRS.bios, "neogeo.zip"));
  const psx = PSX_BIOS.find((b) => fs.existsSync(path.join(DIRS.bios, b))) || null;
  return { neogeo, psx };
}

// ---------- Cover otomatis (libretro-thumbnails) ----------
const THUMB_REPO = {
  nes: "Nintendo - Nintendo Entertainment System",
  snes: "Nintendo - Super Nintendo Entertainment System",
  gb: "Nintendo - Game Boy",
  gbc: "Nintendo - Game Boy Color",
  gba: "Nintendo - Game Boy Advance",
  psx: "Sony - PlayStation",
};
let coverQueue = [], coverBusy = false, coverNotify = null;
function queueAutoCovers() {
  if (!store.data.settings.autoCovers) return;
  coverQueue = games.filter((g) => {
    if (g.system === "arcade") return false;
    const m = store.peek(g.id);
    if (m.thumbMiss || m.cover) return false;
    return !coverFor(g) || coverFor(g).kind === "snapshot";
  });
  runCoverQueue();
}
async function runCoverQueue() {
  if (coverBusy) return;
  coverBusy = true;
  while (coverQueue.length && store.data.settings.autoCovers) {
    const g = coverQueue.shift();
    if (!byId.has(g.id)) continue;
    const repoName = g.system === "gb" && g.ext === "gbc" ? THUMB_REPO.gbc : THUMB_REPO[g.system];
    let name = g.base;
    if (g.ext === "zip" || g.ext === "7z") name = g.base;
    name = name.replace(/[&*\/:`<>?\\|"]/g, "_");
    const url = `https://raw.githubusercontent.com/libretro-thumbnails/${encodeURIComponent(repoName.replace(/ /g, "_"))}/master/Named_Boxarts/${encodeURIComponent(name)}.png`;
    try {
      const res = await net.fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(path.join(DIRS.covers, "auto", g.id + ".png"), buf);
        clearTimeout(coverNotify);
        coverNotify = setTimeout(() => send("lib:changed"), 600);
      } else if (res.status === 404) {
        store.game(g.id).thumbMiss = true; store.save();
      }
    } catch { /* offline: coba lagi lain kali */ break; }
  }
  coverBusy = false;
}

// ---------- Pemantau folder ----------
let watchTimer = null, watcher = null;
function startWatch() {
  try {
    watcher = fs.watch(DIRS.games, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => { rescan(); send("lib:changed"); }, 900);
    });
  } catch {
    setInterval(() => {
      const before = games.map((g) => g.id + g.size).join();
      rescan();
      if (games.map((g) => g.id + g.size).join() !== before) send("lib:changed");
    }, 5000);
  }
}


// ---------- Pantau folder Downloads ----------
// File game yang baru diunduh lewat browser ditawarkan untuk dipindah ke pustaka.
let dlWatcher = null, dlTimer = null, dlInterval = null;
let dlFound = [];
function downloadsDir() { return store.data.settings.downloadsDir || app.getPath("downloads"); }
function dlSeen() { if (!store.data.dlSeen) store.data.dlSeen = {}; return store.data.dlSeen; }
function dlKeyOf(name, size) { return name.toLowerCase() + "|" + size; }

function scanDownloads(includeSeen) {
  const dir = downloadsDir();
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (/\.(crdownload|part|partial|tmp|download|opdownload)$/i.test(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    const key = dlKeyOf(name, st.size);
    if (!includeSeen && dlSeen()[key]) continue;
    if (Date.now() - st.mtimeMs < 2500) continue; // masih ditulis
    const c = classifyFile(full);
    if (!c) continue;
    const size = c.files.reduce((t, f) => { try { return t + fs.statSync(f).size; } catch { return t; } }, 0);
    out.push({ key, name, full, size, kind: c.kind, system: c.system, title: c.title, files: c.files });
  }
  return out;
}

function publishFound() {
  send("dl:found", dlFound.map(({ key, name, size, kind, system, title }) => ({ key, name, size, kind, system, title })));
}

function checkDownloads(manual) {
  if (!manual && !store.data.settings.watchDownloads) return [];
  const found = scanDownloads(manual);
  if (!manual && store.data.settings.autoImport) {
    const done = [];
    for (const f of found) { const r = importItem(f); if (r) done.push(r); }
    if (done.length) { pendingSorted.push(...done.map((d) => ({ title: d.title, to: d.to }))); send("lib:changed"); }
    return found;
  }
  for (const f of found) if (!dlFound.some((x) => x.key === f.key)) dlFound.push(f);
  publishFound();
  return found;
}

function moveFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    // beda drive (mis. Downloads di C:, Ruang Main di D:): salin lalu hapus
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}
function freeName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const dot = name.lastIndexOf(".");
  const b = dot > 0 ? name.slice(0, dot) : name, e = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (fs.existsSync(path.join(dir, `${b} (${i})${e}`))) i++;
  return `${b} (${i})${e}`;
}

function importItem(item) {
  try {
    if (item.kind === "bios") {
      const to = path.join(DIRS.bios, path.basename(item.full));
      if (fs.existsSync(to)) fs.unlinkSync(to);
      moveFile(item.full, to);
      dlSeen()[item.key] = "moved"; store.save();
      return { title: item.name, to: "BIOS" };
    }
    const sys = SYSTEMS[item.system];
    let destDir = path.join(DIRS.games, sys.folder);
    if (item.files.length > 1) {
      // disc dengan beberapa file (.cue + .bin) disimpan dalam subfolder sendiri
      const base = path.basename(item.full).replace(/\.[^.]+$/, "");
      destDir = path.join(destDir, freeName(destDir, base));
    }
    const srcDir = path.dirname(item.full);
    const mainName = freeName(destDir, path.basename(item.full));
    for (const f of item.files) {
      const name = f === item.full ? mainName : path.relative(srcDir, f);
      moveFile(f, path.join(destDir, name));
    }
    dlSeen()[item.key] = "moved"; store.save();
    return { title: item.title, to: sys.folder };
  } catch (e) {
    console.error("Gagal memindahkan dari Downloads:", e);
    return null;
  }
}

function startDownloadsWatch() {
  if (dlWatcher) { try { dlWatcher.close(); } catch {} dlWatcher = null; }
  clearInterval(dlInterval);
  if (!store.data.settings.watchDownloads) return;
  const dir = downloadsDir();
  // Pertama kali: file lama di Downloads tidak ditawarkan (bisa dicek manual lewat pengaturan)
  if (!store.data.dlBaseline || store.data.dlBaseline !== dir) {
    for (const f of scanDownloads(true)) dlSeen()[f.key] = "lama";
    store.data.dlBaseline = dir; store.save();
  }
  try {
    dlWatcher = fs.watch(dir, () => {
      clearTimeout(dlTimer);
      dlTimer = setTimeout(() => checkDownloads(false), 3000);
    });
  } catch {}
  dlInterval = setInterval(() => checkDownloads(false), 30000);
}

// ---------- Protokol rm:// ----------
const MIME = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", wasm: "application/wasm",
  data: "application/octet-stream", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml",
  woff2: "font/woff2", zip: "application/zip" };
function inside(base, target) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
const APP_DIR = path.join(__dirname, "app");
async function serveFile(full, method = "GET") {
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return new Response("Tidak ditemukan", { status: 404 });
  const ext = full.split(".").pop().toLowerCase();
  const headers = new Headers({ "Cache-Control": "no-cache", "Content-Length": String(fs.statSync(full).size) });
  if (MIME[ext]) headers.set("Content-Type", MIME[ext]);
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  // Berkas aplikasi bisa berada di dalam arsip .asar: baca langsung dengan fs
  if (full.startsWith(APP_DIR)) {
    return new Response(await fs.promises.readFile(full), { status: 200, headers });
  }
  const res = await net.fetch(pathToFileURL(full).toString());
  return new Response(res.body, { status: 200, headers });
}
let bundleCache = { id: null, buf: null };
let currentGame = null; // game yang sedang dimainkan (untuk mencari BIOS di folder yang sama)

function registerProtocol() {
  const appDir = path.join(__dirname, "app");
  protocol.handle("rm", async (req) => {
    const u = new URL(req.url);
    const serve = (f) => serveFile(f, req.method);
    const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const [kind, ...rest] = parts;
    const sub = rest.join("/");
    switch (kind) {
      case "app": {
        const f = path.join(appDir, sub);
        return inside(appDir, f) ? serve(f) : new Response("", { status: 403 });
      }
      case "ejs": {
        const base = path.join(appDir, "ejs");
        const f = path.join(base, sub);
        return inside(base, f) ? serve(f) : new Response("", { status: 403 });
      }
      case "play": {
        // Halaman pemutar + berkas BIOS yang diminta dengan nama relatif (mis. neogeo.zip)
        const own = path.join(appDir, "play", sub);
        if (inside(path.join(appDir, "play"), own) && fs.existsSync(own)) return serve(own);
        const name = path.basename(sub);
        const candidates = [path.join(DIRS.bios, name)];
        if (currentGame) candidates.push(path.join(path.dirname(path.join(DIRS.games, currentGame.rel)), name));
        for (const c of candidates) if (fs.existsSync(c)) return serve(c);
        return new Response("BIOS tidak ditemukan", { status: 404 });
      }
      case "game": {
        const g = byId.get(rest[0]);
        if (!g) return new Response("Game tidak ditemukan", { status: 404 });
        const full = path.join(DIRS.games, g.rel);
        if (g.needsBundle) {
          if (req.method === "HEAD") return new Response(null, { status: 200 });
          if (bundleCache.id !== g.id) {
            bundleCache = { id: null, buf: null };
            bundleCache = { id: g.id, buf: buildStoredZip(bundleFiles(full)) };
          }
          return new Response(bundleCache.buf, { headers: { "Content-Type": "application/zip", "Content-Length": String(bundleCache.buf.length) } });
        }
        return serve(full);
      }
      case "gamefile": {
        // gambar sampul yang ada di samping file game
        const g = byId.get(rest[0]);
        if (!g) return new Response("", { status: 404 });
        const f = path.join(path.dirname(path.join(DIRS.games, g.rel)), rest.slice(1).join("/"));
        return IMG_EXT.includes(f.split(".").pop().toLowerCase()) ? serve(f) : new Response("", { status: 403 });
      }
      case "save": { const f = path.join(DIRS.saves, sub); return inside(DIRS.saves, f) ? serve(f) : new Response("", { status: 403 }); }
      case "shot": { const f = path.join(DIRS.shots, sub); return inside(DIRS.shots, f) ? serve(f) : new Response("", { status: 403 }); }
      case "cover": { const f = path.join(DIRS.covers, sub); return inside(DIRS.covers, f) ? serve(f) : new Response("", { status: 403 }); }
    }
    return new Response("", { status: 404 });
  });
}

// ---------- Jendela ----------
let win = null, playing = false, allowClose = false;
function send(ch, ...args) { if (win && !win.isDestroyed()) win.webContents.send(ch, ...args); }

function createWindow() {
  const iconPath = path.join(__dirname, "build", "icon.png");
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: "#1d1a33",
    title: APP_NAME,
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  win.loadURL("rm://app/app/index.html");
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === "I" && input.control && input.shift) win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("rm://")) e.preventDefault(); });
  win.on("close", (e) => {
    if (playing && !allowClose) {
      e.preventDefault();
      send("app:will-close");
      setTimeout(() => { allowClose = true; win && !win.isDestroyed() && win.close(); }, 5000);
    }
  });
}

// ---------- IPC ----------
function saveDir(id) { const d = path.join(DIRS.saves, id); fs.mkdirSync(d, { recursive: true }); return d; }
const SLOTS = ["auto", "1", "2", "3", "4"];
const GRAPHICS = ["asli", "halus", "crt", "crt-lengkung"];

function registerIpc() {
  ipcMain.handle("lib:get", (_e, opts = {}) => {
    if (opts.rescan || !games.length) rescan();
    return {
      games: games.map(publicGame),
      systems: SYSTEMS,
      bios: biosStatus(),
      settings: store.data.settings,
      dataDir: DATA,
      version: app.getVersion(),
      sorted: pendingSorted.splice(0),
      downloadsDir: downloadsDir(),
    };
  });
  ipcMain.handle("lib:open", (_e, which) => {
    const map = { games: DIRS.games, bios: DIRS.bios, saves: DIRS.saves, shots: DIRS.shots, data: DATA };
    const target = map[which] || (SYSTEMS[which] && path.join(DIRS.games, SYSTEMS[which].folder));
    if (target) shell.openPath(target);
  });
  ipcMain.handle("game:reveal", (_e, id) => { const g = byId.get(id); if (g) shell.showItemInFolder(path.join(DIRS.games, g.rel)); });
  ipcMain.handle("game:update", (_e, id, patch) => {
    if (!byId.has(id)) return null;
    const m = store.game(id);
    if ("title" in patch) { const t = String(patch.title || "").trim().slice(0, 120); if (t) m.title = t; else delete m.title; }
    if ("favorite" in patch) m.favorite = !!patch.favorite;
    if ("graphics" in patch) { if (GRAPHICS.includes(patch.graphics)) m.graphics = patch.graphics; else delete m.graphics; }
    if ("system" in patch) {
      const g = byId.get(id);
      const before = g.system;
      if (patch.system && SYSTEMS[patch.system] && patch.system !== (g.detectedSystem || g.system)) m.system = patch.system;
      else delete m.system;
      const after = m.system || g.detectedSystem || g.system;
      if (after !== before) retireSaves(id, before);
      store.save();
      // pindai ulang (dan rapikan) lalu cari game yang sama berdasarkan file barunya
      const oldRel = g.rel;
      rescan();
      send("lib:changed");
      const found = byId.get(id) || games.find((x) => store.peek(x.id).system === m.system && x.fileName === g.fileName) || games.find((x) => x.rel === oldRel);
      return found ? publicGame(found) : null;
    }
    store.save();
    return publicGame(byId.get(id));
  });
  ipcMain.handle("game:cover-pick", async (_e, id) => {
    if (!byId.has(id)) return null;
    const r = await dialog.showOpenDialog(win, { title: "Pilih gambar cover", properties: ["openFile"], filters: [{ name: "Gambar", extensions: IMG_EXT }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const ext = r.filePaths[0].split(".").pop().toLowerCase();
    const name = `${id}.${ext}`;
    for (const e of IMG_EXT) try { fs.unlinkSync(path.join(DIRS.covers, `${id}.${e}`)); } catch {}
    fs.copyFileSync(r.filePaths[0], path.join(DIRS.covers, name));
    store.game(id).cover = name; store.save();
    return publicGame(byId.get(id));
  });
  ipcMain.handle("game:cover-from-shot", (_e, id, shotRel) => {
    const src = path.join(DIRS.shots, shotRel);
    if (!byId.has(id) || !inside(DIRS.shots, src) || !fs.existsSync(src)) return null;
    for (const e of IMG_EXT) try { fs.unlinkSync(path.join(DIRS.covers, `${id}.${e}`)); } catch {}
    fs.copyFileSync(src, path.join(DIRS.covers, `${id}.png`));
    store.game(id).cover = `${id}.png`; store.save();
    return publicGame(byId.get(id));
  });
  ipcMain.handle("game:cover-clear", (_e, id) => {
    const m = store.game(id);
    if (m.cover) try { fs.unlinkSync(path.join(DIRS.covers, m.cover)); } catch {}
    delete m.cover; delete m.thumbMiss; store.save();
    return byId.has(id) ? publicGame(byId.get(id)) : null;
  });

  // Info untuk halaman pemutar
  ipcMain.handle("play:info", (_e, id) => {
    const g = byId.get(id) || (rescan(), byId.get(id));
    if (!g) return null;
    currentGame = g;
    const dir = path.dirname(path.join(DIRS.games, g.rel));
    const bios = biosStatus();
    let biosUrl = null, dontExtract = false;
    if (g.system === "arcade" && (bios.neogeo || fs.existsSync(path.join(dir, "neogeo.zip")))) { biosUrl = "neogeo.zip"; dontExtract = true; }
    if (g.system === "psx" && bios.psx) biosUrl = "rm://app/play/" + bios.psx;
    return {
      game: publicGame(g),
      gameUrl: `rm://app/game/${g.id}/${encodeURIComponent(g.needsBundle ? g.base + ".zip" : g.fileName)}`,
      biosUrl, dontExtract,
      graphics: store.peek(g.id).graphics || store.data.settings.defaultGraphics || "asli",
      system: g.system,
      systems: SYSTEMS,
    };
  });
  ipcMain.handle("play:active", (_e, on) => { playing = !!on; allowClose = false; if (!on) currentGame = null; });
  ipcMain.handle("app:can-close", () => { allowClose = true; if (win && !win.isDestroyed()) win.close(); });

  // Save state
  ipcMain.handle("saves:list", (_e, id) => {
    const d = path.join(DIRS.saves, id);
    return SLOTS.map((slot) => {
      const st = path.join(d, slot + ".state"), png = path.join(d, slot + ".png");
      if (!fs.existsSync(st)) return { slot, empty: true };
      return {
        slot,
        time: Math.round(fs.statSync(st).mtimeMs),
        url: fileUrl("save", `${id}/${slot}.state`, st),
        thumb: fs.existsSync(png) ? fileUrl("save", `${id}/${slot}.png`, png) : null,
      };
    });
  });
  ipcMain.handle("saves:write", (_e, id, slot, state, png) => {
    if (!byId.has(id) || !SLOTS.includes(slot) || !state) return false;
    const d = saveDir(id);
    fs.writeFileSync(path.join(d, slot + ".state.tmp"), Buffer.from(state));
    fs.renameSync(path.join(d, slot + ".state.tmp"), path.join(d, slot + ".state"));
    if (png) fs.writeFileSync(path.join(d, slot + ".png"), Buffer.from(png));
    const m = store.game(id);
    if (m.saveSystem !== byId.get(id).system) { m.saveSystem = byId.get(id).system; store.save(); }
    return true;
  });
  ipcMain.handle("saves:delete", (_e, id, slot) => {
    if (!SLOTS.includes(slot)) return false;
    const d = path.join(DIRS.saves, id);
    for (const f of [slot + ".state", slot + ".png"]) try { fs.unlinkSync(path.join(d, f)); } catch {}
    return true;
  });
  // Save bawaan game (SRAM / memory card)
  ipcMain.handle("sram:read", (_e, id) => {
    const f = path.join(DIRS.saves, id, "game.sav");
    return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null;
  });
  ipcMain.handle("sram:write", (_e, id, data) => {
    if (!byId.has(id) || !data || !data.length) return false;
    const d = saveDir(id);
    fs.writeFileSync(path.join(d, "game.sav.tmp"), Buffer.from(data));
    fs.renameSync(path.join(d, "game.sav.tmp"), path.join(d, "game.sav"));
    const m = store.game(id);
    if (m.saveSystem !== byId.get(id).system) { m.saveSystem = byId.get(id).system; store.save(); }
    return true;
  });

  // Galeri
  ipcMain.handle("shot:save", (_e, id, png) => {
    if (!byId.has(id) || !png) return null;
    const d = path.join(DIRS.shots, id);
    fs.mkdirSync(d, { recursive: true });
    const now = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    const name = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}_${p2(now.getHours())}-${p2(now.getMinutes())}-${p2(now.getSeconds())}.png`;
    fs.writeFileSync(path.join(d, name), Buffer.from(png));
    return `${id}/${name}`;
  });
  ipcMain.handle("shots:list", () => {
    const out = [];
    for (const id of fs.readdirSync(DIRS.shots)) {
      const d = path.join(DIRS.shots, id);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) {
        if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
        const full = path.join(d, f);
        out.push({ rel: `${id}/${f}`, gameId: id, url: fileUrl("shot", `${id}/${f}`, full), time: Math.round(fs.statSync(full).mtimeMs) });
      }
    }
    return out.sort((a, b) => b.time - a.time);
  });
  ipcMain.handle("shot:delete", async (_e, rel) => {
    const f = path.join(DIRS.shots, rel);
    if (!inside(DIRS.shots, f)) return false;
    try { await shell.trashItem(f); } catch { fs.unlinkSync(f); }
    return true;
  });
  ipcMain.handle("shot:reveal", (_e, rel) => { const f = path.join(DIRS.shots, rel); if (inside(DIRS.shots, f)) shell.showItemInFolder(f); });

  // Statistik
  ipcMain.handle("session:tick", (_e, key, id, total, startedAt) => { if (byId.has(id)) store.sessionTick(key, id, total, startedAt); });
  ipcMain.handle("stats:get", () => ({ sessions: store.data.sessions, games: games.map(publicGame) }));

  ipcMain.handle("settings:set", (_e, patch) => {
    if ("links" in patch) {
      patch.links = (Array.isArray(patch.links) ? patch.links : [])
        .filter((l) => l && /^https?:\/\/[^\s]+$/i.test(l.url || ""))
        .slice(0, 50)
        .map((l) => ({ name: String(l.name || "").trim().slice(0, 60) || new URL(l.url).hostname, url: l.url }));
    }
    if ("defaultGraphics" in patch && !GRAPHICS.includes(patch.defaultGraphics)) delete patch.defaultGraphics;
    Object.assign(store.data.settings, patch);
    store.save();
    if (patch.autoCovers) { for (const m of Object.values(store.data.games)) delete m.thumbMiss; queueAutoCovers(); }
    if (patch.autoSort) rescan();
    if ("watchDownloads" in patch) startDownloadsWatch();
    return store.data.settings;
  });
  ipcMain.handle("app:open-url", (_e, url) => { if (/^https?:\/\/[^\s]+$/i.test(url)) shell.openExternal(url); });

  // Downloads
  ipcMain.handle("dl:list", () => dlFound.map(({ key, name, size, kind, system, title }) => ({ key, name, size, kind, system, title })));
  ipcMain.handle("dl:check", () => {
    const found = checkDownloads(true);
    return found.length;
  });
  ipcMain.handle("dl:import", (_e, keys) => {
    const done = [];
    for (const key of keys) {
      const item = dlFound.find((x) => x.key === key);
      if (!item) continue;
      const r = importItem(item);
      if (r) { done.push(r); dlFound = dlFound.filter((x) => x.key !== key); }
    }
    rescan();
    publishFound();
    return done;
  });
  ipcMain.handle("dl:dismiss", (_e, keys) => {
    for (const key of keys) { dlSeen()[key] = "abaikan"; dlFound = dlFound.filter((x) => x.key !== key); }
    store.save();
    publishFound();
  });
  ipcMain.handle("dl:pick-folder", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Pilih folder unduhan yang dipantau", defaultPath: downloadsDir(), properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    store.data.settings.downloadsDir = r.filePaths[0];
    store.save();
    startDownloadsWatch();
    return r.filePaths[0];
  });
  ipcMain.handle("dl:open-folder", () => shell.openPath(downloadsDir()));
}

// ---------- Mulai ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    initData();
    registerProtocol();
    registerIpc();
    rescan();
    startWatch();
    startDownloadsWatch();
    createWindow();
    if (process.env.RUANGMAIN_SMOKE) {
      require("./lib/smoke")(win, process.env.RUANGMAIN_SMOKE).then(() => { allowClose = true; app.quit(); });
    }
  });
  app.on("before-quit", () => store && store.flush());
  app.on("window-all-closed", () => app.quit());
}
