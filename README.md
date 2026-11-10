# Phasmo Ghost Finder

A small always-on-top Windows window for Phasmophobia. It:

- Narrows down all 30 ghosts from evidence, hunt behaviour and deduction questions, for any difficulty including custom and 0-evidence.
- Starts OBS with its Replay Buffer running, so the last stretch of gameplay is always being recorded.
- Saves a clip from anywhere, even mid-game, with one hotkey (**Ctrl+Shift+S** by default).
- Shows or hides itself with **Ctrl+Shift+H**.
- Reads ghost speed from footsteps: press **F8** on each footstep during a hunt, even while the game is focused.

It runs offline and costs nothing to use. To have Claude look at a clip, click **Ask Claude about this clip**. That opens the online finder on claude.ai and shows the clip in its folder, ready to send.

## Download

1. Open the **Releases** page of this repo and download either:
   - `Phasmo Ghost Finder Setup 1.0.0.exe` (installs with a Start-menu shortcut), or
   - `PhasmoGhostFinder-portable-1.0.0.exe` (runs without installing).
2. Windows SmartScreen may warn that the app is unrecognised, because it isn't code-signed. Click **More info → Run anyway**.

If there's no release yet, open the **Actions** tab, click the latest successful **Build Windows app** run, and download the `PhasmoGhostFinder-windows` file at the bottom.

## One-time OBS setup

You need OBS Studio 28 or newer from [obsproject.com](https://obsproject.com).

1. **Capture the game.** In OBS, add a **Game Capture** source and set it to capture Phasmophobia.
2. **Turn on the WebSocket server.** Go to **Tools → WebSocket Server Settings**, tick **Enable WebSocket server**, and click **Show Connect Info** to copy the password. Paste it into this app under **Settings → WebSocket password**.
3. **Turn on the Replay Buffer.** Go to **Settings → Output → Replay Buffer**, tick **Enable Replay Buffer**, and set the maximum time to 30–60 seconds.
4. **Save clips as MP4.** Under **Settings → Output → Recording**, set the format to **MP4**. The online finder can't read MKV.

## Using it

- **Start the app before the game.** It starts OBS (minimised to the tray) with the Replay Buffer running. The dot in the OBS panel turns green when connected.
- **Play in a window.** Set Phasmophobia to **windowed** or **borderless** in its display settings. In exclusive fullscreen the game covers every window, including this one.
- **Mark evidence.** Click the app, then press **1–7**, or click the buttons. **R** starts a new contract.
- **Save a clip.** After a hunt or ghost event, press the save hotkey. The panel shows where it was saved.

## Run from source

```
npm install
npm start
```

Build the Windows installer yourself with `npm run dist`. It must run on Windows.
