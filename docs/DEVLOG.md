# SELARA BAY — DEVLOG

Written by the build agent, updated at every commit. If this context gets
summarized, re-read this file plus `PROMPT-FINAL__1.md` (the canonical
prompt, 21 Nov 10:12) before continuing.

## Current step

**Checkpoint 1 (step 10 of 18): Tier 1 verification — DONE 21 Nov ~11:05
WITA.** The full playtest (`tools/playtest.mjs`, 26 checks) passes
**26/26, `PLAYTEST ALL PASS`, exit 0** (log
`~/workspace/playtest-tier1-run2.log`). Before these fixes the run was
17 PASS / 8 FAIL (21 Nov ~10:11 WITA). `node main.ts` verified twice,
exit 0, byte-identical. FPS per preset measured (see below). The game
is now submittable. Tier 2 (steps 11–14) is next.

## The main.ts contract (from the kit — step 1 revision)

Read from `~/workspace/gta6-kit/gta6-01-kit/`: `RULES.txt` (537 lines),
`competition.yaml` (591 lines), `kit.json`, `starter/` (`main.ts`,
`serve.ts`, `vendor/makefun-game.ts`, `game/`, 3 screenshots, `shots.json`,
`LICENSE`), `harness/` (`harness-src.tar.gz` + sha256 lists).

- **The game** is static files under `game/` (plain files/dirs only, no
  symlinks), `game/index.html` a regular file ≤ 1 MiB. Everything it
  loads is a file under `game/` or a `data:` URI — no network, no CDN.
  `game/` ≤ 993 files+dirs together, ≤ 48 MiB in all, every path ≤ 1000
  UTF-8 bytes. `/output` as a whole caps at 1000 entries / 64 MiB.
- **`main.ts`** (repo root, Node 22, stdlib only): copies `game/` and
  `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes
  `/output/dossier.json` with `buildDossier` from the kit's
  `vendor/makefun-game.ts` (byte-for-byte the kit copy, never edited).
  The grader runs it with no network, a read-only repo, a writable
  output dir, 1 CPU, 1024 MB RAM, 10 s wall time. **It runs twice and
  both runs must write the same bytes.** Verified 21 Nov: two runs exit
  0 in ~0.86 s each, byte-identical output, dossier 362,367 bytes.
  This program also checks the copied tree against the caps itself
  (entries/bytes/symlinks/index.html/screenshots) and builds the dossier
  twice in memory, refusing to write unless both builds agree byte for
  byte, then reads the written file back and verifies it.
- **Gate (5 rows, first 4 decide validity):** `game_files`,
  `references` (nothing loads over the network; at most one import map,
  valid JSON), `screenshots` (3–4 images, each ≤ 256 KiB, long side
  ≤ 1280, short side ≥ 480 px, plain names), `dossier_matches`
  (byte-for-byte what `buildDossier` writes, ≤ 1.5 MiB, text ≤ 160 KiB);
  `js_parses` is shown only and never decides validity.
- **Screenshots:** 3–4 PNG/JPEG, real renders of the game's own code,
  first by name is the cover. **The kit wins over the prompt here:**
  the prompt says 1920×1080, the kit caps the long side at 1280 — we
  capture 1280×720, each ≤ 256 KiB.
- **Transcript gate (12 checks):** ≥ 30% of counted lines authored
  (first carried by the agent's own write/edit in a recorded session),
  ≤ 40% unwritten lines, entrypoint ≥ 1 authored line, some file revised
  by ≥ 2 write messages, ≥ 5 assistant turns with text/thinking, every
  session witnessed by a sealed recording. No codegen, no copy/paste of
  code from anywhere; every source file is written with the agent's own
  write/edit tool. `*.min.js` vendored files are left out of the count.
  A run record (`makefun-run.json`) is required for entries received
  from 17 Nov 2026 00:00 UTC.
- **Submit (GitHub repo entry):** repo must be the entrant's (owner =
  GitHub login, or `.makefun/owner.json` `{"wallet": "<address>"}`),
  created after the competition opens (2026-11-17T15:00:00Z), OSI
  license. README shows the 3 live make.fun badges as images (no
  `{owner}` placeholder). GitHub About must be set before submit:
  website on make.fun + topic `makefun` (set by bos/leader, not by the
  build agent). Quota: 5 submissions/day UTC, 10 total. Final entry =
  most recent receipt before the deadline.
- **Competition:** gta6-01, $1,666 USDC, top 100 paid, closes
  24 Nov 2026 23:00 WITA, final results 10 Dec 2026. Judge:
  z-ai/glm-5.3-flash on a dossier view (contact sheet + source outline,
  1,536 tokens). Criteria in order: complete open world in screenshots;
  depth/fun; feel/polish; look/originality; structure.
- **Harness:** `harness/harness-src.tar.gz` holds the grader source
  exactly as the server runs it; `kit.json` lists the sha256 of every
  kit file. There is no local grade — the server grades every entry.

## Repo and recordings

- **Repo (FINAL): `SkyScrapperR/gta6-muse`** (public, created by bos
  21 Nov 10:15 WITA, empty at first push). Remote `origin` =
  `https://github.com/SkyScrapperR/gta6-muse.git`, branch `main`.
  NEVER push to `SkyScrapperR/gta6` (empty, not the target) or
  `gta6-entry` (the rejected SOLARA BAY repo). The prompt still prints
  badge URLs with `SkyScrapperR/gta6` — that is WRONG for this repo;
  README badges use `gta6-muse` (see Decisions).
