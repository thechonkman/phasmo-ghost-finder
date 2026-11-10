// Phasmo Ghost Finder - in-game overlay
// - A full-screen, see-through overlay with the ghost finder's panels, opened and closed with one key.
// - A small corner info box (HUD) while the overlay is closed; it never takes clicks.
// - Starts OBS with its replay buffer and saves clips on a global hotkey.
const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile, execFileSync } = require("child_process");
const { default: OBSWebSocket, EventSubscription } = require("obs-websocket-js/json");

const STEAM_GAME = "steam://rungameid/739630";
const DEFAULTS = {
  obsPath: "",
  host: "127.0.0.1",
  port: 4455,
  password: "",
  autoStartObs: true,
  autoStartGame: false,
  showClipAfterSave: false,
  showHud: true,
  saveHotkey: "CommandOrControl+Shift+S",
  overlayHotkey: "Insert",
  tapHotkey: "F8",
  zoom: 1,
  websiteUrl: "https://claude.ai/artifact/HE7x9Ednqk59vpxVDTZv2G"
};

const OBS_GUESSES = [
  "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe",
  "C:\\Program Files (x86)\\obs-studio\\bin\\64bit\\obs64.exe",
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\OBS Studio\\bin\\64bit\\obs64.exe",
  "C:\\Program Files\\Steam\\steamapps\\common\\OBS Studio\\bin\\64bit\\obs64.exe"
];

let gui = null; // the overlay
let hud = null; // the corner info box
let cfg = { ...DEFAULTS };
const obs = new OBSWebSocket();
let connected = false;
let connecting = null;
let lastClip = null;
let lastClipAt = null;
let lastError = "";
let hotkeyError = "";
let quitting = false;

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

// ---------- finding OBS ----------
// OBS's installer records its folder in the registry; use that before guessing.
let regObs;
function obsFromRegistry() {
  if (regObs !== undefined) return regObs;
  regObs = null;
  if (process.platform !== "win32") return regObs;
  for (const key of ["HKLM\\SOFTWARE\\OBS Studio", "HKLM\\SOFTWARE\\WOW6432Node\\OBS Studio", "HKCU\\SOFTWARE\\OBS Studio"]) {
    try {
      const out = execFileSync("reg", ["query", key, "/ve"], { windowsHide: true, encoding: "utf8" });
      const m = out.match(/REG_SZ\s+(.+)/);
      if (m) {
        const exe = path.join(m[1].trim(), "bin", "64bit", "obs64.exe");
        if (fs.existsSync(exe)) { regObs = exe; break; }
      }
    } catch {}
  }
  return regObs;
}
function findObs() {
  if (cfg.obsPath && fs.existsSync(cfg.obsPath)) return cfg.obsPath;
  const pf = [process.env.ProgramW6432, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
    .filter(Boolean).map((d) => path.join(d, "obs-studio", "bin", "64bit", "obs64.exe"));
  return obsFromRegistry() || [...pf, ...OBS_GUESSES].find((p) => fs.existsSync(p)) || null;
}

// ---------- status to both windows ----------
function send(w, ch, data) { if (w && !w.isDestroyed()) w.webContents.send(ch, data); }
function pushStatus(extra = {}) {
  const st = {
    connected, lastClip, saved: lastClipAt, error: [hotkeyError, lastError].filter(Boolean).join(" "),
    obsPath: findObs(), saveHotkey: cfg.saveHotkey, overlayHotkey: cfg.overlayHotkey, tapHotkey: cfg.tapHotkey, ...extra
  };
  send(gui, "obs:status", st);
  send(hud, "obs:status", st);
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
    const child = spawn(exe, ["--startreplaybuffer", "--disable-shutdown-check"],
      { cwd: path.dirname(exe), detached: true, stdio: "ignore", windowsHide: false });
    child.on("error", (e) => { lastError = "Couldn't start OBS from " + exe + ": " + e.message; pushStatus(); });
    child.unref();
    return true;
  } catch (e) {
    lastError = "Couldn't start OBS: " + e.message; pushStatus(); return false;
  }
}

// ---------- OBS remote control ----------
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
        await obs.connect(`ws://${cfg.host}:${cfg.port}`, cfg.password || undefined, { eventSubscriptions: EventSubscription.All });
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

// ---------- overlay show / hide ----------
function overlayVisible() { return !!(gui && !gui.isDestroyed() && gui.isVisible()); }
function placeHud() {
  if (!hud || hud.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const [w, h] = hud.getSize();
  hud.setPosition(area.x + area.width - w - 12, area.y + 12);
}
function showOverlay() {
  if (!gui || gui.isDestroyed()) return;
  // Cover whichever screen the mouse is on, edge to edge.
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  gui.setBounds(d.bounds);
  gui.show();
  gui.setAlwaysOnTop(true, "screen-saver");
  gui.focus();
  gui.webContents.focus();
  if (hud && !hud.isDestroyed()) hud.hide();
  send(gui, "ov:shown", null);
}
function hideOverlay() {
  if (gui && !gui.isDestroyed()) gui.hide(); // Windows hands focus back to the game window underneath.
  if (cfg.showHud && hud && !hud.isDestroyed()) { placeHud(); hud.showInactive(); hud.setAlwaysOnTop(true, "screen-saver"); }
}
function toggleOverlay() { overlayVisible() ? hideOverlay() : showOverlay(); }

// ---------- hotkeys ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const bad = [];
  const reg = (accel, fn) => {
    try { if (!accel || !globalShortcut.register(accel, fn)) bad.push(accel || "(blank)"); }
    catch { bad.push(accel || "(blank)"); }
  };
  reg(cfg.overlayHotkey, toggleOverlay);
  reg(cfg.saveHotkey, () => { saveClip(); });
  reg(cfg.tapHotkey, () => send(gui, "tap", null));
  hotkeyError = bad.length ? "These hotkeys couldn't be used (taken by another app, or not a valid key): " + bad.join(", ") + ". Pick different ones in Settings." : "";
}

