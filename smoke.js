// Uji asap otomatis (hanya dipakai saat pengembangan: RUANGMAIN_SMOKE=folder-output)
const fs = require("fs");
const path = require("path");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function smoke(win, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = win.webContents;
  const logs = [];
  wc.on("console-message", (e) => logs.push(`[${e.level}] ${e.message}`));
  const shot = async (name) => fs.writeFileSync(path.join(outDir, name + ".png"), (await wc.capturePage()).toPNG());
  const js = (code) => wc.executeJavaScript(code, true);
  const loaded = () => new Promise((r) => wc.once("did-finish-load", r));
  try {
    await wait(2500);
    await shot("01-pustaka");
    const ids = await js(`state.lib.games.map(g => g.id + "|" + g.system + "|" + g.title)`);
    logs.push("GAMES: " + JSON.stringify(ids));
    const target = process.env.RUANGMAIN_SMOKE_GAME || ids.find((x) => x.includes("|nes|")).split("|")[0];
    await js(`openDetail("${target}")`);
    await wait(800);
    await shot("02-detail");
    let p = loaded();
    await js(`launch("${target}", "new")`);
    await p;
    await wait(7000);
    await shot("03-main");
    logs.push("STARTED: " + (await js("started")));
    await js(`openMenu()`);
    await wait(800);
    await shot("04-menu");
    await js(`showSlots("save")`);
    await wait(500);
    await shot("05-slot-save");
    await js(`document.querySelector('#slotGrid .slot[data-slot="2"]').click()`);
    await wait(1200);
    await js(`screenshot()`);
    await wait(1000);
    p = loaded();
    await js(`saveAndLeave().then(backToLibrary)`);
    await p;
    await wait(2000);
    await shot("06-pustaka-setelah-main");
    await js(`setView("stats")`);
    await wait(800);
    await shot("07-statistik");
    await js(`setView("gallery")`);
    await wait(800);
    await shot("08-galeri");
    await js(`setView("library"); openDetail("${target}")`);
    await wait(800);
    await shot("09-detail-setelah");
    // lanjutkan dari save otomatis
    p = loaded();
    await js(`launch("${target}", "resume")`);
    await p;
    await wait(6000);
    await shot("10-lanjutkan");
    logs.push("RESUMED: " + (await js("started")));
  } catch (e) {
    logs.push("ERROR " + e.stack);
  }
  fs.writeFileSync(path.join(outDir, "log.txt"), logs.join("\n"));
};
