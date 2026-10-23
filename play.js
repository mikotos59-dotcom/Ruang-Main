// Ruang Main — halaman pemutar (membungkus EmulatorJS)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const GAME_ID = params.get("id");
const MODE = params.get("mode") || "new";
const START_SLOT = params.get("slot");
const GRAPHICS = {
  asli: { name: "Asli", desc: "Piksel tajam seperti aslinya, tanpa filter.", shader: "disabled" },
  halus: { name: "Halus", desc: "Pinggiran piksel dihaluskan (ScaleHQ). Cocok untuk game 2D.", shader: "2xScaleHQ.glslp" },
  crt: { name: "TV jadul", desc: "Garis scanline seperti TV tabung. Ringan.", shader: "crt-easymode.glslp" },
  "crt-lengkung": { name: "TV tabung melengkung", desc: "Scanline plus layar sedikit melengkung. Lebih berat.", shader: "crt-geom.glslp" },
};
let graphics = "asli";
const SLOT_NAME = { auto: "Simpan otomatis", 1: "Slot 1", 2: "Slot 2", 3: "Slot 3", 4: "Slot 4" };

let info = null;
let started = false;
let leaving = false;
let menuOpen = false;
let frozenFrame = null; // gambar layar yang diambil tepat sebelum menu dibuka
let playSeconds = 0;
const sessionKey = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sessionStart = Date.now();

const emu = () => window.EJS_emulator;
const gm = () => window.EJS_emulator && window.EJS_emulator.gameManager;

function backToLibrary() { location.href = "rm://app/app/index.html"; }

function setLoading(title, hint, error = false) {
  $("#loadTitle").textContent = title;
  $("#loadHint").textContent = hint || "";
  $("#loading").classList.toggle("error", error);
}

// ---------- Mulai ----------
async function boot() {
  if (!GAME_ID) return backToLibrary();
  info = await rm.playInfo(GAME_ID);
  if (!info) {
    setLoading("Game tidak ditemukan", "File game mungkin sudah dipindah atau dihapus dari folder Games.", true);
    return;
  }
  await rm.setPlaying(true);
  const g = info.game;
  const sys = info.systems[g.system];
  document.title = `${g.title} — Ruang Main`;
  $("#menuTitle").textContent = g.title;
  $("#menuSys").textContent = sys.short;
  $("#menuSys").className = `sys-tag sys-${g.system}`;
  setLoading(g.title, `Memuat ${sys.name}…`);

  // Save state untuk dilanjutkan
  let stateUrl = null;
  if (MODE === "resume" || MODE === "slot") {
    const saves = await rm.listSaves(GAME_ID);
    const want = MODE === "resume" ? "auto" : START_SLOT;
    const s = saves.find((x) => x.slot === want && !x.empty);
    if (s) stateUrl = s.url;
  }

  window.EJS_player = "#game";
  window.EJS_core = info.system;
  window.EJS_gameUrl = info.gameUrl;
  window.EJS_gameName = g.base;
  window.EJS_gameID = GAME_ID;
  window.EJS_pathtodata = "rm://app/ejs/";
  window.EJS_language = "en-US";
  window.EJS_startOnLoaded = true;
  window.EJS_color = "#ffc94a";
  window.EJS_backgroundColor = "#000000";
  window.EJS_CacheLimit = 0; // file sudah ada di disk, tidak perlu disalin ke cache browser
  window.EJS_threads = false;
  if (info.biosUrl) window.EJS_biosUrl = info.biosUrl;
  if (info.dontExtract) window.EJS_dontExtractBIOS = true;
  if (stateUrl) window.EJS_loadStateURL = stateUrl;
  // Tombol save/load/foto bawaan diganti menu Ruang Main
  window.EJS_Buttons = {
    saveState: false, loadState: false, quickSave: false, quickLoad: false, screenshot: false,
    screenRecord: false, saveSavFiles: false, loadSavFiles: false, exitEmulation: false,
    netplay: false, cacheManager: false,
  };
  window.EJS_onGameStart = onStart;

  const s = document.createElement("script");
  s.src = "rm://app/ejs/loader.js";
  document.body.appendChild(s);

  // Pantau pesan error bawaan emulator agar bisa diberi petunjuk
  watchForErrors();
}

