# SELARA BAY — DEVLOG

Written by the build agent, updated at every commit. If this context gets
summarized, re-read this file plus `PROMPT-FINAL__1.md` (the canonical
prompt, 21 Nov 10:12) before continuing.

## Current step

**Step 15 of 18: Checkpoint 2 — DONE 21 Nov ~12:49 WITA** (commit
c054f5c; playtest 26/26, FPS + screenshots below). **Step 16 of 18
(Tier 3): DONE 21 Nov ~13:30 WITA** (commit pending; probe 18/18
below). Next: **step 17** — adaptive resolution, slow motion, extra
props + feel tuning; then **step 18** (final checkpoint).

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
  `frustum.js`, `sky.js` (time-of-day dome), `post.js` (HDR + bloom +
  auto-exposure + ACES, Tier 2), `shadows.js` (directional shadow
  map, Tier 2).
- `game/js/world/` — `city.js` (10×10 blocks, 5 districts, landmarks),
  `city-meshes.js`, `collision.js`, `roads.js` (road graph, lanes,
  traffic lights), `props.js`, `traffic-lights.js` (signal-head
  geometry, Tier 2).
- `game/js/entities/` — `player.js`, `vehicle.js`, `character.js`,
  `pedestrian.js`, `helicopter.js` (Rajawali, Tier 2).
- `game/js/ai/` — `traffic.js`, `police.js` (wanted 0–5, LOS-based
  hunt, Rajawali spawn 3+ stars, Tier 2), `combat-ai.js`.
- `game/js/combat/` — `weapons.js`, `pickups.js` (weapon pickups,
  Tier 2).
- `game/js/fx/` — `particles.js`, `lights.js` (point-light registry,
  Tier 2), `rain.js` (weather, Tier 2).
- `game/js/story/` — `missions.js` (6 missions), `dialogue.js`,
  `cutscene.js`.
- `game/js/ui/` — `hud.js` (weather, radio pop-up, hit marker,
  Tier 2), `minimap.js` (GPS route, Tier 2), `bigmap.js` (waypoint
  routes, Tier 2), `menus.js` (title/pause/settings/controls/credits),
  `notifications.js`.
- `game/js/audio/sfx.js` — synthesized SFX. `game/js/audio/music/` —
  `synth.js`, `fx.js`, `sequencer.js`, `radio.js`, `score.js`,
  `index.js`, `songs/` (title, neon-tide, rain-kemuning,
  bukit-sunrise, pursuit, lin-theme) — all hand-written, Tier 2.
- `game/js/debug/shots.js` — `?shot=N` screenshot scenes (chase +
  docks updated to night + rain in Tier 2).
- `game/js/save.js` — localStorage save (`selara-bay-save-v1`).
- `screenshots/` — 4 JPEGs, 1280×720, ~33–39 KiB each (≤ 256 KiB).
  Tier 1 era — retake at Checkpoint 2.
- `tools/` — `playtest.mjs` (25 checks), `screenshots.mjs`,
  `fpsdiag.mjs`, `m4diag2.mjs`, `m4smoke.mjs`, `m3diag.mjs`,
  `fdiag.mjs`, `inputdiag.mjs`, `aimdiag2.mjs`, `drivetest.mjs`,
  `smoke.mjs`, `bootcheck.mjs`, `probe-tier2.mjs`,
  `probe-step14.mjs`, `probe-gun.mjs`, `package.json` (minimal,
  handwritten).
- `MUSIC.md` — soundtrack plan + what is implemented (Tier 2: title,
  Neon Tide, Rain on Kemuning, Bukit Asri Sunrise, Pursuit, Lin's
  Theme; Tier 3: the other 6 radio songs + Viktor theme + credits).

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

## Steps 11–14 (Tier 2, this session)

