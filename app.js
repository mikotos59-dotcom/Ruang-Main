// Ruang Main — halaman pustaka, statistik, galeri
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7z"/></svg>',
  starO: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7zm0 4.9l-1.6 3.4-3.7.4 2.8 2.5-.8 3.7 3.3-1.9 3.3 1.9-.8-3.7 2.8-2.5-3.7-.4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15.4 5L8.4 12l7 7-1.4 1.4L5.6 12 14 3.6z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M8.6 5l7 7-7 7 1.4 1.4 8.4-8.4L10 3.6z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 8v7h2v-7zm0-4v2h2V6z"/></svg>',
};
const GFX_NAME = { asli: "Asli (piksel tajam)", halus: "Halus (ScaleHQ)", crt: "TV jadul (scanline)", "crt-lengkung": "TV tabung melengkung" };
const SLOT_NAME = { auto: "Simpan otomatis", 1: "Slot 1", 2: "Slot 2", 3: "Slot 3", 4: "Slot 4" };

const state = {
  lib: null,
  view: "library",
  filter: localStorage.getItem("rm.filter") || "all",
  sort: localStorage.getItem("rm.sort") || "recent",
  query: "",
  favOnly: false,
  shots: [],
  galleryGame: "all",
};

function launch(id, mode = "new", slot = "") {
  location.href = `rm://app/play/play.html?id=${encodeURIComponent(id)}&mode=${mode}${slot ? "&slot=" + slot : ""}`;
}
function gameById(id) { return state.lib.games.find((g) => g.id === id); }

// ---------- Pustaka ----------
async function loadLibrary(rescan = false) {
  state.lib = await rm.library({ rescan });
  const moved = state.lib.sorted || [];
  if (moved.length) {
    RM.toast(moved.length === 1
      ? `${moved[0].title} dipindah ke folder ${moved[0].to}`
      : `${moved.length} game dirapikan ke folder konsolnya`, 4500);
  }
  renderLibrary();
  if (state.view === "stats") renderStats();
  if (state.view === "gallery") renderGallery();
}

function renderHero() {
  const hero = $("#hero");
  const last = state.lib.games.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
  if (!last) { hero.innerHTML = ""; return; }
  const sys = state.lib.systems[last.system];
  const screen = last.resume?.thumb
    ? `<img src="${last.resume.thumb}" alt="Layar terakhir ${RM.esc(last.title)}">`
    : RM.coverHtml(last);
  hero.innerHTML = `
    <div class="hero sys-${last.system}">
      <div class="crt">${screen}</div>
      <div class="hero-info">
        <div class="eyebrow">${last.resume ? "Terakhir kamu berhenti di sini" : "Terakhir dimainkan"}</div>
        <h1>${RM.esc(last.title)}</h1>
        <div class="meta"><span class="sys-tag">${sys.short}</span> &nbsp;${RM.ago(last.lastPlayed)} · total ${RM.duration(last.seconds)}</div>
        <div class="actions">
          ${last.resume ? `<button class="btn primary" data-act="resume">${ICON.play}Lanjutkan</button>` : ""}
          <button class="btn ${last.resume ? "" : "primary"}" data-act="new">${last.resume ? "Mulai dari awal" : ICON.play + "Main lagi"}</button>
          <button class="btn" data-act="detail">Detail</button>
        </div>
      </div>
    </div>`;
  hero.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "detail") openDetail(last.id);
    else launch(last.id, a);
  }));
}

function renderChips() {
  const counts = {};
  for (const g of state.lib.games) counts[g.system] = (counts[g.system] || 0) + 1;
  const favs = state.lib.games.filter((g) => g.favorite).length;
  const chips = [`<button class="chip" data-f="all" aria-pressed="${state.filter === "all"}">Semua<b>${state.lib.games.length}</b></button>`];
  if (favs) chips.push(`<button class="chip" data-f="fav" aria-pressed="${state.filter === "fav"}" style="--c: var(--marquee)">Favorit<b>${favs}</b></button>`);
  for (const [k, s] of Object.entries(state.lib.systems)) {
    if (!counts[k]) continue;
    chips.push(`<button class="chip sys-${k}" data-f="${k}" aria-pressed="${state.filter === k}">${s.short}<b>${counts[k]}</b></button>`);
  }
  $("#chips").innerHTML = chips.join("");
  $$("#chips .chip").forEach((c) => c.addEventListener("click", () => {
    state.filter = c.dataset.f;
    localStorage.setItem("rm.filter", state.filter);
    renderChips(); renderGrid();
  }));
}

