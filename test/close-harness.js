// Checks "close everything": MODE=game (Phasmophobia exits) or MODE=button (Close everything clicked twice).
// Linux: MODE=game xvfb-run -a ./node_modules/electron/dist/electron test/close-harness.js --no-sandbox --disable-gpu
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startFakeObs } = require("./fake-obs");

const MODE = process.env.MODE || "game";
const PORT = 4467, PASSWORD = "close-test";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pgf-close-"));
const procs = path.join(dir, "procs.txt");
fs.writeFileSync(procs, "Phasmophobia.exe,obs64.exe");
process.env.PGF_FAKE_PROCS = procs;
process.env.PGF_WATCH_MS = "500";
app.setPath("userData", dir);
fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ autoStartObs: false, port: PORT, password: PASSWORD }));
const obs = startFakeObs({ port: PORT, password: PASSWORD });
const results = [];
const check = (name, ok, info = "") => results.push({ name, ok: !!ok, info });
const t0 = Date.now();

app.on("will-quit", () => {
  const left = fs.readFileSync(procs, "utf8");
  check(`app quits (${MODE})`, true);
  check("OBS's replay buffer was stopped before closing it", obs.state.requests.includes("StopReplayBuffer") && !obs.state.replayActive, obs.state.requests.join(","));
  check("OBS is closed", !/obs64/i.test(left), left);
  if (MODE === "button") check("Phasmophobia is closed", !/Phasmophobia/i.test(left), left);
  check("happens within 20 seconds", Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.info ? "" : "  -> " + r.info}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
});

let started = false;
app.on("browser-window-created", (_e, win) => {
  win.webContents.on("did-finish-load", async () => {
    if (!win.webContents.getURL().endsWith("index.html") || started) return;
    started = true;
    const js = (c) => win.webContents.executeJavaScript(c, true);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(800);
    await js(`window.phasmo.connectObs()`); await wait(800);
    check("connected and recording before closing", obs.state.replayActive);
    if (MODE === "game") {
      await wait(1200); // let the watcher see the game running
      fs.writeFileSync(procs, "obs64.exe"); // the player closes Phasmophobia
    } else {
      await js(`$("closeAll").click()`);
      check("first click only asks to confirm", /Click again/.test(await js(`$("closeAll").textContent`)) && fs.readFileSync(procs, "utf8").includes("Phasmophobia"));
      await js(`$("closeAll").click()`);
    }
    setTimeout(() => { console.log("FAIL  app did not quit within 25 s"); app.exit(1); }, 25000);
  });
});

require("../main.js");