function watchForErrors() {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (started) return clearInterval(iv);
    const e = emu();
    if (e && e.failedToStart) {
      clearInterval(iv);
      const g = info.game;
      let hint = "Emulator gagal menjalankan file ini. Coba file lain atau periksa apakah file-nya lengkap.";
      if (g.system === "arcade") hint = "Set ROM arcade tidak cocok dengan versi FBNeo, atau butuh file BIOS/induk. Untuk game Neo Geo, pastikan neogeo.zip ada di folder BIOS.";
      if (g.system === "psx") hint = "Pastikan file .cue dan semua file .bin-nya berada di folder yang sama, atau pakai format .chd / .pbp.";
      setLoading("Game tidak bisa dimulai", hint, true);
      $("#loading").hidden = false;
    }
    if (Date.now() - t0 > 60000 && !started) {
      setLoading(info.game.title, "Masih memuat… game PS1 yang besar bisa butuh waktu sekitar satu menit.");
    }
  }, 500);
}

function applyGraphics(mode) {
  if (!GRAPHICS[mode]) mode = "asli";
  graphics = mode;
  try { emu().changeSettingOption("shader", GRAPHICS[mode].shader); } catch (err) { console.warn("Gagal menerapkan mode grafis", err); }
  const b = document.querySelector('[data-m="graphics"]');
  if (b) b.textContent = `Mode grafis: ${GRAPHICS[mode].name}`;
}

async function onStart() {
  started = true;
  applyGraphics(info.graphics);
  $("#loading").hidden = true;
  const e = emu();

  // Save bawaan game (SRAM/memory card): pulihkan dari folder Saves jika emulator belum punya
  try {
    const path = gm().getSaveFilePath();
    if (path && !gm().FS.analyzePath(path).exists) {
      const data = await rm.readSram(GAME_ID);
      if (data && data.length) {
        const parts = path.split("/"); let cur = "";
        for (const p of parts.slice(0, -1)) { if (!p) continue; cur += "/" + p; try { gm().FS.mkdir(cur); } catch {} }
        gm().FS.writeFile(path, data);
        gm().loadSaveFiles();
      }
    }
  } catch (err) { console.warn("Gagal memulihkan save game", err); }

  e.on("saveSaveFiles", (data) => { if (data && data.length) rm.writeSram(GAME_ID, data); });

  if (MODE === "resume" || MODE === "slot") {
    setTimeout(() => RM.toast(MODE === "resume" ? "Lanjut dari posisi terakhir" : `Dimuat dari ${SLOT_NAME[START_SLOT]}`), 300);
  }

  // Hitung waktu main (hanya saat game berjalan)
  setInterval(() => { if (!e.paused && !menuOpen && document.visibilityState === "visible") playSeconds++; }, 1000);
  setInterval(() => rm.sessionTick(sessionKey, GAME_ID, playSeconds, sessionStart), 30000);
  // Cadangan: simpan otomatis tiap 5 menit, dan save game ke disk tiap 45 detik
  setInterval(() => { if (!menuOpen && !leaving) autoSave(true); }, 5 * 60 * 1000);
  setInterval(() => { try { gm().saveSaveFiles(); } catch {} }, 45000);
}

// ---------- Gambar layar & state ----------
async function captureFrame() {
  const e = emu();
  if (!e || !started) return null;
  try {
    const { blob } = await e.takeScreenshot("canvas", "png", 1);
    return blob || null;
  } catch { return null; }
}
async function blobBytes(b) { return b ? new Uint8Array(await b.arrayBuffer()) : null; }