function visibleGames() {
  let list = state.lib.games;
  if (state.filter === "fav") list = list.filter((g) => g.favorite);
  else if (state.filter !== "all") list = list.filter((g) => g.system === state.filter);
  const q = state.query.trim().toLowerCase();
  if (q) list = list.filter((g) => g.title.toLowerCase().includes(q) || g.fileName.toLowerCase().includes(q));
  const by = {
    recent: (a, b) => (b.lastPlayed - a.lastPlayed) || a.title.localeCompare(b.title),
    name: (a, b) => a.title.localeCompare(b.title, "id"),
    time: (a, b) => (b.seconds - a.seconds) || a.title.localeCompare(b.title),
    added: (a, b) => b.added - a.added,
  }[state.sort];
  return [...list].sort(by);
}

function cardHtml(g) {
  const sys = state.lib.systems[g.system];
  const sub = g.seconds ? RM.duration(g.seconds) : (g.region || RM.size(g.size));
  return `<button class="card sys-${g.system}" data-id="${g.id}" title="${RM.esc(g.title)}">
    <div class="cart">
      ${RM.coverHtml(g)}
      ${g.favorite ? `<span class="fav" aria-label="Favorit">${ICON.star}</span>` : ""}
      <div class="label"><span>${sys.short}</span>${g.resume ? "<span>▶ tersimpan</span>" : ""}</div>
    </div>
    <div class="t">${RM.esc(g.title)}</div>
    <div class="s">${RM.esc(sub)}</div>
  </button>`;
}

function renderGrid() {
  const grid = $("#grid");
  if (!state.lib.games.length) { grid.innerHTML = emptyHtml(); bindEmpty(grid); return; }
  const list = visibleGames();
  let notice = "";
  if (state.lib.games.some((g) => g.system === "arcade") && !state.lib.bios.neogeo) {
    notice = `<div class="notice" style="grid-column:1/-1">${ICON.info}<p>Ada game arcade di pustakamu. Kalau itu game Neo Geo (Metal Slug, KOF, Samurai Shodown), taruh file <b>neogeo.zip</b> di folder BIOS agar bisa jalan. <button class="btn small" data-open="bios" style="margin-left:6px">Buka folder BIOS</button></p></div>`;
  }
  grid.innerHTML = notice + (list.length ? list.map(cardHtml).join("") : `<p class="noresult" style="grid-column:1/-1">Tidak ada game yang cocok dengan filter ini.</p>`);
  $$(".card", grid).forEach((c) => {
    c.addEventListener("click", () => openDetail(c.dataset.id));
    c.addEventListener("dblclick", () => { const g = gameById(c.dataset.id); launch(g.id, g.resume ? "resume" : "new"); });
  });
  $$("[data-open]", grid).forEach((b) => b.addEventListener("click", () => rm.openFolder(b.dataset.open)));
}

function emptyHtml() {
  const sys = state.lib.systems;
  const ext = { arcade: ".zip (mslug.zip)", nes: ".nes", snes: ".sfc .smc", gb: ".gb .gbc", gba: ".gba", psx: ".cue+.bin .chd .pbp" };
  return `<div class="empty" style="grid-column:1/-1">
    <h2>Rak masih kosong</h2>
    <p>Salin file game ke folder Games. Ruang Main memantau folder itu dan langsung menampilkan game baru di sini, tanpa perlu restart.</p>
    <div class="folders">
      ${Object.entries(sys).map(([k, s]) => `<button class="sys-${k}" data-open="${k}"><span class="sys-tag">${s.short}</span><code>${ext[k]}</code></button>`).join("")}
    </div>
    <p>Game Neo Geo seperti Metal Slug juga butuh BIOS <b>neogeo.zip</b> di folder BIOS. File .zip dan .7z boleh langsung dimasukkan.</p>
    <button class="btn primary" data-open="games">Buka folder Games</button>
    <button class="btn" data-open="bios">Buka folder BIOS</button>
  </div>`;
}
function bindEmpty(root) { $$("[data-open]", root).forEach((b) => b.addEventListener("click", () => rm.openFolder(b.dataset.open))); }

function renderLibrary() {
  renderHero();
  renderChips();
  $("#sort").value = state.sort;
  renderGrid();
}

