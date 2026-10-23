// Fungsi bantu bersama untuk pustaka dan pemutar
const RM = {
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  duration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec > 0 ? "< 1 menit" : "Belum dimainkan";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (!h) return `${m} menit`;
    return m ? `${h} jam ${m} menit` : `${h} jam`;
  },
  short(sec) {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (!h && !m) return sec > 0 ? "<1m" : "0m";
    return h ? `${h}j ${m}m` : `${m}m`;
  },
  ago(ts) {
    if (!ts) return "belum pernah";
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return "baru saja";
    if (d < 3600) return `${Math.floor(d / 60)} menit lalu`;
    if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
    if (d < 172800) return "kemarin";
    if (d < 86400 * 30) return `${Math.floor(d / 86400)} hari lalu`;
    return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  },
  dateTime(ts) {
    return new Date(ts).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  },
  size(b) {
    if (b > 1 << 30) return (b / (1 << 30)).toFixed(1) + " GB";
    if (b > 1 << 20) return (b / (1 << 20)).toFixed(1) + " MB";
    return Math.max(1, Math.round(b / 1024)) + " KB";
  },
  // Cover buatan sendiri saat game belum punya gambar
  fallbackCover(g) {
    return `<div class="gen-cover sys-${g.system}"><span>${RM.esc(g.title)}</span></div>`;
  },
  coverHtml(g, cls = "") {
    if (g.cover) {
      const fit = g.cover.kind === "snapshot" ? "snap" : "";
      return `<img class="${cls} ${fit}" src="${g.cover.url}" alt="" loading="lazy" draggable="false" onerror="this.outerHTML=RM.fallbackCover(${RM.esc(JSON.stringify({ title: g.title, system: g.system }))})">`;
    }
    return RM.fallbackCover(g);
  },
  // Pindah fokus ke elemen terdekat pada arah tertentu (navigasi pakai stik/D-pad)
  spatialMove(items, dx, dy) {
    const cur = document.activeElement;
    if (!items.includes(cur)) { items[0]?.focus(); return; }
    const a = cur.getBoundingClientRect();
    const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const ddx = b.left + b.width / 2 - ac.x, ddy = b.top + b.height / 2 - ac.y;
      if (dx && Math.sign(ddx) !== dx) continue;
      if (dy && Math.sign(ddy) !== dy) continue;
      const main = dx ? Math.abs(ddx) : Math.abs(ddy), off = dx ? Math.abs(ddy) : Math.abs(ddx);
      if (main < 4) continue;
      const score = main + off * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  },
  // Pembaca stik: memanggil handler saat arah/tombol baru ditekan (dengan pengulangan saat ditahan)
  gamepad(handlers) {
    let prev = {}, repeatAt = 0;
    const loop = (t) => {
      const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
      if (gp && (!handlers.enabled || handlers.enabled())) {
        const p = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        const now = {
          up: p(12) || ay < -0.6, down: p(13) || ay > 0.6, left: p(14) || ax < -0.6, right: p(15) || ax > 0.6,
          a: p(0), b: p(1), y: p(3), select: p(8), start: p(9),
        };
        const dirs = ["up", "down", "left", "right"];
        const fresh = dirs.some((k) => now[k] && !prev[k]);
        if (dirs.some((k) => now[k]) && (fresh || t > repeatAt)) {
          repeatAt = t + (fresh ? 380 : 120);
          handlers.move?.(now.left ? -1 : now.right ? 1 : 0, now.up ? -1 : now.down ? 1 : 0);
        }
        for (const k of ["a", "b", "y"]) if (now[k] && !prev[k]) handlers[k]?.();
        prev = now;
      } else if (gp) {
        // tetap catat status supaya tombol yang ditahan tidak memicu aksi saat diaktifkan lagi
        prev = { a: true, b: true, y: true };
      }
      if (gp && handlers.combo) handlers.combo(gp);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  toast(msg, ms = 2400) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(RM._t);
    RM._t = setTimeout(() => t.classList.remove("show"), ms);
  },
};
