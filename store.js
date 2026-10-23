// Penyimpanan data aplikasi (judul kustom, favorit, statistik, riwayat sesi) dalam satu file JSON.
const fs = require("fs");
const path = require("path");

class Store {
  constructor(file) {
    this.file = file;
    this.data = { games: {}, sessions: [], settings: { autoCovers: true, autoSort: true, watchDownloads: true, autoImport: false, defaultGraphics: "asli", links: [] } };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      this.data = { ...this.data, ...raw, settings: { ...this.data.settings, ...(raw.settings || {}) } };
    } catch {}
    this.timer = null;
  }
  game(id) {
    if (!this.data.games[id]) this.data.games[id] = {};
    return this.data.games[id];
  }
  peek(id) { return this.data.games[id] || {}; }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }
  flush() {
    clearTimeout(this.timer);
    const tmp = this.file + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error("Gagal menyimpan data:", e); }
  }
  // Dipanggil berkala selama bermain; total = detik main sesi ini sejauh ini
  sessionTick(key, id, total, startedAt) {
    total = Math.max(0, Math.round(total));
    let s = this.data.sessions.find((x) => x.key === key);
    const g = this.game(id);
    if (!s) {
      s = { key, id, seconds: 0, startedAt: startedAt || Date.now() };
      this.data.sessions.unshift(s);
      if (this.data.sessions.length > 500) this.data.sessions.length = 500;
      g.plays = (g.plays || 0) + 1;
      if (!g.firstPlayed) g.firstPlayed = s.startedAt;
    }
    const delta = total - s.seconds;
    if (delta > 0) {
      s.seconds = total;
      g.seconds = (g.seconds || 0) + delta;
    }
    g.lastPlayed = Date.now();
    this.save();
  }
}

module.exports = { Store };