// ---------- Detail ----------
async function openDetail(id) {
  const g = gameById(id);
  if (!g) return;
  const sheet = $("#sheet");
  const sys = state.lib.systems[g.system];
  const [saves, shots] = await Promise.all([rm.listSaves(id), rm.listShots()]);
  const myShots = shots.filter((s) => s.gameId === id);
  const filled = saves.filter((s) => !s.empty);
  sheet.innerHTML = `<div class="panel sys-${g.system}" role="dialog" aria-modal="true" aria-label="${RM.esc(g.title)}">
    <button class="close" aria-label="Tutup">${ICON.x}</button>
    <div class="detail-top">
      <div class="cart">${RM.coverHtml(g)}<div class="label"><span>${sys.short}</span></div></div>
      <div>
        <input class="title-edit" value="${RM.esc(g.title)}" aria-label="Judul game (klik untuk ganti)" spellcheck="false">
        <dl class="facts">
          <dt>Konsol</dt><dd>
            <select class="sys-pick" aria-label="Konsol untuk game ini">
              ${Object.entries(state.lib.systems).map(([k, x]) => `<option value="${k}" ${k === g.system ? "selected" : ""}>${x.name}${k === g.detectedSystem && g.manual ? " (terdeteksi)" : ""}</option>`).join("")}
            </select>
            ${g.manual ? `<div class="muted" style="font-size:13px;margin-top:2px">Dipilih manual</div>` : ""}
          </dd>
          <dt>Grafis</dt><dd>
            <select class="gfx-pick" aria-label="Mode grafis untuk game ini">
              ${Object.entries(GFX_NAME).map(([k, n]) => `<option value="${k}" ${k === (g.graphics || state.lib.settings.defaultGraphics) ? "selected" : ""}>${n}</option>`).join("")}
            </select></dd>
          <dt>Waktu main</dt><dd>${RM.duration(g.seconds)}${g.plays ? ` · ${g.plays}× dimainkan` : ""}</dd>
          <dt>Terakhir</dt><dd>${RM.ago(g.lastPlayed)}</dd>
          <dt>File</dt><dd>${RM.esc(g.rel)} <span class="muted">(${RM.size(g.size)})</span></dd>
        </dl>
      </div>
    </div>
    <div class="detail-actions">
      ${g.resume ? `<button class="btn primary" data-a="resume">${ICON.play}Lanjutkan</button>` : ""}
      <button class="btn ${g.resume ? "" : "primary"}" data-a="new">${g.resume ? "Mulai dari awal" : ICON.play + "Main"}</button>
      <button class="btn" data-a="fav">${g.favorite ? ICON.star + "Favorit" : ICON.starO + "Jadikan favorit"}</button>
    </div>
    <div class="section-h"><h3>Save state</h3><span class="muted">${filled.length ? "Klik untuk main dari titik ini" : ""}</span></div>
    ${filled.length ? `<div class="slots">${saves.map((s) => s.empty ? "" : `
      <div class="slot" role="button" tabindex="0" data-slot="${s.slot}">
        <div class="shot">${s.thumb ? `<img src="${s.thumb}" alt="">` : "Tanpa gambar"}</div>
        <div class="nm">${SLOT_NAME[s.slot]}</div>
        <div class="tm">${RM.dateTime(s.time)}</div>
        ${s.slot !== "auto" ? `<button class="del" data-del="${s.slot}" aria-label="Hapus ${SLOT_NAME[s.slot]}">${ICON.trash}</button>` : ""}
      </div>`).join("")}</div>`
      : `<p class="muted" style="margin:0 0 26px">Belum ada save. Saat bermain, tekan F5 untuk simpan cepat atau Esc untuk membuka menu save. Saat keluar, posisi terakhir disimpan otomatis.</p>`}
    ${myShots.length ? `<div class="section-h"><h3>Foto layar</h3><span class="muted">${myShots.length} foto</span></div>
      <div class="strip">${myShots.slice(0, 6).map((s) => `<img src="${s.url}" data-shot="${s.rel}" alt="">`).join("")}</div>` : ""}
    <div class="section-h" style="margin-top:26px"><h3>Lainnya</h3></div>
    <div class="detail-actions">
      <button class="btn small" data-a="cover">Ganti cover</button>
      ${g.cover && g.cover.kind === "custom" ? `<button class="btn small" data-a="uncover">Hapus cover</button>` : ""}
      <button class="btn small" data-a="reveal">Buka lokasi file</button>
    </div>
  </div>`;
  sheet.hidden = false;
  const panel = $(".panel", sheet);
  const close = () => { sheet.hidden = true; sheet.innerHTML = ""; const c = $(`.card[data-id="${id}"]`); c && c.focus(); };
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  $(".close", panel).onclick = close;
  sheet.closeSheet = close;

  $(".sys-pick", panel).addEventListener("change", async (e) => {
    const to = e.target.value;
    const name = state.lib.systems[to].name;
    const hasSaves = filled.length > 0;
    if (hasSaves && !confirm(`Ganti konsol ke ${name}? Save state lama dibuat untuk konsol lain, jadi akan dipindah ke folder cadangan.`)) { e.target.value = g.system; return; }
    const updated = await rm.updateGame(id, { system: to === g.detectedSystem ? null : to });
    RM.toast(`Konsol diganti ke ${name}`);
    await loadLibrary();
    if (updated) openDetail(updated.id);
  });

  $(".gfx-pick", panel).addEventListener("change", async (e) => {
    await rm.updateGame(id, { graphics: e.target.value });
    RM.toast(`Mode grafis: ${GFX_NAME[e.target.value]}`);
    await loadLibrary();
  });

  const title = $(".title-edit", panel);
  const commit = async () => {
    if (title.value.trim() === g.title) return;
    await rm.updateGame(id, { title: title.value.trim() });
    RM.toast(title.value.trim() ? "Judul diganti" : "Judul dikembalikan");
    await loadLibrary();
  };
  title.addEventListener("keydown", (e) => { if (e.key === "Enter") title.blur(); if (e.key === "Escape") { title.value = g.title; title.blur(); e.stopPropagation(); } });
  title.addEventListener("blur", commit);

  $$("[data-a]", panel).forEach((b) => b.addEventListener("click", async () => {
    const a = b.dataset.a;
    if (a === "resume" || a === "new") return launch(id, a);
    if (a === "fav") { await rm.updateGame(id, { favorite: !g.favorite }); await loadLibrary(); return openDetail(id); }
    if (a === "cover") { if (await rm.pickCover(id)) { RM.toast("Cover diganti"); await loadLibrary(); openDetail(id); } return; }
    if (a === "uncover") { await rm.clearCover(id); await loadLibrary(); return openDetail(id); }
    if (a === "reveal") return rm.revealGame(id);
  }));
  $$(".slot[data-slot]", panel).forEach((s) => {
    const go = () => launch(id, "slot", s.dataset.slot);
    s.addEventListener("click", (e) => { if (!e.target.closest(".del")) go(); });
    s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  $$("[data-del]", panel).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`Hapus ${SLOT_NAME[b.dataset.del]}?`)) return;
    await rm.deleteSave(id, b.dataset.del);
    RM.toast(`${SLOT_NAME[b.dataset.del]} dihapus`);
    openDetail(id);
  }));
  $$("[data-shot]", panel).forEach((img) => img.addEventListener("click", () => {
    openLightbox(myShots, myShots.findIndex((s) => s.rel === img.dataset.shot));
  }));
  (g.resume ? $('[data-a="resume"]', panel) : $('[data-a="new"]', panel)).focus();
}

