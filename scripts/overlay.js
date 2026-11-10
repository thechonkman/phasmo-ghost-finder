// Overlay behaviour on top of the shared finder script: panels, search, size, HUD, OBS and settings.
(function () {
  const P = window.phasmo;
  const keyName = (a) => String(a || "").replace(/CommandOrControl|CmdOrCtrl/g, "Ctrl");
  const toAccel = (a) => String(a || "").trim().replace(/\bCtrl\b/gi, "CommandOrControl");
  let overlayKey = "Insert";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  // The online-only Ask Claude panel has no use inside the app.
  $("aiBox").hidden = true;

  // ---- collapsible panels (remembered) ----
  let collapsed = store.get("pgf.collapsed", {});
  document.querySelectorAll("#ov section.box").forEach((sec) => {
    if (collapsed[sec.id]) sec.classList.add("collapsed");
    const h = sec.querySelector(":scope > h2");
    if (!h) return;
    h.tabIndex = 0; h.setAttribute("role", "button"); h.title = "Click to open or close this panel";
    const toggle = () => {
      sec.classList.toggle("collapsed");
      collapsed[sec.id] = sec.classList.contains("collapsed");
      store.set("pgf.collapsed", collapsed);
    };
    h.addEventListener("click", toggle);
    h.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
  $("layoutReset").onclick = () => {
    collapsed = {}; store.set("pgf.collapsed", collapsed);
    document.querySelectorAll("#ov section.box.collapsed").forEach((s) => s.classList.remove("collapsed"));
  };

  // ---- ghost cards: click a name for details; search box ----
  const open = new Set();
  function decorate() {
    const q = $("gsearch").value.trim().toLowerCase();
    document.querySelectorAll("#board .card").forEach((c) => {
      const n = c.querySelector(".gname").textContent;
      c.classList.toggle("open", open.has(n));
      c.classList.toggle("nomatch", !!q && !n.toLowerCase().includes(q));
    });
  }
  $("board").addEventListener("click", (e) => {
    const n = e.target.closest(".gname");
    if (!n) return;
    const k = n.textContent;
    open.has(k) ? open.delete(k) : open.add(k);
    decorate();
  });
  $("gsearch").addEventListener("input", decorate);
  $("gsearch").addEventListener("keydown", (e) => { if (e.key === "Escape" && $("gsearch").value) { e.stopPropagation(); $("gsearch").value = ""; decorate(); } });

  // ---- corner info box (HUD) ----
  function hudData() {
    const alive = computeRows().filter((r) => !r.why);
    return {
      diff: S.diff ? S.diff.n : null, evi: S.evi,
      found: EVK.filter((k) => S.ev[k] === "f").map((k) => EV[k]),
      ruled: EVK.filter((k) => S.ev[k] === "x").map((k) => EV[k]),
      remain: alive.length, names: alive.map((r) => r.g.n),
      bpm: /BPM/.test($("bpm").textContent) ? $("bpm").textContent : "",
      timer: tmI ? $("tm").textContent : "",
      guess: bestGuess().list.map((x) => x.g.n).slice(0, 2).join(" or "),
      key: keyName(overlayKey)
    };
  }
  const sendHud = () => { if (P) P.hudUpdate(hudData()); };
  setInterval(sendHud, 1000);

  // Every redraw of the finder also refreshes the cards' open/search state and the HUD.
  const baseRender = render;
  render = function () { baseRender(); decorate(); sendHud(); };
  render();

  if (!P) return; // opened outside the app: the panels still work, the app parts don't

  // ---- open / close ----
  const back = () => P.hideOverlay();
  $("closeOv").onclick = back;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("modal").hidden) back(); });
  P.onShown(() => { if (document.activeElement) document.activeElement.blur(); });

  // ---- size ----
  const showZoom = (z) => { $("zReset").textContent = Math.round(z * 100) + "%"; };
  $("zOut").onclick = async () => showZoom(await P.zoom(-0.1));
  $("zIn").onclick = async () => showZoom(await P.zoom(0.1));
  $("zReset").onclick = async () => showZoom(await P.zoom(0));

  // ---- OBS panel ----
  P.onStatus((st) => {
    overlayKey = st.overlayHotkey || overlayKey;
    $("ovKey").textContent = keyName(st.overlayHotkey);
    $("saveKey").textContent = keyName(st.saveHotkey);
    $("tapKey").textContent = keyName(st.tapHotkey);
    $("obsDot").classList.toggle("on", !!st.connected);
    $("obsText").textContent = st.connected ? "Connected to OBS. Replay buffer is recording." : (st.obsPath ? "Not connected to OBS." : "OBS wasn't found on this PC.");
    if (st.lastClip) {
      $("obsShow").disabled = false;
      $("clipInfo").innerHTML = `Latest clip${st.saved ? ` (saved ${new Date(st.saved).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })})` : ""}:<br><span class="clipname"></span>`;
      $("clipInfo").querySelector(".clipname").textContent = st.lastClip;
    } else if (st.saving) $("clipInfo").textContent = "Saving clip…";
    clips = st.clips || []; drawClips(); drawUpdate(st);
    if (st.closing) { $("closeAll").disabled = true; $("closeAll").textContent = st.closing; }
    $("obsErr").innerHTML = st.error ? '<div class="warn" style="margin-top:8px"></div>' : "";
    if (st.error) $("obsErr").firstChild.textContent = st.error;
  });
  $("obsStart").onclick = async () => { $("obsText").textContent = "Starting OBS…"; await P.launchObs(); };
  $("gameStart").onclick = () => P.launchGame();
  $("obsSave").onclick = () => P.saveClip();
  $("obsShow").onclick = () => P.showClip();
  const copyNotes = async () => { await P.copyText(exportNotes()); $("copyMsg").textContent = "Notes copied. In the online finder, press Ctrl+V."; setTimeout(() => { $("copyMsg").textContent = ""; }, 8000); };
  $("copyNotes").onclick = copyNotes;
  $("askOnline").onclick = async () => { await copyNotes(); await P.showClip(); await P.openSite(); };

  // ---- saved clips ----
  let clips = [], armAll = false, armTimer = null;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const base = (p) => String(p).split(/[\\/]/).pop();
  const mb = (b) => (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + " MB";
  function drawClips() {
    $("clipList").innerHTML = clips.length ? clips.map((c, i) => `<li><span class="cn" title="${esc(c.path)}">${esc(base(c.path))}</span><button class="btn" data-cshow="${i}">Show</button><button class="btn" data-ctrash="${i}">Recycle</button><span class="ct">${new Date(c.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${mb(c.size || 0)}</span></li>`).join("") : '<li class="ct" style="border:0;background:none;padding:0">No saved clips.</li>';
    $("trashAll").hidden = clips.length < 2;
    if (!armAll) $("trashAll").textContent = `Recycle all ${clips.length} clips`;
  }
  $("clipList").addEventListener("click", async (e) => {
    const s = e.target.closest("[data-cshow]"), t = e.target.closest("[data-ctrash]");
    if (s) P.showClipAt(clips[+s.dataset.cshow].path);
    if (t) { t.disabled = true; const r = await P.trashClip(clips[+t.dataset.ctrash].path); $("clipMsg").textContent = r.ok ? "Moved to the Recycle Bin." : r.error; }
  });
  $("trashAll").onclick = async () => {
    if (!armAll) { armAll = true; $("trashAll").textContent = `Click again to recycle ${clips.length} clips`; clearTimeout(armTimer); armTimer = setTimeout(() => { armAll = false; drawClips(); }, 5000); return; }
    armAll = false; clearTimeout(armTimer);
    const r = await P.trashAllClips(); $("clipMsg").textContent = r.ok ? "All clips moved to the Recycle Bin." : r.error;
  };

  // ---- updates ----
  function drawUpdate(st) {
    const u = st.update || {}, v = st.appVersion ? "Version " + st.appVersion : "";
    const msg = { checking: "checking for updates…", current: "up to date.", downloading: `downloading version ${u.version || ""} (${u.percent || 0}%)…`, ready: `version ${u.version} is ready. It installs when you quit, or restart now.`, error: "couldn't check for updates right now; it will try again later." }[u.state] || "";
    $("updText").textContent = v + (msg ? ": " + msg : "");
    $("updBtn").hidden = u.state !== "ready";
  }
  $("updBtn").onclick = () => P.installUpdate();

  // ---- settings ----
  async function loadSet() {
    const c = await P.getSettings();
    $("sOverlay").value = keyName(c.overlayHotkey); $("sSave").value = keyName(c.saveHotkey); $("sTap").value = keyName(c.tapHotkey);
    $("sObs").value = c.obsPath || ""; $("sObs").placeholder = c.detectedObs ? "found: " + c.detectedObs : "not found, use Browse";
    $("sPort").value = c.port; $("sPw").value = c.password;
    $("sAuto").checked = !!c.autoStartObs; $("sGame").checked = !!c.autoStartGame; $("sHud").checked = !!c.showHud; $("sShow").checked = !!c.showClipAfterSave;
    $("sCloseGame").checked = !!c.closeWithGame; $("sCloseObs").checked = !!c.closeObsToo;
    showZoom(c.zoom || 1);
  }
  loadSet();
  $("sBrowse").onclick = async () => { const p = await P.browseObs(); if (p) $("sObs").value = p; };
  $("sApply").onclick = async () => {
    $("sMsg").textContent = "Saving…";
    await P.setSettings({
      overlayHotkey: toAccel($("sOverlay").value), saveHotkey: toAccel($("sSave").value), tapHotkey: toAccel($("sTap").value),
      obsPath: $("sObs").value.trim(), port: +$("sPort").value, password: $("sPw").value,
      autoStartObs: $("sAuto").checked, autoStartGame: $("sGame").checked, showHud: $("sHud").checked, showClipAfterSave: $("sShow").checked,
      closeWithGame: $("sCloseGame").checked, closeObsToo: $("sCloseObs").checked
    });
    $("sMsg").textContent = "Saved."; loadSet();
  };
  $("quitApp").onclick = () => P.quit();
  // Close everything: click twice so it can't happen by accident.
  let armClose = false, closeTimer = null;
  $("closeAll").onclick = () => {
    if (!armClose) {
      armClose = true; $("closeAll").textContent = "Click again to close the game, OBS and this app";
      clearTimeout(closeTimer); closeTimer = setTimeout(() => { armClose = false; $("closeAll").textContent = "Close everything"; }, 5000);
      return;
    }
    clearTimeout(closeTimer); $("closeAll").disabled = true; $("closeAll").textContent = "Closing…";
    P.closeAll();
  };
})();
