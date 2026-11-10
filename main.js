// Phasmo Ghost Finder - desktop overlay
// Starts OBS with its replay buffer, saves clips on a global hotkey,
// and shows the ghost finder in an always-on-top window.
const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
const OBSWebSocket = require("obs-websocket-js/json").default;

const DEFAULTS = {
  obsPath: "",
  host: "127.0.0.1",
  port: 4455,
  password: "",
  autoStartObs: true,
  autoStartGame: false,
  showClipAfterSave: false,
  saveHotkey: "CommandOrControl+Shift+S",
  toggleHotkey: "CommandOrControl+Shift+H",
  alwaysOnTop: true,
  opacity: 1,
  websiteUrl: "https://claude.ai/artifact/HE7x9Ednqk59vpxVDTZv2G"
};

const OBS_GUESSES = [
  "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe",
  "C:\\Program Files (x86)\\obs-studio\\bin\\64bit\\obs64.exe",
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\OBS Studio\\bin\\64bit\\obs64.exe",
  "C:\\Program Files\\Steam\\steamapps\\common\\OBS Studio\\bin\\64bit\\obs64.exe"
];

let win = null;
let cfg = { ...DEFAULTS };
const obs = new OBSWebSocket();
let connected = false;
let connecting = null;
let lastClip = null;
let lastClipAt = null;
let lastError = "";

// ---------- settings ----------
const cfgFile = () => path.join(app.getPath("userData"), "settings.json");
function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) }; }
  catch { cfg = { ...DEFAULTS }; }
}
function saveCfg() {
  try {
    fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
    fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2));
  } catch (e) { lastError = "Couldn't save settings: " + e.message; }
}

// ---------- status to the window ----------
function findObs() {
  if (cfg.obsPath && fs.existsSync(cfg.obsPath)) return cfg.obsPath;
  return OBS_GUESSES.find((p) => fs.existsSync(p)) || null;
}
function pushStatus(extra = {}) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("obs:status", {
    connected, lastClip, saved: lastClipAt, error: lastError, obsPath: findObs(),
    saveHotkey: cfg.saveHotkey, toggleHotkey: cfg.toggleHotkey, ...extra
  });
}