// ---------- Statistik ----------
async function renderStats() {
  const { sessions, games } = await rm.stats();
  const v = $("#view-stats");
  const played = games.filter((g) => g.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  const total = played.reduce((t, g) => t + g.seconds, 0);
  if (!played.length) {
    v.innerHTML = `<div class="stats-head"><h1>Statistik</h1></div>
      <div class="empty"><h2>Belum ada catatan main</h2><p>Waktu main dihitung otomatis setiap kali kamu memainkan game. Main satu game dulu, lalu kembali ke sini.</p></div>`;
    return;
  }
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));
  const sysTotals = {};
  for (const g of played) sysTotals[g.system] = (sysTotals[g.system] || 0) + g.seconds;

  // 7 hari terakhir
  const days = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(start); d.setDate(d.getDate() - i);
    days.push({ d, sec: 0 });
  }
  for (const s of sessions) {
    const t = new Date(s.startedAt); t.setHours(0, 0, 0, 0);
    const day = days.find((x) => x.d.getTime() === t.getTime());
    if (day) day.sec += s.seconds;
  }
  const maxDay = Math.max(60, ...days.map((d) => d.sec));
  const weekSec = days.reduce((t, d) => t + d.sec, 0);
  const max = played[0].seconds;

  v.innerHTML = `<div class="stats-head"><h1>Statistik</h1></div>
    <div class="big-numbers">
      <div><b>${RM.short(total)}</b><span>total waktu main</span></div>
      <div><b>${played.length}</b><span>game dimainkan dari ${games.length}</span></div>
      <div><b>${RM.short(weekSec)}</b><span>7 hari terakhir</span></div>
      <div><b>${sessions.length}</b><span>sesi bermain</span></div>
    </div>
    <div class="stats-cols">
      <div>
        <h2>Paling sering dimainkan</h2>
        <div class="bars">${played.slice(0, 10).map((g) => `
          <button class="bar sys-${g.system}" data-id="${g.id}">
            <span class="n">${RM.esc(g.title)}</span><span class="v">${RM.duration(g.seconds)}</span>
            <span class="track"><span class="fill" style="width:${Math.max(2, (g.seconds / max) * 100)}%"></span></span>
          </button>`).join("")}</div>
        <h2 style="margin-top:34px">Per konsol</h2>
        <div class="bars">${Object.entries(sysTotals).sort((a, b) => b[1] - a[1]).map(([k, sec]) => `
          <div class="bar sys-${k}">
            <span class="n">${state.lib.systems[k].name}</span><span class="v">${RM.duration(sec)}</span>
            <span class="track"><span class="fill" style="width:${(sec / total) * 100}%"></span></span>
          </div>`).join("")}</div>
      </div>
      <div>
        <h2>Minggu ini</h2>
        <div class="week">${days.map((d, i) => `
          <div class="col ${i === 6 ? "today" : ""}" title="${RM.duration(d.sec)}">
            <div class="b ${d.sec ? "" : "zero"}" style="height:${(d.sec / maxDay) * 110}px"></div>
            <span>${d.d.toLocaleDateString("id-ID", { weekday: "short" })}</span>
          </div>`).join("")}</div>
        <h2 style="margin-top:34px">Sesi terakhir</h2>
        <ul class="sessions">${sessions.filter((s) => byId[s.id]).slice(0, 12).map((s) => {
          const g = byId[s.id];
          return `<li class="sys-${g.system}"><span class="dot"></span><span class="n">${RM.esc(g.title)}</span><span class="w">${RM.short(s.seconds)} · ${RM.ago(s.startedAt + s.seconds * 1000)}</span></li>`;
        }).join("")}</ul>
      </div>
    </div>`;
  $$(".bar[data-id]", v).forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.id)));
}

