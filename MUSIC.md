# SELARA BAY — Soundtrack

Every song is synthesised live with Web Audio. Songs are data: tempo, key,
scale, chord progression, sections with per-track patterns (drums, bass, pad,
lead, arp, fx), and an arrangement. Nothing is a recording or a sample.

## How it works

- `game/js/audio/music/synth.js` — the instruments: subtractive bass/lead,
  FM electric piano and bells, Karplus-Strong plucked strings, supersaw
  pads, and a drum kit from noise + sine. No audio files.
- `game/js/audio/music/sequencer.js` — a lookahead scheduler (25 ms timer,
  0.15 s ahead) with swing, so the music stays in time at any frame rate.
- `game/js/audio/music/fx.js` — the mix chain: compressor, a tempo-synced
  dotted-eighth delay, a generated-impulse reverb, and the radio bus with
  its car-radio lowpass (muffled on foot, full in the car).
- `game/js/audio/music/radio.js` — three live stations (R switches station
  while driving; the station + song pop up on the HUD).
- `game/js/audio/music/score.js` — the adaptive layer: chase music at 3+
  stars, Lin's theme in cutscenes, stingers for mission passed/failed,
  FLATLINED and CUFFED.
- `game/js/audio/music/index.js` — the facade: title theme on the title
  screen and on foot, radio in a car (muffled for 3 s after stepping out,
  then back to the theme).

## Title theme

| Song | Tempo | Key | Mood |
| --- | --- | --- | --- |
| Heat on the Coast | 104 BPM | A minor | Warm synthwave hook, loops seamlessly |

## Selara Nights FM — synthwave

| Song | Tempo | Key | Mood | Status |
| --- | --- | --- | --- | --- |
| Neon Tide | 108 BPM | A minor | Driving night cruise | ✅ Tier 2 |
| Coastline Run | 116 BPM | C major | Fast coastal highway | Tier 3 |
| Orchid After Dark | 100 BPM | D minor | Dark and purple | Tier 3 |
| Midnight Merpati | 112 BPM | E minor | Smooth midnight drive | Tier 3 |

## Ombak Lo-Fi — jazzy, swung

| Song | Tempo | Key | Mood | Status |
| --- | --- | --- | --- | --- |
| Rain on Kemuning | 76 BPM | F major 7 | Rainy evening, vinyl crackle | ✅ Tier 2 |
| Warung at 2AM | 82 BPM | Bb major 9 | Sleepy late-night food stall | Tier 3 |
| Slow Waves | 72 BPM | Eb major 7 | Slow beach morning | Tier 3 |

## Gamelan Wave — pelog/slendro-inspired FM bells and gongs over electronic beats

| Song | Tempo | Key | Mood | Status |
| --- | --- | --- | --- | --- |
| Bukit Asri Sunrise | 118 BPM | Pelog-ish | Bright interlocking bells | ✅ Tier 2 |
| Pier 9 | 110 BPM | Slendro-ish | Dockside groove | Tier 3 |
| Kecak Circuit | 124 BPM | Pelog-ish | Rhythmic vocal-like chops | Tier 3 |

## Score

- **Chase music:** layers fade in with the wanted level when the radio is
  off or during missions. ✅ Tier 2 — "Pursuit" (132 BPM, D minor) plays
  at 3+ stars and silences the radio until the heat dies down.
- **Cutscene themes:** a warm theme for Mama Lin ✅ Tier 2 — "Lin's Theme"
  (80 BPM, C major) plays in cutscenes; a dark theme for Viktor (Tier 3).
- **Stingers:** mission passed, mission failed, FLATLINED, CUFFED ✅ Tier 2.
- **Credits song:** a full reprise of "Heat on the Coast" (Tier 3).