- **`.makefun/owner.json`: NOT needed.** The repo owner is SkyScrapperR,
  the same as the GitHub login, so the rules do not require a claim
  file. `.makefun/freshness.json` (drand anchor) is already in the repo
  from the early setup; it is harmless for a GitHub-repo entry.
- **Recordings:** `01a1fb4a` SEALED 21 Nov ~09:33 (703 chunks,
  5,369 leaves, receipt in `~/.makefun/recordings.json`) — steps 1–10
  witnessed there. `01a1fbbe-b2f9-7259-9f9f-6e31985a22c7` RUNNING
  (PID 3196, alive). This session is witnessed by 01a1fbbe. **Submit
  with BOTH recordings** (do NOT run it — bos said "jangan submit
  sebelum aku suruh"):
  `node cli/makefun.mjs submit --competition gta6-01 --repo-url https://github.com/SkyScrapperR/gta6-muse --commit <SHA> --title "Selara Bay" --recording 01a1fb4a-cb4f-7648-a230-7a9f131c43d4,01a1fbbe-b2f9-7259-9f9f-6e31985a22c7 --repo ~/workspace/selara-bay-final-entry --keypair <wallet.json>`
  (run from inside the kit dir; keypair path is the leader's).
- **Push:** commit + push to `origin main` after every step. First
  push carries step 1–9 (local) + step 10.

## Decisions

- **Kit wins over prompt** wherever they differ: screenshots 1280×720
  (not 1920×1080); `main.ts` follows the kit starter exactly.
- **Originality:** everything is original — city, characters, cars,
  story, music. No Rockstar names/art/music. Custom WebGL2 engine, no
  Three.js/Babylon. LICENSE: MIT, holder "I Wayan Bagus Somabawa".
- **Presets (PROMPT-FINAL__1, section 2):** the build machine's GPU is
  weak — NEVER lower High visuals to fit it; scale with presets.
  Low: no shadow/bloom, render scale ~0.6, 12 lights, short draw
  distance. Medium: 1024² shadows, half-res bloom, 24 lights. High:
  full look, screenshot quality. Targets on this machine: Low 30+ fps,
  Medium playable, High may be slow (fine — High is for strong GPUs +
  screenshots). First run auto-picks the default from a 2 s FPS probe;
  the choice is saved in localStorage (`selara-bay-quality-v1`) and
  changeable in Settings. Adaptive resolution may lower render scale
  during play but MUST be off for screenshots (it does not exist yet —
  Tier 3 step 17). Screenshots ALWAYS High, render scale 1.0; a static
  capture needs no real-time FPS. FPS counter on F3. **Long automated
  playtests run on Low.** FPS per preset is measured in headed Chrome
  and reported honestly — this VM has no GPU (SwiftShader), so expect
  ~2 fps even on Low; that is the machine, not the game.
- **Authorship:** no codegen, no `node build-songs.js > songs.js`.
  Tier 2 music files are written by hand. `package-lock.json` is never
  committed (removed from tracking at step 10; `.gitignore` covers it).
- **No secrets** in the repo or its history.

## File map

- `main.ts` — entrypoint (Checkpoint 1 revision: pre-dossier cap
  checks + double-build determinism check + read-back verify).
- `vendor/makefun-game.ts` — kit copy, unchanged.
- `serve.ts` — static server for local playtests (`node serve.ts`).
- `vercel.json` — Vercel serves `game/` (output directory `game`).
- `game/index.html`, `game/style.css` — page + styles.
- `game/js/main.js` — boot, frame loop, state machine, quality presets
  + 2 s FPS probe + F3 counter.
- `game/js/core/` — `input.js` (keyboard/mouse/pointer lock, edge
  detection that never loses a tap between frames), `math.js`.
- `game/js/engine/` — `gl.js`, `renderer.js`, `shaders.js`, `mesh.js`,
  `frustum.js`, `sky.js` (time-of-day dome). `post.js` / `shadows.js`
  do NOT exist yet (Tier 2).
- `game/js/world/` — `city.js` (10×10 blocks, 5 districts, landmarks),
  `city-meshes.js`, `collision.js`, `roads.js` (road graph, lanes,
  traffic lights), `props.js`.
- `game/js/entities/` — `player.js`, `vehicle.js`, `character.js`,
  `pedestrian.js`.
- `game/js/ai/` — `traffic.js`, `police.js` (wanted 0–5, LOS-based
  hunt), `combat-ai.js`.
- `game/js/combat/` — `weapons.js`, `pickups.js`.
- `game/js/fx/particles.js`, `game/js/story/` — `missions.js` (6
  missions), `dialogue.js`, `cutscene.js`.
- `game/js/ui/` — `hud.js`, `minimap.js`, `bigmap.js`, `menus.js`
  (title/pause/settings/controls/credits), `notifications.js`.
- `game/js/audio/sfx.js` — synthesized SFX. `game/js/audio/music/`
  does NOT exist yet (Tier 2).
- `game/js/debug/shots.js` — `?shot=N` screenshot scenes.
- `game/js/save.js` — localStorage save (`selara-bay-save-v1`).
- `screenshots/` — 4 JPEGs, 1280×720, ~33–39 KiB each (≤ 256 KiB).
- `tools/` — `playtest.mjs` (25 checks), `screenshots.mjs`,
  `fpsdiag.mjs`, `m4diag2.mjs`, `m4smoke.mjs`, `m3diag.mjs`,
  `fdiag.mjs`, `inputdiag.mjs`, `aimdiag2.mjs`, `drivetest.mjs`,
  `smoke.mjs`, `package.json` (minimal, handwritten).
- `MUSIC.md` — soundtrack plan (data only, no implementation yet).

## Step-10 fixes (this session, in the working tree)

1. **Game loop soft-lock (root cause of aim + wanted-decay + M3
   failures):** `player.js` inCar branch read `this.inCar.x` after
   `drive()` had exited the car (null) → TypeError inside `frame()`,
   and `requestAnimationFrame(frame)` was the last line, so the
   exception killed the loop forever. Fix: guard after `drive()` and
   move `requestAnimationFrame(frame)` to the top of `frame()`.
   Verified with `tools/fdiag.mjs` (F enter/exit repeats cleanly).
2. **Aim test (test-side):** mouse moved after setting camYaw swung
   the camera; camYaw was computed from the player, not the camera
   (over-the-shoulder parallax ~3° at 15 m > gang hit-sphere). Fix:
   move mouse before aiming; aim from `cameraForRender().pos` in
   2 passes. Verified: hp 50 → 32.
3. **Police hunt (game-side):** cop cars repathed to the player's LIVE
   position every 2 s (perfect knowledge). Fix: hunt `searchCenter`
   (last seen) when unseen. Verified in isolation (decay 2→1 ~60 s,
   1→0 ~170 s).
4. **Cop sight radii (game-side, this session):** car 90 → 60 m, foot
   50 → 35 m. A cop a block away could keep eyes on Kai through the
   streets, so the Bukit hops never broke the chase; foot cops glued
   to Kai kept `seen` true forever.
5. **M4 Wheelman (game-side, this session):** stage 1 "Get in a car —
   Dex is getting in" required the player in a car within 8 m of Dex,
   but Dex stands on the sidewalk 41 m from the road — no real player
   could ever pass it, and the playtest's road-spot teleport could
   not either (clean repro: stuck at stage 0, then stage 2 after the
   return teleport accidentally satisfied stages 0+1 at once). Fix:
   Dex now walks to Kai's car at 4.5 m/s and climbs in within 4 m.
   Verified with `tools/m4smoke.mjs`: stage 0→1 on foot by Dex's
   door, Dex walks 41 m to the car, stage 1→2.
6. **M4 test (test-side):** teleport Kai ON FOOT to
   `sidewalkSpot('dexHome')` for stage 0, then spawn the car, press F,
   and POLL the stage to ≥ 2 (30 s) before the bank teleport; clear
   any leftover `inCar` at M4 start.
7. **Pause/resume test (test-side):** fixed 800 ms waits could land
   between frames at ~2 fps and miss the keypress. Fix: poll for the
   state change (up to 6 s) instead.
8. **Presets (game + tools, this session):** `applyQuality` now sets
   render scale (Low 0.6 / Medium 1.0 / High 1.0) plus the DPR cap
   (1 / 1.5 / 2), saves the choice, syncs the Settings select; 2 s
   FPS probe on first run auto-picks Low/Medium/High (< 25 / < 45 /
   else); F3 toggles the FPS counter (drawn on the HUD with the
   preset name); F3 no longer opens the browser find. Playtest runs
   on Low; screenshots tool sets High before capture. Shadow size /
   bloom / light counts are recorded in the preset but apply once
   those systems land in Tier 2.

## Open bugs / known gaps

- **Playtest: 26/26 PASS** (21 Nov ~11:05 WITA). The 8 failures from
  the 10:11 run (wanted decay, M4, M6, continue, death, arrest,
  resume) are all fixed: M6/continue/death/arrest were cascades of
  the M4 failure (missing $800 reward broke the money expectations);
  resume was the fixed-wait race. Money path verified end to end:
  $5,550 after M6 → $5,450 after death → $5,350 after arrest.
- **FPS on this machine (measured 21 Nov, `tools/fpsdiag.mjs`, title
  screen, headed Chrome, SwiftShader, no GPU): Low mean 2.8 fps
  (samples 4, 2, 3, 3, 2; backing 768×432), Medium mean 2.2 fps
  (2, 2, 2, 2, 3; 1280×720), High mean 1.6 fps (2, 2, 1, 2, 1;
  1280×720). Low is ~75% faster than High (render scale 0.6 works),
  but everything is single digits: the VM's software rasterizer is
  the bottleneck. The prompt's Low 30+ fps target is NOT achievable
  on this machine — that is a machine limit, stated plainly. On a
  real GPU the same presets will run far faster; High is the
  screenshot quality and does not need real-time FPS.
- **Tier 2 missing:** shadow map 2048² PCF, post chain (HDR + bloom +
  auto-exposure + ACES + vignette + grade), night point lights 32–48,
  rain + wet roads, traffic-light signal-head geometry, Rajawali
  helicopter + spotlight, music system (`game/js/audio/music/`),
  GPS route wiring (minimap.route is never set), Wasp/Thunder models
  + unlock wiring. Traffic-light logic and GPS drawing exist; the
  geometry/wiring do not.
- **Tier 3 missing:** roadblocks, shoot-down heli, full soundtrack +
  MUSIC.md, side content (12 Orchid tags, respray, gun shop, stats
  screen), adaptive resolution, slow motion, hit markers, extra props.
- **Screenshots:** 4 exist and are current for Tier 1; retake only if
  visuals change materially (Tier 2 will change them — retake then,
  on High).
- **GitHub About** (website on make.fun + topic `makefun`) must be set
  before submit — bos/leader job, not the build agent's.
- **`.makefun/freshness.json`** predates this session; leave it alone.
- **`tools/package-lock.json`** was tracked in earlier commits; it is
  removed from tracking at step 10 (`git rm --cached`, file stays on
  disk untracked). History is never rewritten.

## How to verify (for the next session)

- `node tools/playtest.mjs` (headed Chrome, Xvfb :99, Low preset) —
  expect 25/25 PASS and `PLAYTEST ALL PASS`, exit 0.
- `MAKEFUN_OUTPUT_DIR=<dir> node main.ts` twice — exit 0, ≤ 10 s,
  byte-identical output.
- `node tools/fpsdiag.mjs` — FPS per preset, headed Chrome.
- `node tools/screenshots.mjs` — retakes the 4 shots on High.
- `git ls-files` must contain no lockfiles, generated files or secrets
  before the final checkpoint.
