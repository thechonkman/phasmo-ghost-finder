// End-to-end check: runs the real app (main.js, overlay and HUD) against a fake OBS and clicks through it.
// Linux: xvfb-run -a -s "-screen 0 1920x1080x24" ./node_modules/electron/dist/electron test/harness.js --no-sandbox --disable-gpu
const { app, BrowserWindow, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startFakeObs } = require("./fake-obs");

const PORT = 4466, PASSWORD = "s3cret-test";
const OUT = process.env.SHOT_DIR || os.tmpdir();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pgf-"));
app.setPath("userData", dir);
fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ autoStartObs: false, port: PORT, password: PASSWORD }));

const results = [];
const consoleErrors = [];
const check = (name, ok, info = "") => results.push({ name, ok: !!ok, info });
const clipDir = fs.mkdtempSync(path.join(os.tmpdir(), "pgf-clips-"));
const obs = startFakeObs({ port: PORT, password: PASSWORD, clipDir });
let started = false;

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, level, message) => { if (level >= 2 && !/fonts\.g|ERR_TUNNEL|ERR_PROXY|net::ERR/.test(message)) consoleErrors.push(message); });
  win.webContents.on("did-finish-load", async () => {
    if (!win.webContents.getURL().endsWith("index.html") || started) return;
    started = true;
    const js = (code) => win.webContents.executeJavaScript(code, true);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const vis = (sel) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e && getComputedStyle(e).display!=="none" && !e.closest("[hidden]") && !e.closest(".collapsed>:not(h2)")})()`);
    const txt = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent||""`);
    const key = async (k) => { win.webContents.sendInputEvent({ type: "keyDown", keyCode: k }); win.webContents.sendInputEvent({ type: "char", keyCode: k }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: k }); await wait(80); };
    const shot = async (name) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name), img.toPNG()); };
    const hudWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith("hud.html"));
    try {
      await wait(1000);
      check("overlay opens on start", win.isVisible());
      check("difficulty box shows on open", await vis("#modal"));
      check("online-only Ask Claude panel is hidden in the app", !(await vis("#aiBox")));
      check("OBS and Settings panels show", (await vis("#obsBox")) && (await vis("#setBox")));
      await shot("overlay-difficulty.png");
      await js(`$("startBtn").click()`);
      check("start without a pick keeps the box and asks to pick", (await vis("#modal")) && /Pick a difficulty/.test(await txt("#mtitle")));
      await js(`document.querySelector('[data-d="nightmare"]').click(); $("startBtn").click()`);
      check("box closes after picking Nightmare", !(await vis("#modal")));
      check("top bar shows Nightmare", /Nightmare/.test(await txt("#diffName")));
      // Evidence
      await js(`document.querySelector('[data-ev="emf"]').click(); document.querySelector('[data-ev="orb"]').click()`);
      check("Nightmare EMF + Orbs leaves Dayan and Raiju", (await txt("#remain")) === "2", await txt("#remain"));
      check("ghost cards follow the evidence", await js(`[...document.querySelectorAll("#board .card:not(.out) .gname")].map(e=>e.textContent).sort().join()==="Dayan,Raiju"`));
      await key("1"); await key("1");
      check("key 1 cycles EMF back to unknown", !(await js(`!!S.ev.emf`)));
      // Ghost details and search
      await js(`[...document.querySelectorAll("#board .gname")].find(e=>e.textContent==="Raiju").click()`);
      check("clicking a ghost name shows its details", await js(`(()=>{const c=[...document.querySelectorAll("#board .card")].find(c=>c.querySelector(".gname").textContent==="Raiju");return getComputedStyle(c.querySelector(".stats")).display!=="none"})()`));
      await js(`$("gsearch").value="ban"; $("gsearch").dispatchEvent(new Event("input"))`);
      check("search shows only matching ghosts", await js(`[...document.querySelectorAll("#board .card")].filter(c=>getComputedStyle(c).display!=="none").map(c=>c.querySelector(".gname").textContent).join()==="Banshee"`));
      await js(`$("gsearch").value=""; $("gsearch").dispatchEvent(new Event("input"))`);
      // Panels collapse
      await js(`document.querySelector("#huntBox > h2").click()`);
      check("panel header closes the panel", await js(`$("huntBox").classList.contains("collapsed")`));
      await js(`$("layoutReset").click()`);
      check("Open all panels reopens it", !(await js(`$("huntBox").classList.contains("collapsed")`)));
      // Filters and questions
      await js(`$("huntSan").value="64"; $("huntSan").dispatchEvent(new Event("input"))`);
      check("hunt at 64% keeps only ghosts that can hunt near that", await js(`computeRows().filter(r=>!r.why).every(r=>r.g.max+3>=64)`));
      await js(`$("huntSan").value=""; $("huntSan").dispatchEvent(new Event("input"))`);
      await js(`document.querySelector('[data-q="male"][data-a="0"]').click()`);
      check("answering Male rules out Banshee and Dayan", await js(`computeRows().filter(r=>["banshee","dayan"].includes(r.g.id)).every(r=>r.why)`));
      // Tapper: 8 taps 600 ms apart = 100 BPM
      for (let i = 0; i < 8; i++) { await js(`$("tapBtn").click()`); await wait(600); }
      const bpm = await txt("#bpm");
      check("tapper reads about 100 BPM", /^(9[7-9]|10[0-3]) BPM$/.test(bpm), bpm);
      // Size buttons
      await js(`$("zIn").click()`); await wait(300);
      check("A+ makes the overlay bigger", (await txt("#zReset")) === "110%", await txt("#zReset"));
      await js(`$("zReset").click()`); await wait(300);
      check("100% resets the size", (await txt("#zReset")) === "100%");
      await shot("overlay-1920.png");
      // OBS through the fake server
      await js(`window.phasmo.connectObs()`); await wait(900);
      check("connects to OBS with the password", /Connected/.test(await txt("#obsText")), (await txt("#obsText")) + " | " + (await txt("#obsErr")));
      check("app asks OBS for clip-saved events", ((obs.state.identify && obs.state.identify.eventSubscriptions) & 64) === 64, JSON.stringify(obs.state.identify));
      check("app turns the replay buffer on", obs.state.replayActive);
      await js(`$("obsSave").click()`); await wait(900);
      check("save clip shows the clip path", /Replay 1\.mp4/.test(await txt("#clipInfo")), await txt("#clipInfo"));
      check("Show clip button enabled after a save", await js(`!$("obsShow").disabled`));
      await js(`$("obsSave").click()`); await wait(900);
      check("saved clips list shows both clips", (await js(`$("clipList").querySelectorAll("[data-ctrash]").length`)) === 2);
      check("Recycle all asks for a second click first", await js(`(()=>{$("trashAll").click();return /Click again/.test($("trashAll").textContent)})()`));
      await js(`document.querySelector("[data-ctrash]").click()`); await wait(1200);
      const left = await js(`$("clipList").querySelectorAll("[data-ctrash]").length`), cmsg = await txt("#clipMsg");
      check("Recycle moves a clip to the Recycle Bin, or says clearly why it couldn't", (left === 1 && /Recycle Bin/.test(cmsg)) || /Couldn't move it to the Recycle Bin/.test(cmsg), `left=${left} msg=${cmsg}`);
      check("only this app's clips can be recycled", (await js(`window.phasmo.trashClip("/etc/hostname").then(r=>r.ok)`)) === false);
      // Footsteps: a Revenant-style hunt (crawl at 1.0 m/s, then 3.0 m/s) should point to the Revenant
      await js(`(()=>{const t=[0];for(let i=0;i<6;i++)t.push(t[t.length-1]+60000/55);for(let i=0;i<10;i++)t.push(t[t.length-1]+60000/165);hunts=[{t0:0,taps:t}];drawTaps();})()`);
      check("hunt log shows the slow-then-fast change", /slow .*→ .*very fast/.test(await txt("#huntLog")), await txt("#huntLog"));
      check("best guess names the Revenant", /Best guess:\s*Revenant/.test(await txt("#guess")), await txt("#guess"));
      // Notes: copy from the app, then load them back
      await js(`$("copyNotes").click()`); await wait(300);
      const notes = clipboard.readText();
      check("Copy notes puts readable notes plus saved state on the clipboard", /Phasmo Ghost Finder notes/.test(notes) && /Footsteps:\nHunt 1:/.test(notes) && /PGF-STATE:/.test(notes), notes.slice(0, 160));
      const restored = await js(`(()=>{const before=JSON.stringify(getState());S.ev={};S.ans={};hunts=[];render();const ok=takeNotes(${JSON.stringify(notes)});return ok&&JSON.stringify(getState())===before})()`);
      check("pasting the notes restores evidence, answers and footsteps exactly", restored);
      check("version shows in Settings", /^Version \d+\.\d+\.\d+/.test(await txt("#updText")), await txt("#updText"));
      await js(`window.phasmo.setSettings({password:"wrong"})`); await wait(1200);
      check("wrong password shows a clear message", /password/i.test(await txt("#obsErr")), await txt("#obsErr"));
      await js(`window.phasmo.setSettings({password:${JSON.stringify(PASSWORD)}})`); await wait(1200);
      check("reconnects after fixing the password", /Connected/.test(await txt("#obsText")), await txt("#obsErr"));
      check("settings keep the password hidden", (await js(`$("sPw").value`)) === "********");
      check("hotkey labels show Insert / Ctrl+Shift+S / F8", (await txt("#ovKey")) === "Insert" && (await txt("#saveKey")) === "Ctrl+Shift+S" && (await txt("#tapKey")) === "F8", [await txt("#ovKey"), await txt("#saveKey"), await txt("#tapKey")].join(","));
      // Back to game: overlay hides, HUD shows with live data
      await js(`$("closeOv").click()`); await wait(1500);
      const hud = hudWin();
      check("Back to game hides the overlay", !win.isVisible());
      check("corner info box shows while playing", hud && hud.isVisible());
      const hudText = hud ? await hud.webContents.executeJavaScript(`document.body.innerText`) : "";
      check("info box shows difficulty, evidence and ghosts", /Nightmare/.test(hudText) && /Ghost Orb/.test(hudText) && /Raiju/.test(hudText), hudText.replace(/\n/g, " | "));
      check("info box shows OBS recording", /Recording/.test(hudText));
      check("info box shows the best guess", /Best guess: Revenant/.test(hudText), hudText.replace(/\n/g, " | "));
      if (hud) { const img = await hud.webContents.capturePage(); fs.writeFileSync(path.join(OUT, "hud.png"), img.toPNG()); }
      // Reopen (second launch of the app does the same as the hotkey)
      app.emit("second-instance"); await wait(600);
      check("opening again shows the overlay and hides the info box", win.isVisible() && !(hud && hud.isVisible()));
      // Esc goes back to the game
      await js(`document.activeElement&&document.activeElement.blur()`); await key("Escape"); await wait(500);
      check("Esc goes back to the game", !win.isVisible());
      app.emit("second-instance"); await wait(600);
      // Custom 0-evidence + speed scaling
      await js(`$("diffChip").click(); document.querySelector('[data-d="custom"]').click(); $("cEvi").value="0"; $("cSpeed").value="1.5"; $("startBtn").click()`);
      check("custom 0 evidence applied", (await js(`S.evi`)) === 0 && (await js(`S.speedMod`)) === 1.5);
      check("single ghost title reads naturally", /^It's The Mimic$/.test(await txt("#boardTitle")), await txt("#boardTitle"));
      check("speeds scale to 150%", /2\.55/.test(await js(`fmtSpeed(G.find(g=>g.id==="spirit").spd)`)));
      // Smaller screen: everything still reachable
      win.setBounds({ x: 0, y: 0, width: 1280, height: 720 }); await wait(500);
      await shot("overlay-1280.png");
      check("all five columns sit side by side at 1280x720", await js(`(()=>{const t=[...document.querySelectorAll(".col")].map(c=>Math.round(c.getBoundingClientRect().top));return t.every(x=>x===t[0])})()`));
      check("no sideways page scroll at 1280x720", await js(`document.documentElement.scrollWidth<=innerWidth+1`));
      check("every column fits the screen height (scrolls inside)", await js(`[...document.querySelectorAll(".col")].every(c=>c.getBoundingClientRect().height<=innerHeight)`));
      // New contract with R
      await key("R"); await wait(300);
      check("R starts a new contract and asks difficulty again", (await vis("#modal")) && (await js(`Object.keys(S.ev).length===0 && Object.keys(S.ans).length===0`)));
    } catch (e) {
      check("harness ran without crashing", false, String((e && e.stack) || e));
    }
    check("no errors in the window console", consoleErrors.length === 0, consoleErrors.join(" | "));
    const failed = results.filter((r) => !r.ok);
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.info ? "" : "  -> " + r.info}`);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    await obs.close();
    app.exit(failed.length ? 1 : 0);
  });
});

require("../main.js");