// ---------- Galeri ----------
async function renderGallery() {
  state.shots = await rm.listShots();
  const v = $("#view-gallery");
  const games = Object.fromEntries(state.lib.games.map((g) => [g.id, g]));
  const ids = [...new Set(state.shots.map((s) => s.gameId))];
  if (state.galleryGame !== "all" && !ids.includes(state.galleryGame)) state.galleryGame = "all";
  const list = state.shots.filter((s) => state.galleryGame === "all" || s.gameId === state.galleryGame);
  v.innerHTML = `<div class="gallery-head">
      <h1>Galeri</h1>
      <div style="display:flex;gap:10px;align-items:center">
        ${ids.length > 1 ? `<select id="galFilter" aria-label="Pilih game">
          <option value="all">Semua game (${state.shots.length})</option>
          ${ids.map((id) => `<option value="${id}" ${state.galleryGame === id ? "selected" : ""}>${RM.esc(games[id]?.title || "Game terhapus")}</option>`).join("")}
        </select>` : ""}
        <button class="btn small" data-open="shots">Buka folder</button>
      </div>
    </div>
    ${list.length ? `<div class="shots">${list.map((s, i) => `
      <button data-i="${i}"><img src="${s.url}" alt="" loading="lazy">
      <span class="cap"><b>${RM.esc(games[s.gameId]?.title || "Game terhapus")}</b> · ${RM.dateTime(s.time)}</span></button>`).join("")}</div>`
      : `<div class="empty"><h2>Belum ada foto layar</h2><p>Saat bermain, tekan F12 atau pilih Foto layar di menu jeda (Esc). Fotonya muncul di sini dan bisa langsung dijadikan cover game.</p></div>`}`;
  $("#galFilter")?.addEventListener("change", (e) => { state.galleryGame = e.target.value; renderGallery(); });
  $$("[data-open]", v).forEach((b) => b.addEventListener("click", () => rm.openFolder(b.dataset.open)));
  $$(".shots button", v).forEach((b) => b.addEventListener("click", () => openLightbox(list, +b.dataset.i)));
}