async function writeState(slot, frame) {
  if (!started) return false;
  if (!gm().supportsStates()) { RM.toast("Core emulator ini tidak mendukung save state"); return false; }
  let state;
  try { state = gm().getState(); } catch { RM.toast("Gagal menyimpan state"); return false; }
  const png = await blobBytes(frame || (await captureFrame()));
  return rm.writeSave(GAME_ID, slot, state.slice(), png);
}

async function loadSlot(slot) {
  const saves = await rm.listSaves(GAME_ID);
  const s = saves.find((x) => x.slot === slot && !x.empty);
  if (!s) { RM.toast(`${SLOT_NAME[slot]} masih kosong`); return false; }
  const buf = new Uint8Array(await (await fetch(s.url)).arrayBuffer());
  gm().loadState(buf);
  RM.toast(`Dimuat dari ${SLOT_NAME[slot]}`);
  return true;
}

async function autoSave(silent) {
  const ok = await writeState("auto", frozenFrame);
  try { const sav = gm().getSaveFile(); if (sav && sav.length) await rm.writeSram(GAME_ID, sav); } catch {}
  await rm.sessionTick(sessionKey, GAME_ID, playSeconds, sessionStart);
  if (!silent && ok) RM.toast("Posisi disimpan");
  return ok;
}

async function saveAndLeave() {
  if (leaving) return;
  leaving = true;
  if (started) {
    if (!menuOpen) frozenFrame = await captureFrame();
    try { await autoSave(true); } catch (err) { console.warn(err); }
  }
  await rm.setPlaying(false);
}

async function screenshot(frame) {
  const b = frame || (await captureFrame());
  if (!b) return RM.toast("Foto layar gagal");
  await rm.saveShot(GAME_ID, await blobBytes(b));
  RM.toast("Foto layar disimpan ke Galeri");
}

// ---------- Menu jeda ----------
async function openMenu() {
  if (!started || menuOpen || leaving) return;
  frozenFrame = await captureFrame();
  emu().pause(true);
  menuOpen = true;
  const bg = $("#menuBg");
  if (bg.dataset.url) URL.revokeObjectURL(bg.dataset.url);
  if (frozenFrame) { bg.dataset.url = URL.createObjectURL(frozenFrame); bg.style.backgroundImage = `url(${bg.dataset.url})`; }
  $("#menuTime").textContent = `Sesi ini: ${RM.duration(playSeconds)}`;
  $("#slotPanel").hidden = true;
  $$(".menu-list button").forEach((b) => b.classList.remove("on"));
  $("#menu").hidden = false;
  $("#menuHint").classList.remove("show");
  $('[data-m="resume"]').focus();
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  $("#menu").hidden = true;
  emu().play(true);
  frozenFrame = null;
  try { emu().elements.parent.focus(); } catch {}
}

function showGraphics() {
  $$(".menu-list button").forEach((b) => b.classList.toggle("on", b.dataset.m === "graphics"));
  $("#slotHeading").textContent = "Mode grafis untuk game ini";
  $("#slotGrid").innerHTML = Object.entries(GRAPHICS).map(([k, g]) => `
    <button class="slot gfx ${k === graphics ? "current" : ""}" data-g="${k}">
      <div class="nm">${g.name}${k === graphics ? " · dipakai" : ""}</div>
      <div class="tm">${g.desc}</div>
    </button>`).join("");
  $("#slotPanel").hidden = false;
  $$("#slotGrid [data-g]").forEach((b) => b.addEventListener("click", async () => {
    applyGraphics(b.dataset.g);
    await rm.updateGame(GAME_ID, { graphics: b.dataset.g });
    closeMenu();
    RM.toast(`Mode grafis: ${GRAPHICS[b.dataset.g].name}`);
  }));
  ($("#slotGrid .current") || $("#slotGrid .slot")).focus();
}

