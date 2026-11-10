# Phasmo Ghost Finder

An in-game overlay for Phasmophobia on Windows.

- **Opens over the game with one key.** Press **Insert** to bring up the overlay and again (or **Esc**) to go back to the game.
- **Finds the ghost.** The overlay's panels narrow down all 30 ghosts from evidence, hunt behaviour and deduction questions, on any difficulty including custom and 0-evidence.
- **Shows a corner info box while you play.** It lists your difficulty, marked evidence and the ghosts still possible. Clicks pass straight through it to the game.
- **Records clips.** It starts OBS with its Replay Buffer running. **Ctrl+Shift+S** saves the last 30 seconds from anywhere.
- **Reads ghost speed from footsteps.** Press **F8** on each footstep during a hunt.

It runs offline and costs nothing to use. To have Claude look at a clip, click **Ask Claude about this clip**. That opens the online finder on claude.ai and shows the clip in its folder.

Full setup steps are in the Phasmo Ghost Finder Setup Guide.

## Download

Open the **Actions** tab, click the newest green **Build Windows app** run, and download **PhasmoGhostFinder-windows** at the bottom. Unzip it and run `Phasmo Ghost Finder Setup 1.0.0.exe`.

Windows SmartScreen may warn that the app is unrecognised, because it isn't code-signed. Click **More info → Run anyway**.

## Keys

| Key | What it does |
| --- | --- |
| Insert | Open or close the overlay |
| Esc | Close the overlay |
| Ctrl+Shift+S | Save the last 30 seconds as a clip |
| F8 | Tap a ghost footstep |
| 1–7, R, T, F | Evidence, new contract, smudge timer, footstep tap (while the overlay is open) |

Change the first three in the overlay's **Settings** panel. Laptops without an Insert key can use something like F7.

## For developers

- `web/finder.html` is the online finder and the single source of the ghost data and logic.
- `npm run build:overlay` builds `renderer/index.html` (the overlay) from it, using `scripts/overlay.*`.
- `npm test` runs the app against a fake OBS and clicks through it (Linux, needs xvfb).
- `npm start` runs the app; `npm run dist` builds the Windows installer (on Windows).