function openLightbox(list, index) {
  const lb = $("#lightbox");
  let i = index;
  const draw = () => {
    const s = list[i];
    const g = gameById(s.gameId);
    lb.innerHTML = `<div class="stage">
        <img src="${s.url}" alt="">
        ${list.length > 1 ? `<button class="nav prev" aria-label="Sebelumnya">${ICON.left}</button><button class="nav next" aria-label="Berikutnya">${ICON.right}</button>` : ""}
      </div>
      <div class="bar2">
        <div><b>${RM.esc(g?.title || "Game terhapus")}</b> <span class="muted">· ${RM.dateTime(s.time)} · ${i + 1}/${list.length}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${g ? `<button class="btn small" data-x="cover">Jadikan cover</button>` : ""}
          <button class="btn small" data-x="reveal">Tampilkan di folder</button>
          <button class="btn small danger" data-x="del">Hapus</button>
          <button class="btn small" data-x="close">Tutup</button>
        </div>
      </div>`;
    $(".prev", lb)?.addEventListener("click", () => { i = (i - 1 + list.length) % list.length; draw(); });
    $(".next", lb)?.addEventListener("click", () => { i = (i + 1) % list.length; draw(); });
    $$("[data-x]", lb).forEach((b) => b.addEventListener("click", async () => {
      const x = b.dataset.x;
      if (x === "close") return close();
      if (x === "reveal") return rm.revealShot(s.rel);
      if (x === "cover") { await rm.coverFromShot(s.gameId, s.rel); RM.toast("Cover diganti dengan foto ini"); await loadLibrary(); return; }
      if (x === "del") {
        await rm.deleteShot(s.rel);
        RM.toast("Foto dipindah ke Recycle Bin");
        list.splice(i, 1);
        if (!list.length) { close(); } else { i = Math.min(i, list.length - 1); draw(); }
        if (state.view === "gallery") renderGallery();
      }
    }));
    $('[data-x="close"]', lb).focus();
  };
  const close = () => { lb.hidden = true; lb.innerHTML = ""; document.removeEventListener("keydown", keys, true); };
  const keys = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "ArrowLeft" && list.length > 1) { i = (i - 1 + list.length) % list.length; draw(); }
    if (e.key === "ArrowRight" && list.length > 1) { i = (i + 1) % list.length; draw(); }
  };
  lb.closeBox = close;
  document.addEventListener("keydown", keys, true);
  lb.hidden = false;
  draw();
}