// ---------- OBS process ----------
function obsRunning() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(false);
    execFile("tasklist", ["/FI", "IMAGENAME eq obs64.exe", "/NH"], { windowsHide: true }, (err, out) => {
      resolve(!err && /obs64\.exe/i.test(String(out)));
    });
  });
}
async function launchObs() {
  if (await obsRunning()) return true;
  const exe = findObs();
  if (!exe) { lastError = "Couldn't find OBS. Install it from obsproject.com, or set its location in Settings."; pushStatus(); return false; }
  try {
    // OBS must be started from its own bin folder or it fails to load its files.
    const child = spawn(exe, ["--startreplaybuffer", "--minimize-to-tray", "--disable-shutdown-check"],
      { cwd: path.dirname(exe), detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return true;
  } catch (e) {
    lastError = "Couldn't start OBS: " + e.message; pushStatus(); return false;
  }
}

// ---------- OBS websocket ----------
obs.on("ConnectionClosed", () => { connected = false; pushStatus(); });
obs.on("ReplayBufferSaved", (d) => {
  lastClip = d && d.savedReplayPath ? d.savedReplayPath : lastClip;
  lastClipAt = Date.now();
  lastError = "";
  pushStatus();
  if (cfg.showClipAfterSave && lastClip) shell.showItemInFolder(lastClip);
});

async function connectObs({ waitForStart = false } = {}) {
  if (connected) return true;
  if (connecting) return connecting;
  connecting = (async () => {
    const tries = waitForStart ? 20 : 1; // up to ~40 s while OBS boots
    for (let i = 0; i < tries; i++) {
      try {
        await obs.connect(`ws://${cfg.host}:${cfg.port}`, cfg.password || undefined);
        connected = true; lastError = "";
        await ensureReplayBuffer();
        pushStatus();
        return true;
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/auth/i.test(msg)) { lastError = "OBS rejected the password. Copy it from OBS → Tools → WebSocket Server Settings → Show Connect Info."; break; }
        lastError = "Can't reach OBS. In OBS, open Tools → WebSocket Server Settings and tick Enable WebSocket server (port " + cfg.port + ").";
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    pushStatus();
    return false;
  })();
  try { return await connecting; } finally { connecting = null; }
}

async function ensureReplayBuffer() {
  try {
    const { outputActive } = await obs.call("GetReplayBufferStatus");
    if (!outputActive) await obs.call("StartReplayBuffer");
    return true;
  } catch (e) {
    lastError = "OBS's Replay Buffer is off. In OBS, open Settings → Output → Replay Buffer and tick Enable Replay Buffer.";
    return false;
  }
}

async function saveClip() {
  if (!connected && !(await connectObs())) return { ok: false, error: lastError };
  if (!(await ensureReplayBuffer())) { pushStatus(); return { ok: false, error: lastError }; }
  try {
    await obs.call("SaveReplayBuffer");
    pushStatus({ saving: true });
    return { ok: true };
  } catch (e) {
    lastError = "OBS couldn't save the clip: " + ((e && e.message) || e);
    pushStatus();
    return { ok: false, error: lastError };
  }
}

// ---------- hotkeys ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const bad = [];
  try { if (!globalShortcut.register(cfg.saveHotkey, () => { saveClip(); })) bad.push(cfg.saveHotkey); } catch { bad.push(cfg.saveHotkey); }
  try {
    if (!globalShortcut.register(cfg.toggleHotkey, () => {
      if (!win) return;
      if (win.isVisible()) win.hide(); else { win.showInactive(); win.setAlwaysOnTop(cfg.alwaysOnTop, "screen-saver"); }
    })) bad.push(cfg.toggleHotkey);
  } catch { bad.push(cfg.toggleHotkey); }
  try { if (!globalShortcut.register("F8", () => { if (win && !win.isDestroyed()) win.webContents.send("tap"); })) bad.push("F8"); } catch { bad.push("F8"); }
  if (bad.length) lastError = "These hotkeys are taken by another app: " + bad.join(", ") + ". Pick different ones in Settings.";
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 460, height: 820, minWidth: 340, minHeight: 300,
    title: "Phasmo Ghost Finder",
    backgroundColor: "#0d0e12",
    alwaysOnTop: cfg.alwaysOnTop,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setAlwaysOnTop(cfg.alwaysOnTop, "screen-saver");
  win.setOpacity(Math.min(1, Math.max(0.3, Number(cfg.opacity) || 1)));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.on("did-finish-load", () => pushStatus());
}

// ---------- IPC ----------
ipcMain.handle("obs:launch", async () => { const ok = await launchObs(); if (ok) return connectObs({ waitForStart: true }); return false; });
ipcMain.handle("obs:connect", () => connectObs());
ipcMain.handle("obs:save", () => saveClip());
ipcMain.handle("clip:show", () => { if (lastClip && fs.existsSync(lastClip)) { shell.showItemInFolder(lastClip); return true; } return false; });
ipcMain.handle("game:launch", () => { shell.openExternal("steam://rungameid/739630"); return true; });
ipcMain.handle("site:open", () => { shell.openExternal(cfg.websiteUrl); return true; });
ipcMain.handle("cfg:get", () => ({ ...cfg, password: cfg.password ? "********" : "", hasPassword: !!cfg.password, detectedObs: findObs() }));
ipcMain.handle("cfg:set", async (_e, patch) => {
  const allowed = ["obsPath", "host", "port", "password", "autoStartObs", "autoStartGame", "showClipAfterSave", "saveHotkey", "toggleHotkey", "alwaysOnTop", "opacity", "websiteUrl"];
  for (const k of allowed) if (patch && Object.prototype.hasOwnProperty.call(patch, k)) {
    if (k === "password" && patch.password === "********") continue;
    cfg[k] = k === "port" ? Number(patch.port) || 4455 : k === "opacity" ? Number(patch.opacity) || 1 : patch[k];
  }
  if (!/^https:\/\//.test(cfg.websiteUrl)) cfg.websiteUrl = DEFAULTS.websiteUrl;
  saveCfg();
  lastError = "";
  registerHotkeys();
  if (win) { win.setAlwaysOnTop(!!cfg.alwaysOnTop, "screen-saver"); win.setOpacity(Math.min(1, Math.max(0.3, cfg.opacity))); }
  if (connected) { try { await obs.disconnect(); } catch {} connected = false; }
  await connectObs();
  pushStatus();
  return true;
});
ipcMain.handle("cfg:browseObs", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Find obs64.exe", properties: ["openFile"], filters: [{ name: "OBS", extensions: ["exe"] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("win:opacity", (_e, v) => { const o = Math.min(1, Math.max(0.3, Number(v) || 1)); cfg.opacity = o; saveCfg(); if (win) win.setOpacity(o); return o; });

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    loadCfg();
    createWindow();
    registerHotkeys();
    if (cfg.autoStartObs) {
      if (await launchObs()) {
        await connectObs({ waitForStart: true });
        // Start the game after OBS so Game Capture can hook it as it opens.
        if (cfg.autoStartGame) shell.openExternal("steam://rungameid/739630");
      }
    } else {
      if (cfg.autoStartGame) shell.openExternal("steam://rungameid/739630");
      await connectObs();
    }
    pushStatus();
  });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); try { obs.disconnect(); } catch {} });
  app.on("window-all-closed", () => app.quit());
}