// ---------- windows ----------
function guardLinks(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  w.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
}
function createWindows() {
  const prefs = { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true };
  const d = screen.getPrimaryDisplay();
  gui = new BrowserWindow({
    ...d.bounds, show: false, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: false, title: "Phasmo Ghost Finder", webPreferences: prefs
  });
  guardLinks(gui);
  gui.loadFile(path.join(__dirname, "renderer", "index.html"));
  gui.webContents.on("did-finish-load", () => {
    gui.webContents.setZoomFactor(clampZoom(cfg.zoom));
    pushStatus();
    showOverlay(); // show once on start so the difficulty can be picked
  });
  gui.on("close", (e) => { if (!quitting) { e.preventDefault(); hideOverlay(); } });

  hud = new BrowserWindow({
    width: 300, height: 250, show: false, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    resizable: false, movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true,
    title: "Phasmo Ghost Finder HUD", webPreferences: prefs
  });
  hud.setIgnoreMouseEvents(true); // clicks go straight through to the game
  guardLinks(hud);
  hud.loadFile(path.join(__dirname, "renderer", "hud.html"));
  hud.webContents.on("did-finish-load", () => pushStatus());
}
const clampZoom = (z) => Math.min(1.6, Math.max(0.6, Number(z) || 1));

// ---------- IPC ----------
ipcMain.handle("obs:launch", async () => { const ok = await launchObs(); if (ok) return connectObs({ waitForStart: true }); return false; });
ipcMain.handle("obs:connect", () => connectObs());
ipcMain.handle("obs:save", () => saveClip());
ipcMain.handle("clip:show", () => { if (lastClip && fs.existsSync(lastClip)) { shell.showItemInFolder(lastClip); return true; } return false; });
ipcMain.handle("game:launch", () => { shell.openExternal(STEAM_GAME); return true; });
ipcMain.handle("site:open", () => { shell.openExternal(cfg.websiteUrl); return true; });
ipcMain.handle("ov:hide", () => { hideOverlay(); return true; });
ipcMain.handle("ov:zoom", (_e, step) => {
  cfg.zoom = clampZoom(step === 0 ? 1 : Math.round((cfg.zoom + step) * 10) / 10);
  saveCfg();
  if (gui && !gui.isDestroyed()) gui.webContents.setZoomFactor(cfg.zoom);
  return cfg.zoom;
});
ipcMain.handle("app:quit", () => { quitting = true; app.quit(); return true; });
ipcMain.on("hud:update", (_e, data) => send(hud, "hud:data", data));
ipcMain.handle("cfg:get", () => ({ ...cfg, password: cfg.password ? "********" : "", hasPassword: !!cfg.password, detectedObs: findObs() }));
ipcMain.handle("cfg:set", async (_e, patch) => {
  const allowed = ["obsPath", "host", "port", "password", "autoStartObs", "autoStartGame", "showClipAfterSave", "showHud", "saveHotkey", "overlayHotkey", "tapHotkey", "websiteUrl"];
  for (const k of allowed) if (patch && Object.prototype.hasOwnProperty.call(patch, k)) {
    if (k === "password" && patch.password === "********") continue;
    cfg[k] = k === "port" ? Number(patch.port) || 4455 : patch[k];
  }
  if (!/^https:\/\//.test(cfg.websiteUrl)) cfg.websiteUrl = DEFAULTS.websiteUrl;
  saveCfg();
  lastError = "";
  registerHotkeys();
  if (connected) { try { await obs.disconnect(); } catch {} connected = false; }
  await connectObs();
  pushStatus();
  return true;
});
ipcMain.handle("cfg:browseObs", async () => {
  const r = await dialog.showOpenDialog(gui, { title: "Find obs64.exe", properties: ["openFile"], filters: [{ name: "OBS", extensions: ["exe"] }] });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => showOverlay());
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    loadCfg();
    createWindows();
    registerHotkeys();
    // Start the game a few seconds after OBS so Game Capture is ready, whether or not OBS was found.
    const startGame = () => { if (cfg.autoStartGame) shell.openExternal(STEAM_GAME); };
    if (cfg.autoStartObs) {
      const started = await launchObs();
      setTimeout(startGame, started ? 5000 : 0);
      if (started) await connectObs({ waitForStart: true });
    } else {
      startGame();
      await connectObs();
    }
    pushStatus();
  });
  app.on("before-quit", () => { quitting = true; });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); try { obs.disconnect(); } catch {} });
  app.on("window-all-closed", () => app.quit());
}