// ---------- Tentang & pengaturan ----------
function openAbout() {
  const d = $("#about");
  const s = state.lib.settings;
  d.innerHTML = `<h2>Ruang Main</h2>
    <p class="muted" style="margin:0 0 18px">Versi ${state.lib.version} · Pengembang: @SuS_X_x</p>
    <div class="row"><div><b>Pantau folder Downloads</b><p>File game atau BIOS baru yang kamu unduh lewat browser ditawarkan untuk dipindah ke pustaka.<br><span id="dlPath">${RM.esc(state.lib.downloadsDir)}</span></p>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn small" id="dlCheckBtn">Periksa sekarang</button><button class="btn small" id="dlPickBtn">Ganti folder</button></div></div>
      <label class="switch"><input type="checkbox" id="optDl" ${s.watchDownloads ? "checked" : ""}><span></span></label></div>
    <div class="row"><div><b>Pindahkan tanpa bertanya</b><p>Game yang ditemukan di Downloads langsung dipindah ke pustaka tanpa notifikasi konfirmasi.</p></div>
      <label class="switch"><input type="checkbox" id="optAutoImport" ${s.autoImport ? "checked" : ""}><span></span></label></div>
    <div class="row"><div><b>Mode grafis bawaan</b><p>Dipakai untuk game yang belum diatur sendiri. Tiap game bisa diganti lewat menu jeda (Esc).</p></div>
      <select id="optGfx">${Object.entries(GFX_NAME).map(([k, n]) => `<option value="${k}" ${k === s.defaultGraphics ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="row"><div><b>Rapikan folder otomatis</b><p>File game yang ditaruh di luar folder konsolnya (atau di folder yang salah) dipindah otomatis ke folder yang benar. Save, statistik, dan foto ikut pindah.</p></div>
      <label class="switch"><input type="checkbox" id="optSort" ${s.autoSort ? "checked" : ""}><span></span></label></div>
    <div class="row"><div><b>Ambil cover otomatis</b><p>Mencari gambar sampul dari libretro-thumbnails (butuh internet). Tidak berlaku untuk game arcade.</p></div>
      <label class="switch"><input type="checkbox" id="optCovers" ${s.autoCovers ? "checked" : ""}><span></span></label></div>
    <div class="row"><div><b>Folder data</b><p>${RM.esc(state.lib.dataDir)}</p></div><button class="btn small" data-open="data">Buka</button></div>
    <div class="row"><div><b>BIOS</b><p>Neo Geo (neogeo.zip): ${state.lib.bios.neogeo ? "ada" : "belum ada"} · PS1: ${state.lib.bios.psx ? RM.esc(state.lib.bios.psx) : "tidak wajib, memakai BIOS bawaan emulator"}</p></div><button class="btn small" data-open="bios">Buka</button></div>
    <div class="row"><div><b>Pintasan saat bermain</b><p>Esc menu jeda (save, muat, mode grafis) · F5 simpan cepat · F9 muat cepat · F12 foto layar · F11 layar penuh. Di stik: tekan Select + Start untuk membuka menu jeda.</p></div></div>
    <div class="row"><div><b>Mesin emulator</b><p>EmulatorJS dengan core libretro: FBNeo, FCEUmm, Snes9x, Gambatte, mGBA, PCSX-ReARMed (lisensi GPL).</p></div></div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn primary" id="aboutClose">Selesai</button></div>`;
  $("#optDl", d).addEventListener("change", async (e) => {
    state.lib.settings = await rm.setSettings({ watchDownloads: e.target.checked });
    RM.toast(e.target.checked ? "Folder Downloads dipantau" : "Pemantauan Downloads dimatikan");
  });
  $("#optAutoImport", d).addEventListener("change", async (e) => {
    state.lib.settings = await rm.setSettings({ autoImport: e.target.checked });
  });
  $("#optGfx", d).addEventListener("change", async (e) => {
    state.lib.settings = await rm.setSettings({ defaultGraphics: e.target.value });
    RM.toast(`Mode grafis bawaan: ${GFX_NAME[e.target.value]}`);
  });
  $("#dlCheckBtn", d).addEventListener("click", async () => {
    const n = await rm.dlCheck();
    RM.toast(n ? `${n} file game ditemukan di Downloads` : "Tidak ada file game di Downloads");
    if (n) d.close();
  });
  $("#dlPickBtn", d).addEventListener("click", async () => {
    const dir = await rm.dlPickFolder();
    if (dir) { $("#dlPath", d).textContent = dir; state.lib.downloadsDir = dir; RM.toast("Folder yang dipantau diganti"); }
  });
  $("#optSort", d).addEventListener("change", async (e) => {
    state.lib.settings = await rm.setSettings({ autoSort: e.target.checked });
    RM.toast(e.target.checked ? "Rapikan otomatis dinyalakan" : "Rapikan otomatis dimatikan");
    if (e.target.checked) loadLibrary(true);
  });
  $("#optCovers", d).addEventListener("change", async (e) => {
    state.lib.settings = await rm.setSettings({ autoCovers: e.target.checked });
    RM.toast(e.target.checked ? "Cover otomatis dinyalakan" : "Cover otomatis dimatikan");
  });
  $$("[data-open]", d).forEach((b) => b.addEventListener("click", () => rm.openFolder(b.dataset.open)));
  $("#aboutClose", d).addEventListener("click", () => d.close());
  d.showModal();
}


// ---------- Temuan di Downloads ----------
let dlItems = [];
function renderTray(list) {
  dlItems = list || [];
  const tray = $("#dltray");
  if (!dlItems.length) { tray.hidden = true; tray.innerHTML = ""; return; }
  const sys = state.lib ? state.lib.systems : {};
  tray.innerHTML = `
    <div class="dl-head">
      <h3>Ditemukan di Downloads</h3>
      <button class="close" data-x="hide" aria-label="Sembunyikan">${ICON.x}</button>
    </div>
    <ul>${dlItems.map((f) => `
      <li class="${f.kind === "game" ? "sys-" + f.system : ""}">
        <span class="sys-tag">${f.kind === "bios" ? "BIOS" : (sys[f.system]?.short || f.system)}</span>
        <div class="dl-name"><b>${RM.esc(f.kind === "bios" ? f.name : f.title)}</b><span>${RM.esc(f.name)} · ${RM.size(f.size)}</span></div>
        <div class="dl-act">
          <button class="btn small primary" data-imp="${RM.esc(f.key)}">Pindahkan</button>
          <button class="btn small" data-dis="${RM.esc(f.key)}">Abaikan</button>
        </div>
      </li>`).join("")}</ul>
    ${dlItems.length > 1 ? `<div class="dl-foot"><button class="btn small primary" data-x="all">Pindahkan semua (${dlItems.length})</button></div>` : ""}`;
  tray.hidden = false;
  const doImport = async (keys) => {
    const done = await rm.dlImport(keys);
    if (done.length === 1) RM.toast(`${done[0].title} dipindah ke folder ${done[0].to}`, 3500);
    else if (done.length) RM.toast(`${done.length} file dipindah ke pustaka`, 3500);
    else RM.toast("Gagal memindahkan. File mungkin sedang dipakai program lain.");
    await loadLibrary();
  };
  $$("[data-imp]", tray).forEach((b) => b.addEventListener("click", () => doImport([b.dataset.imp])));
  $$("[data-dis]", tray).forEach((b) => b.addEventListener("click", () => rm.dlDismiss([b.dataset.dis])));
  $('[data-x="all"]', tray)?.addEventListener("click", () => doImport(dlItems.map((f) => f.key)));
  $('[data-x="hide"]', tray).addEventListener("click", () => { tray.hidden = true; });
}
rm.on("dl:found", renderTray);
rm.dlList().then(renderTray);

// ---------- Tautan saya ----------
function openLinks() {
  const d = $("#links");
  const links = state.lib.settings.links || [];
  d.innerHTML = `<h2>Tautan saya</h2>
    <p class="muted" style="margin:4px 0 16px">Situs favoritmu, dibuka di browser biasa. File game yang kamu unduh dari sana akan ditawarkan untuk dipindah ke pustaka${state.lib.settings.watchDownloads ? "" : " (nyalakan Pantau folder Downloads di pengaturan)"}.</p>
    ${links.length ? `<ul class="links">${links.map((l, i) => `
      <li><button class="link-open" data-open-link="${i}"><b>${RM.esc(l.name)}</b><span>${RM.esc(l.url)}</span></button>
      <button class="del" data-del-link="${i}" aria-label="Hapus ${RM.esc(l.name)}">${ICON.trash}</button></li>`).join("")}</ul>`
      : `<p class="empty-links">Belum ada tautan. Tambahkan di bawah.</p>`}
    <form class="link-form" id="linkForm">
      <input name="name" placeholder="Nama (opsional)" maxlength="60" autocomplete="off">
      <input name="url" placeholder="https://..." required autocomplete="off">
      <button class="btn small primary" type="submit">Tambah</button>
    </form>
    <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn primary" id="linksClose">Selesai</button></div>`;
  const save = async (list) => { state.lib.settings = await rm.setSettings({ links: list }); openLinks(); };
  $$("[data-open-link]", d).forEach((b) => b.addEventListener("click", () => rm.openUrl(links[+b.dataset.openLink].url)));
  $$("[data-del-link]", d).forEach((b) => b.addEventListener("click", () => save(links.filter((_, i) => i !== +b.dataset.delLink))));
  $("#linkForm", d).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let url = String(f.get("url") || "").trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { RM.toast("Link tidak valid"); return; }
    save([...links, { name: String(f.get("name") || "").trim(), url }]);
  });
  $("#linksClose", d).addEventListener("click", () => d.close());
  if (!d.open) d.showModal();
}
$("#linksBtn").addEventListener("click", openLinks);

