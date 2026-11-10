// A stand-in for OBS's WebSocket server (protocol v5), for testing the app without OBS.
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const sha = (s) => crypto.createHash("sha256").update(s).digest("base64");

function startFakeObs({ port, password, replayEnabled = true, clipDir = null }) {
  const state = { replayActive: false, identify: null, requests: [], clipCount: 0, replayEnabled };
  const wss = new WebSocketServer({ port });
  wss.on("connection", (sock) => {
    const salt = crypto.randomBytes(16).toString("base64");
    const challenge = crypto.randomBytes(16).toString("base64");
    const hello = { obsWebSocketVersion: "5.5.2", rpcVersion: 1 };
    if (password) hello.authentication = { challenge, salt };
    sock.send(JSON.stringify({ op: 0, d: hello }));
    sock.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.op === 1) {
        state.identify = msg.d;
        if (password) {
          const expect = sha(sha(password + salt) + challenge);
          if (msg.d.authentication !== expect) { sock.close(4009, "Authentication failed."); return; }
        }
        sock.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (msg.op === 6) {
        const { requestType, requestId } = msg.d;
        state.requests.push(requestType);
        let ok = true, code = 100, responseData;
        if (requestType === "GetReplayBufferStatus") {
          if (!state.replayEnabled) { ok = false; code = 604; } else responseData = { outputActive: state.replayActive };
        } else if (requestType === "StartReplayBuffer") {
          if (!state.replayEnabled) { ok = false; code = 604; } else state.replayActive = true;
        } else if (requestType === "StopReplayBuffer") {
          if (!state.replayActive) { ok = false; code = 501; } else state.replayActive = false;
        } else if (requestType === "SaveReplayBuffer") {
          if (!state.replayActive) { ok = false; code = 501; }
        } else { ok = false; code = 204; }
        sock.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: ok ? { result: true, code } : { result: false, code, comment: "fake failure" }, responseData } }));
        if (ok && requestType === "SaveReplayBuffer") {
          state.clipCount++;
          let savedReplayPath = `C:\\Videos\\Replay ${state.clipCount}.mp4`;
          if (clipDir) { savedReplayPath = require("path").join(clipDir, `Replay ${state.clipCount}.mp4`); require("fs").writeFileSync(savedReplayPath, Buffer.alloc(2048)); }
          setTimeout(() => sock.send(JSON.stringify({ op: 5, d: { eventType: "ReplayBufferSaved", eventIntent: 64, eventData: { savedReplayPath } } })), 150);
        }
      }
    });
  });
  return { state, close: () => new Promise((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(r); }) };
}
module.exports = { startFakeObs };
