const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("phasmo", {
  launchObs: () => ipcRenderer.invoke("obs:launch"),
  connectObs: () => ipcRenderer.invoke("obs:connect"),
  saveClip: () => ipcRenderer.invoke("obs:save"),
  showClip: () => ipcRenderer.invoke("clip:show"),
  launchGame: () => ipcRenderer.invoke("game:launch"),
  openSite: () => ipcRenderer.invoke("site:open"),
  getSettings: () => ipcRenderer.invoke("cfg:get"),
  setSettings: (patch) => ipcRenderer.invoke("cfg:set", patch),
  browseObs: () => ipcRenderer.invoke("cfg:browseObs"),
  setOpacity: (v) => ipcRenderer.invoke("win:opacity", v),
  onTap: (fn) => ipcRenderer.on("tap", () => fn()),
  onStatus: (fn) => ipcRenderer.on("obs:status", (_e, d) => fn(d))
});