// ---------- Navigasi ----------
function setView(v) {
  state.view = v;
  $$(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.view === v ? "page" : "false"));
  $$(".view").forEach((s) => (s.hidden = s.id !== "view-" + v));
  $("#main").scrollTop = 0;
  if (v === "stats") renderStats();
  if (v === "gallery") renderGallery();
}
$$(".tab").forEach((t) => t.addEventListener("click", () => setView(t.dataset.view)));
$$(".rail [data-open]").forEach((b) => b.addEventListener("click", () => rm.openFolder(b.dataset.open)));
$("#aboutBtn").addEventListener("click", openAbout);
$("#search").addEventListener("input", (e) => { state.query = e.target.value; renderGrid(); });
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; localStorage.setItem("rm.sort", state.sort); renderGrid(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#sheet").hidden) $("#sheet").closeSheet();
  if ((e.ctrlKey && e.key === "f") || (e.key === "/" && document.activeElement.tagName !== "INPUT")) {
    e.preventDefault(); setView("library"); $("#search").focus();
  }
});
rm.on("lib:changed", () => loadLibrary());


// ---------- Navigasi pakai stik ----------
function navRoot() {
  const lb = $("#lightbox"), sh = $("#sheet"), ab = $("#about"), lk = $("#links");
  return !lb.hidden ? lb : !sh.hidden ? sh : ab.open ? ab : lk.open ? lk : document.body;
}
RM.gamepad({
  move(dx, dy) {
    const items = $$("button, [tabindex='0'], input, select", navRoot()).filter((el) => el.offsetParent !== null && !el.disabled);
    if (!items.includes(document.activeElement)) { (items.find((e) => e.classList.contains("card")) || items[0])?.focus(); return; }
    RM.spatialMove(items, dx, dy);
  },
  a() { document.activeElement?.click(); },
  b() {
    if (!$("#lightbox").hidden) $("#lightbox").closeBox();
    else if (!$("#sheet").hidden) $("#sheet").closeSheet();
    else if ($("#about").open) $("#about").close();
    else if ($("#links").open) $("#links").close();
  },
  y() {
    // Y: langsung main game yang sedang dipilih
    const id = document.activeElement?.dataset?.id;
    const g = id && gameById(id);
    if (g) launch(g.id, g.resume ? "resume" : "new");
  },
});

loadLibrary();