11. **Rendering (commit aa73d12):** directional shadow map (2048²
    High / 1024² Medium / off Low, texel-snapped ortho fitted to the
    camera, PCF 3×3), post chain (HDR RGBA16F, bright-pass, bloom,
    ACES, vignette, grade, auto-exposure by 4×4 luminance readback),
    night point lights (registry, 12/24/48 per preset, lamps +
    headlights + taillights + lightbars + muzzle flash), rain (clear↔
    rain cycles, streaks + splashes, wet roads with fresnel glint,
    rain SFX), traffic-light signal heads (4 per intersection, live
    red/amber/green). LIT shader: shadow + 48-light array + grime +
    wet + `uTonemap` flag (the filmic shoulder is off when the post
    chain runs, so nothing is tonemapped twice). Sky: procedural
    clouds. Fixed in step 12: `makeProgram` returns a wrapper, so
    `useProgram` needs `.program`; `rain` was created before
    `notifications`/`particles`/`sfx` (TDZ) — moved after `cutscene`.
    Verified: `tools/probe-tier2.mjs` (Medium, 22:00, rain forced):
    post on, shadow 1024², 24 lights, wet 1, 0 errors.
12. **Wiring (commit cea833a):** shadow pass + HDR target in
    `beginFrame`/`endFrame`, quality presets drive shadow size /
    post / light cap, rain dims the palette, HUD weather ("— Rain")
    + radio pop-up + hit marker. Verified by the same probe.
13. **Feel (commit f4b08d8):** `talk` / `hit` (flinch, wins over the
    AI's per-frame pose) / `jump` poses; cutscene facing (cast turns
    to face each other), rule-of-thirds close-ups, warm key + cold
    rim lights on the speaker. Verified: cutscene screenshot
    `screenshots/03-mission-cutscene.jpg` (49,654 bytes) — Lin in
    3/4 profile, speaking gesture, warm key light.
