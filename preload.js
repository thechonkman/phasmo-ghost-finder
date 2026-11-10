const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("phasmo", {
  launchObs: () => ipcRenderer.invoke("obs:launch"),
  connectObs: () => ipcRenderer.invoke("obs:connect"),
  saveClip: () => ipcRenderer.invoke("obs:save"),
  showClip: () => ipcRenderer.invoke("clip:show"),
  launchGame: () => ipcRenderer.invoke("game:launch"),
  openSite: () => ipcRenderer.invoke("site:open"),
  hideOverlay: () => ipcRenderer.invoke("ov:hide"),
  zoom: (step) => ipcRenderer.invoke("ov:zoom", step),
  quit: () => ipcRenderer.invoke("app:quit"),
  hudUpdate: (data) => ipcRenderer.send("hud:update", data),
  getSettings: () => ipcRenderer.invoke("cfg:get"),
  setSettings: (patch) => ipcRenderer.invoke("cfg:set", patch),
  browseObs: () => ipcRenderer.invoke("cfg:browseObs"),
  onTap: (fn) => ipcRenderer.on("tap", () => fn()),
  onShown: (fn) => ipcRenderer.on("ov:shown", () => fn()),
  onHud: (fn) => ipcRenderer.on("hud:data", (_e, d) => fn(d)),
  onStatus: (fn) => ipcRenderer.on("obs:status", (_e, d) => fn(d))
});
