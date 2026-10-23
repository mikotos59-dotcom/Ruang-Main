const { contextBridge, ipcRenderer } = require("electron");

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld("rm", {
  library: call("lib:get"),
  openFolder: call("lib:open"),
  revealGame: call("game:reveal"),
  updateGame: call("game:update"),
  pickCover: call("game:cover-pick"),
  coverFromShot: call("game:cover-from-shot"),
  clearCover: call("game:cover-clear"),
  playInfo: call("play:info"),
  setPlaying: call("play:active"),
  canClose: call("app:can-close"),
  listSaves: call("saves:list"),
  writeSave: call("saves:write"),
  deleteSave: call("saves:delete"),
  readSram: call("sram:read"),
  writeSram: call("sram:write"),
  saveShot: call("shot:save"),
  listShots: call("shots:list"),
  deleteShot: call("shot:delete"),
  revealShot: call("shot:reveal"),
  sessionTick: call("session:tick"),
  stats: call("stats:get"),
  setSettings: call("settings:set"),
  openUrl: call("app:open-url"),
  dlList: call("dl:list"),
  dlCheck: call("dl:check"),
  dlImport: call("dl:import"),
  dlDismiss: call("dl:dismiss"),
  dlPickFolder: call("dl:pick-folder"),
  dlOpenFolder: call("dl:open-folder"),
  on: (ch, fn) => {
    const allowed = ["lib:changed", "app:will-close", "dl:found"];
    if (!allowed.includes(ch)) return;
    ipcRenderer.on(ch, (_e, ...a) => fn(...a));
  },
});