14. **Guns, heli, GPS, music (this commit):**
    - **Weapon models:** kobra/wasp/thunder geometry in the right
      hand (rig, `char-gun-*` batches), synced from the player and
      from gang/boss spawns (Viktor carries the wasp). Verified:
      `charSystem.batches['gun-wasp'].count` = 1 and the renderer
      batch count = 1 while Kai holds it.
    - **Thunder unlock:** M5's `onComplete` spawns a `weapon` pickup
      (purple crate) at the garage + notification; collecting it
      unlocks + equips the Thunder with 24 ammo. Verified by the
      probe (weapons `[fists, wasp, thunder]`, mag 6 / 24).
    - **Rajawali:** spawns at 3+ stars, orbits the player at ~65 m,
      spotlight cone + pool light, fires bursts at 4+ stars; leaves
      (climbs away) when wanted hits 0. Verified: active at 4 stars
      (y 65), inactive after the clear.
    - **GPS:** `Minimap.setRouteTo` (A* route from the player, drawn
      blue), `BigMap.setWaypoint` routes to the waypoint, mission
      stages route to their objective on entry, and a 1 s refresh in
      `main.js` re-routes to the live target (a waypoint wins over
      the mission; reaching it clears it; the beam + marker follow a
      moving target like M6's car). Verified: waypoint route 6 nodes.
    - **Music:** hand-written Web Audio synth (subtractive bass/lead,
      FM e-piano + bells, Karplus-Strong pluck, supersaw pad, noise
      drums) + lookahead sequencer with swing + mix chain (compressor,
      tempo-synced dotted-eighth delay, generated-impulse reverb,
      radio lowpass). Title theme "Heat on the Coast" starts on the
      first gesture and plays on the title screen + on foot. Radio:
      3 stations (Selara Nights FM / Ombak Lo-Fi / Gamelan Wave, one
      song each in Tier 2), starts when Kai gets in a car, R switches
      station, HUD pop-up announces station + song, muffled (700 Hz)
      for 3 s after stepping out, then back to the theme. Score:
      "Pursuit" at 3+ stars (silences the radio), "Lin's Theme" in
      cutscenes, stingers for passed/failed/FLATLINED/CUFFED.
      Verified by `tools/probe-step14.mjs`: **15/15 PASS, 0 errors**
      (title theme, radio start, R switch, muffle 747 Hz, 3 s fade,
      chase score, heli, GPS, Thunder pickup, stingers).
    - **Shots:** chase + docks are now night + rain (the heli spawns
      from the 4-star wanted level in the chase shot).
    - **Probe lesson (not a game bug):** at ~2 fps in SwiftShader,
      `dt` is clamped to 0.1 s/frame, so game time runs ~5× slower
      than real time — the heli despawn, the radio's 3 s timer and
      the gun-batch read all need multi-second real waits. The
      probe's waits are annotated with this.

## Step 15 (Checkpoint 2, this session)

Playtest re-run from zero on Low + FPS per preset + 4 screenshots
retaken on High. **Playtest: 26/26 PASS, 0 console errors, exit 0**
(log `~/workspace/playtest-checkpoint2-run4.log`, 21 Nov ~12:45 WITA;
money path $5,550 after M6 → $5,450 death → $5,350 arrest).

- **FPS collapse found and fixed.** The first re-run was 18/26 with
  Low at **1.0 fps** (Tier 1: 2.8). A control run of the Tier 1
  commit `6f75e1b` on the same machine measured Low 2.6–3.0, proving
  the regression was in the Tier 2 code, not the machine. Root
  cause: the fragment shader. The 12-light forward loop alone costs
  more than the rest of the fragment shader combined on SwiftShader
  (a lights-off A/B: 1.00 → 1.50 fps; the Tier 1 fragment shader
  swapped in: 1.00 → 2.25 fps). The 0.1 s `dt` clamp makes game
  time run at ~0.1× real time at 1 fps, so every time-based check
  (walk, wanted decay, Dex's 41 m walk) failed or starved.
- **Fixes (measured, not guessed):**
  - Traffic-light lamps: spheres (6×8, 80 tris) → flat boxes
    (12 tris); pole cylinder → square post. TL total 133,584 →
    ~29,040 tris/frame. Tree canopies 6×8 → 4×6 (32,208 → 16,104).
  - `uShadowOn` (vertex): `vLightPos` computed only when shadows
    are on. `uDetail` (fragment): grime hash gated behind
    `uDetail > 0.5`. `uClouds` (sky): 0 = off, 1 = one octave,
    2 = two (exact Tier 2 result). Light loop: exact early distance
    cull (`if (d2 >= r*r) continue`).
  - **Low skips the point-light loop entirely** (`renderer.lightsOn`
    false; lamps still glow via emissive) and renders at **0.5
    scale** (was 0.6): the loop alone cost ~0.45 s/frame on this
    machine. Medium keeps grime + 1 cloud octave + 24 lights, High
    keeps everything (48 lights, 2 octaves). The prompt's "~0.6"
    is approximate; a Low the playtest cannot pass is worse than a
    slightly softer Low. High visuals were NOT lowered.
  - Result: **Low 2.8 fps** (fpsdiag samples 4, 4, 2, 2, 2; backing
    640×360) — back to Tier 1 level. Medium 0.6, High 0.6 on this
    VM (Tier 2 shadow + bloom + light loop at full resolution;
    prompt: High may be slow, Medium "playable" is a build-machine
    target — SwiftShader is ~100× slower than a real GPU here).
- **Playtest fixes were test-side, not game-side:**
  - M4 Dex pickup poll 20 → 40 (60 s wall): Dex needs ~10 game-s
    to walk 41 m; at ~2 fps that is ~50 wall-s.
  - M4 bank wait: the fixed 4 s wait after setting
    `stageState.waited = 14.5` ended at 14.9 in-game (fps ~1 in
    the wanted-3 chase), and `enterStage()` replaces `stageState`,
    so setting `waited` before stage 3 starts is wiped. Now the
    test polls for stage 3, sets `waited`, then polls for stage 4.
  - M2 steal: clear wanted after M1 first — the real M1 drive can
    leave Kai at 1 star (a cop spots him), so the steal check now
    measures only the steal's own +1 star.
  - Big-map waypoint: fixed 1 s waits replaced by polls for
    `bigMap.open` / `waypoint` (verified the feature works with
    `tools/probe-bigmap.mjs`: M opens, click sets waypoint (0,0)).
  - Runs 2–3 isolated the failures: walk + decay fixed by the FPS
    recovery; M4/M6/continue/death/arrest were cascades of the
    missing $800 M4 reward; M2 was the flaky wanted-after-M1.
- **Screenshots retaken on High 1280×720** (all ≤256 KiB):
  01-title 65,988 B; 02-night-chase 54,078 B;
  03-mission-cutscene 49,699 B; 04-docks-firefight 40,878 B.
  Critical review: the chase shot was verified correct with
  `tools/probe-chase.mjs` (Kai IS seated, pose 'drive', y 0.55 —
  the "standing on the roof" reading was the front camera + the
  headlights below him). The docks shot was genuinely broken —
  pitch black, Kai a silhouette — because the freight yard sits
  ~70 m from the nearest street lamp (radius 16 m). Fixed with
  four floodlight poles around the yard
  (`city.js` `placeStreetFurniture`, offsets ±26/±20 clear of both
  warehouses and between the container rows) with a wider throw
  (`lamp.r = 30`, `main.js` uses `lamp.r ?? 16`): Kai, the guards
  and the Bison truck now read in the frame.
- **Step 14 re-verified** in this session before the checkpoint:
  `tools/probe-step14.mjs` 15/15 PASS; `main.ts` deterministic
  2× (dossier 382,682 bytes, sha256
  `e3f93f4495a1eaee67c28daac509abc5373f1938b338bf46faf5b41f9637082d`);
  DEVLOG step-14 timestamp corrected (12:05 → 11:18 WITA).
- **Perf probes kept:** `tools/steadyfps.mjs` (8 s rAF count),
  `tools/fpslow.mjs`, `tools/drawstats.mjs` (draw calls +
  triangles), `tools/probe-bigmap.mjs`, `tools/probe-chase.mjs`.
  Scratch probes (batchdump, cpuprofile, lightcount,
  profile-frame, profile-nolights, tinyviewport) deleted.

## Step 16 (Tier 3, this session) — DONE 21 Nov ~13:30 WITA

- **Soundtrack (9 new songs, all hand-written, same data format as
  Tier 2):** Selara Nights FM gains Coastline Run (116 BPM, C),
  Orchid After Dark (100, Dm), Midnight Merpati (112, Em); Ombak
  Lo-Fi gains Warung at 2AM (82, Bb9, swing 0.16), Slow Waves (72,
  Eb7, swing 0.12); Gamelan Wave gains Pier 9 (110, slendro-ish),
  Kecak Circuit (124, pelog-ish). Plus Viktor's theme (84, Dm,
  score only) and the credits reprise "Heat on the Coast
  (Reprise)" (104, Am, loop false). `MUSIC.md` updated: all 10
  radio songs + Viktor theme + credits song ✅ Tier 3.
- **Score wiring:** `score.js` `cutsceneTheme` ('lin' | 'viktor')
  — Viktor's theme plays when he speaks in the M6 boss cutscene,
  Lin's otherwise; `playCredits()` plays the reprise once, then
  the title theme; `menus.show()` opens credits on the reprise
  and returns to the title theme on exit.
- **Heli shoot-down:** orbit lowered to 42 m (Wasp 55 / Kobra 70
  reach it, Thunder 28 does not); `weapons.fireHitscan` returns
  kind `'heli'` (sphere r 3.5); `main.js` wires
  `weapons.onHelicopterHit` → `heli.damage(dmg)` → shot down
  pays **$500 bounty** + `stats.heliDowns++`. Probe: 2 hits of 60
  bring Rajawali down, +$500.
- **Heli recall fix (found by the probe):** the police only
  re-spawned the heli when `!active`, so after the heat cleared
  and returned the heli kept climbing in `leaving` to 130 m
  (~40 s at 2 fps) and Kai fought 4 stars with no heli overhead.
  Now `wanted >= 3 && (!active || leaving)` re-spawns it at once
  (probe: y 42 after re-heat, was 62 before the fix).
- **Roadblocks:** at 3+ stars `police.spawnRoadblock()` seals the
  road 70 m ahead of Kai — two parked Garudas across the road
  (in `roadblock`, not `copCars`, so they never chase or count
  toward the patrol cap) + a foot cop on each side. The block
  holds until the heat is gone, or both cars are wrecked (ramming
  through works — a new block may form after a 15 s cooldown).
  `onRoadblock` warns Kai ("Roadblock ahead — the cops sealed
  the road!").
- **Side content (`game/js/story/side.js`):** 12 Orchid tags on
  the sidewalk outside 12 landmarks + the ferry pier — walk up,
  press E, **+$50 each** (tracked in stats, saved). Kilat Respray:
  drive in, E, pick 1 of 6 colours for **$150 — repaint + full
  repair**. Bang Bang Arms: walk in, E, 5 items (Kobra ammo ×24
  $40, Wasp ammo ×64 $60, Thunder ammo ×12 $50, Thunder 12 $600,
  body armour $200) — items you cannot use are greyed with the
  reason. The shop freezes the game (state `'shop'`, number keys
  buy, Esc/E closes) and draws in the HUD.
- **Shop/tag reachability fix (found by the probe):** measuring
  from the landmark centre put the markers inside the buildings
  (walls 8.4 m out, past an 8 m radius) — shops now measure from
  the sidewalk spot (the door). The two shop tags slide 6 m along
  the wall so they do not sit on the shop door (E collected the
  tag when the player meant to open the shop).
- **Stats (`game/js/story/stats.js`):** moneyEarned,
  missionsCompleted, kills, shotsFired, shotsHit, deaths,
  arrests, heliDowns, tagsFound, carsResprayed, shopSpent,
  timePlayed, distanceDriven; getters `accuracy` and `playTime`
  (`"12m 34s"`). Counters bump at the real event sites (mission
  rewards, `damageCharacter`, `combatAI.onMemberDown`,
  `player.onShoot`, death, arrest, heli bounty, tags, respray,
  shop buys). **Stats screen:** Tab toggles it in the HUD
  (money, missions x/6, kills, accuracy, deaths, arrests, helis,
  tags x/12, resprays, shop spend, distance, time). Stats + tags
  save with the save file (`stats` + `tags` keys) and restore on
  load; `newGame` resets both.
- **Hit markers:** verified wired — a pellet that connects flashes
  the white X over the crosshair for 0.25 s (`hud.showHitMarker()`,
  called from the pellet loop in `player.onShoot`).
- **Probe:** `tools/probe-step16.mjs` **18/18 PASS, 0 console
  errors** (log `~/workspace/probe-step16-run3.log`, ~53 s):
  stats zero + getters, 12 tags rendered, all 10 radio songs,
  cutscene theme follows the speaker (viktor-theme / lin-theme),
  tag +$50, gun shop open/buy/close, respray open/repaint+repair/
  close, roadblock forms at 3 stars and lifts at 0, heli active
  at 42 m and shot down +$500, shot counts + hit marker
  (accuracy 100%), stats screen Tab toggle, save/load round-trip,
  game still running. Run 1 was 9/18 — the failures found the
  heli-recall bug, the shop/tag reachability bug, and two wrong
  probe expectations (playTime format, 'bukit-sunrise' id); the
  hit-marker miss was the probe aiming with the default downward
  pitch instead of levelling the camera (`camPitch = 0`).

## Open bugs / known gaps

- **Playtest: 26/26 PASS, 0 console errors** (Checkpoint 2, 21 Nov
  ~12:45 WITA, log `~/workspace/playtest-checkpoint2-run4.log`).
  Money path verified end to end: $5,550 after M6 → $5,450 after
  death → $5,350 after arrest. See the Step 15 section for the
  FPS-collapse fix and the test-side fixes (M4 polls, M2 wanted
  clear, big-map polling).
- **FPS on this machine (measured 21 Nov ~12:46, `tools/fpsdiag.mjs`,
  title screen, headed Chrome, SwiftShader, no GPU): Low mean 2.8 fps
  (samples 4, 4, 2, 2, 2; backing 640×360), Medium mean 0.6 fps
  (1, 1, 1, 0, 0; 1280×720), High mean 0.6 fps (0, 0, 1, 1, 1;
  1280×720). Low recovered to Tier 1 level after the Checkpoint 2
  shader fixes; Medium/High carry the full Tier 2 look (shadow map
  + bloom + 24/48-light loop at full resolution) and are slow on
  SwiftShader by design — the prompt says High may be slow and
  never to lower High visuals for a weak machine. The prompt's Low
  30+ fps target is NOT achievable on this machine — that is a
  machine limit, stated plainly. On a real GPU the same presets
  will run far faster; High is the screenshot quality and does not
  need real-time FPS.
- **Checkpoint 2 done (step 15). Step 16 done (Tier 3 core).**
  Next: step 17 (adaptive resolution, slow motion, extra props +
  feel tuning), then step 18 (final checkpoint).
- **Tier 3 remaining:** adaptive resolution (MISSING), slow motion
  (MISSING), extra props + feel tuning. Hit markers verified
  wired (probe-step16 18/18). Soundtrack, roadblocks, heli
  shoot-down, tags, respray, gun shop, stats screen all DONE and
  probed.
- **Screenshots:** 4 retaken at Checkpoint 2 on High 1280×720
  (01-title 65,988 B; 02-night-chase 54,078 B;
  03-mission-cutscene 49,699 B; 04-docks-firefight 40,878 B);
  docks fixed with Pier 9 floodlights. Retake again at the final
  checkpoint (step 18) after Tier 3 visuals land.
- **GitHub About** (website on make.fun + topic `makefun`) must be set
  before submit — bos/leader job, not the build agent's.
- **`.makefun/freshness.json`** predates this session; leave it alone.
- **`tools/package-lock.json`** was tracked in earlier commits; it is
  removed from tracking at step 10 (`git rm --cached`, file stays on
  disk untracked). History is never rewritten.

## How to verify (for the next session)

- `node tools/playtest.mjs` (headed Chrome, Xvfb :99, Low preset) —
  expect 26/26 PASS and `PLAYTEST ALL PASS`, exit 0 (~7 min; the
  M4 Dex poll and the wanted-decay section are the long poles).
- `node tools/probe-step14.mjs` (headed Chrome, Xvfb :99) — expect
  15/15 PASS, 0 errors (~80 s; the waits are long because game time
  runs ~5× slower than real time at ~2 fps in SwiftShader).
- `node tools/probe-step16.mjs` (headed Chrome, Xvfb :99) — expect
  18/18 PASS, 0 errors (~55 s; log `~/workspace/probe-step16-run3.log`).
- `MAKEFUN_OUTPUT_DIR=<dir> node main.ts` twice — exit 0, ≤ 10 s,
  byte-identical output.
- `node tools/fpsdiag.mjs` — FPS per preset, headed Chrome.
- `node tools/screenshots.mjs` — retakes the 4 shots on High.
- `git ls-files` must contain no lockfiles, generated files or secrets
  before the final checkpoint.