async function showSlots(kind) {
  $$(".menu-list button").forEach((b) => b.classList.toggle("on", b.dataset.m === kind));
  const saves = await rm.listSaves(GAME_ID);
  const slots = kind === "save" ? saves.filter((s) => s.slot !== "auto") : saves;
  $("#slotHeading").textContent = kind === "save" ? "Simpan ke slot mana?" : "Muat dari slot mana?";
  $("#slotGrid").innerHTML = slots.map((s) => `
    <button class="slot" data-slot="${s.slot}" ${kind === "load" && s.empty ? "disabled" : ""}>
      <div class="shot">${s.thumb ? `<img src="${s.thumb}" alt="">` : s.empty ? "Kosong" : "Tanpa gambar"}</div>
      <div class="nm">${SLOT_NAME[s.slot]}</div>
      <div class="tm">${s.empty ? (kind === "save" ? "Belum dipakai" : "—") : RM.dateTime(s.time)}${kind === "save" && !s.empty ? " · akan ditimpa" : ""}</div>
    </button>`).join("");
  $("#slotPanel").hidden = false;
  $$("#slotGrid .slot").forEach((b) => b.addEventListener("click", async () => {
    const slot = b.dataset.slot;
    if (kind === "save") {
      if (await writeState(slot, frozenFrame)) { RM.toast(`Tersimpan di ${SLOT_NAME[slot]}`); closeMenu(); }
    } else {
      closeMenu();
      setTimeout(() => loadSlot(slot), 60);
    }
  }));
  $("#slotGrid .slot:not([disabled])")?.focus();
}

$$(".menu-list button").forEach((b) => b.addEventListener("click", async () => {
  const m = b.dataset.m;
  if (m === "resume") return closeMenu();
  if (m === "save" || m === "load") return showSlots(m);
  if (m === "graphics") return showGraphics();
  if (m === "shot") { await screenshot(frozenFrame); return; }
  if (m === "restart") {
    if (!confirm("Mulai ulang game dari awal? Progres yang belum disimpan akan hilang.")) return;
    closeMenu(); gm().restart(); return;
  }
  if (m === "exit") { await saveAndLeave(); backToLibrary(); }
}));

// ---------- Keyboard & stik ----------
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    e.preventDefault(); e.stopPropagation();
    if (!started) return;
    if (menuOpen) { if (!$("#slotPanel").hidden) { $("#slotPanel").hidden = true; $$(".menu-list button").forEach((b) => b.classList.remove("on")); $('[data-m="resume"]').focus(); } else closeMenu(); }
    else openMenu();
    return;
  }
  if (!started || menuOpen) return;
  if (e.key === "F5") { e.preventDefault(); e.stopPropagation(); if (await writeState("1")) RM.toast("Simpan cepat ke Slot 1"); }
  if (e.key === "F9") { e.preventDefault(); e.stopPropagation(); loadSlot("1"); }
  if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); screenshot(); }
}, true);

let comboHeld = false;
RM.gamepad({
  enabled: () => menuOpen,
  move(dx, dy) {
    const items = $$("#menu button:not([disabled])").filter((el) => el.offsetParent !== null);
    RM.spatialMove(items, dx, dy);
  },
  a() { document.activeElement?.click(); },
  b() {
    if (!$("#slotPanel").hidden) { $("#slotPanel").hidden = true; $('[data-m="resume"]').focus(); }
    else closeMenu();
  },
  combo(gp) {
    const both = gp.buttons[8]?.pressed && gp.buttons[9]?.pressed;
    if (both && !comboHeld) { menuOpen ? closeMenu() : openMenu(); }
    comboHeld = !!both;
  },
});

// Tampilkan petunjuk menu saat mouse bergerak
let hintTimer;
document.addEventListener("mousemove", () => {
  if (!started || menuOpen) return;
  $("#menuHint").classList.add("show");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => $("#menuHint").classList.remove("show"), 2200);
});
$("#menuHint").addEventListener("click", openMenu);
$("#loadBack").addEventListener("click", async () => { await rm.setPlaying(false); backToLibrary(); });

// Jendela ditutup saat bermain: simpan dulu, baru tutup
rm.on("app:will-close", async () => { await saveAndLeave(); rm.canClose(); });

boot();
