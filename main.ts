// SELARA BAY — entrypoint for the make.fun gta6-01 bounty.
//
// Runs on Node 22 with the standard library only. It takes the game in this
// repository (game/ plus screenshots/) and hands it to the grader: everything
// is copied to the output directory and dossier.json is written there with
// the vendored make.fun library, which summarises the game for the judge.
//
// The grader runs it with no network, a read-only repository, a writable
// output directory, one CPU, one gigabyte of memory and ten seconds. There is
// no clock read and no unseeded randomness anywhere here, so two runs of the
// same repository produce byte-identical output. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Checkpoint 1 revision: before the dossier is built, this program now
// checks the copied output against the scorer's caps itself (game/ entries
// and bytes, no symlinks, index.html size, screenshot count, size and
// names) and fails fast with a plain message instead of handing the
// grader a bad tree. It also builds the dossier twice in memory and
// refuses to write it unless both builds are byte-identical, then reads
// the written file back and verifies it matches — so a run can never
// silently ship a non-deterministic dossier.
//
// Final checkpoint revision (step 18): the screenshot check also reads
// each image's pixel size (JPEG SOF0/SOF2, PNG IHDR) and enforces the
// gate's long side ≤ 1280 and short side ≥ 480 — a wrong-size
// screenshot used to pass this program and fail only at the scorer.

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this competition, from reference/gate.json via
// the kit (RULES.txt, "The gate"): game/ holds at most 993 files and
// directories totalling at most 48 MiB, with no path longer than 1000
// bytes; game/index.html is a regular file of at most 1 MiB; screenshots/
// holds 3 to 4 images of at most 256 KiB each, long side at most 1280 and
// short side at least 480 pixels (the pixel size is read from the image
// bytes by imageDimensions below, so a wrong-size screenshot fails here);
// the dossier text is capped at 160 KiB and the dossier itself at 1.5 MiB.
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;
const GAME_PATH_MAX_BYTES = 1000;
const INDEX_MAX_BYTES = 1048576;
const SHOT_MAX_BYTES = 262144;
const SHOT_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const SHOT_MAX_LONG = 1280;
const SHOT_MIN_SHORT = 480;

// Mirror one directory tree into the output, creating the target first.
function mirrorTree(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

// Walk a copied game/ tree and check it against the scorer's caps:
// plain files and directories only (no symlinks), at most 993 entries
// totalling at most 48 MiB, no path over 1000 UTF-8 bytes, and
// game/index.html a regular file of at most 1 MiB. The walk is sorted,
// so the check itself is deterministic.
function checkGameTree(gameDir: string): void {
  let entries = 0;
  let bytes = 0;
  const walk = (dir: string, rel: string): void => {
    const names = readdirSync(dir).sort();
    for (const name of names) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (Buffer.byteLength(relPath, 'utf8') > GAME_PATH_MAX_BYTES) {
        throw new Error(`game path over ${GAME_PATH_MAX_BYTES} bytes: ${relPath}`);
      }
      const st = lstatSync(full);
      entries += 1;
      if (st.isSymbolicLink()) {
        throw new Error(`game/ must hold plain files only, found symlink: ${relPath}`);
      }
      if (st.isDirectory()) {
        walk(full, relPath);
      } else if (st.isFile()) {
        bytes += st.size;
      } else {
        throw new Error(`game/ holds a non-file entry: ${relPath}`);
      }
    }
  };
  walk(gameDir, '');
  if (entries > GAME_MAX_FILES) {
    throw new Error(`game/ holds ${entries} entries, cap is ${GAME_MAX_FILES}`);
  }
  if (bytes > GAME_MAX_BYTES) {
    throw new Error(`game/ totals ${bytes} bytes, cap is ${GAME_MAX_BYTES}`);
  }
  const indexPath = join(gameDir, 'index.html');
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error('game/index.html is missing');
  }
  const indexBytes = statSync(indexPath).size;
  if (indexBytes > INDEX_MAX_BYTES) {
    throw new Error(`game/index.html is ${indexBytes} bytes, cap is ${INDEX_MAX_BYTES}`);
  }
}

// Read an image's pixel size: JPEG via its SOF0/SOF2 marker (baseline
// or progressive), PNG via IHDR. Throws on anything else — the gate
// only ever sees JPEGs from this repo, but a wrong format should fail
// here with a plain message, not at the scorer.
function imageDimensions(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  // PNG: 8-byte signature, then IHDR with width/height at bytes 16/20.
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: SOI marker, then scan segments for SOF0 (0xC0) or SOF2 (0xC2).
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error(`not a JPEG or PNG: ${path}`);
  }
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) break; // SOS: scan data follows, no SOF after it
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error(`no SOF marker in JPEG: ${path}`);
}

// Check the copied screenshots/: 3 to 4 files, each at most 256 KiB,
// with a plain name (letters, digits, '.', '_' or '-', 1 to 128
// characters, not starting with '.' or '-'), long side at most 1280 px
// and short side at least 480 px.
function checkScreenshots(shotDir: string): void {
  if (!existsSync(shotDir)) throw new Error('screenshots/ is missing');
  const names = readdirSync(shotDir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > 4) {
    throw new Error(`expected 3 or 4 screenshots, found ${names.length}`);
  }
  for (const name of names) {
    if (!SHOT_NAME.test(name) || name.startsWith('-')) {
      throw new Error(`bad screenshot name: ${name}`);
    }
    const st = statSync(join(shotDir, name));
    if (!st.isFile()) throw new Error(`screenshot is not a file: ${name}`);
    if (st.size > SHOT_MAX_BYTES) {
      throw new Error(`screenshot ${name} is ${st.size} bytes, cap is ${SHOT_MAX_BYTES}`);
    }
    const { width, height } = imageDimensions(join(shotDir, name));
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    if (long > SHOT_MAX_LONG) {
      throw new Error(`screenshot ${name} is ${width}x${height}, long side over ${SHOT_MAX_LONG}`);
    }
    if (short < SHOT_MIN_SHORT) {
      throw new Error(`screenshot ${name} is ${width}x${height}, short side under ${SHOT_MIN_SHORT}`);
    }
  }
}

mirrorTree(join(repoRoot, 'game'), join(outputDir, 'game'));

const shotDir = join(repoRoot, 'screenshots');
const shotTarget = join(outputDir, 'screenshots');
mkdirSync(shotTarget, { recursive: true });
if (existsSync(shotDir)) mirrorTree(shotDir, shotTarget);

// Fail fast on a tree the scorer would refuse, before the dossier is
// built from it.
checkGameTree(join(outputDir, 'game'));
checkScreenshots(shotTarget);

// buildDossier is the kit's vendored library, unchanged: the gate
// rebuilds the dossier with the same library and compares byte for
// byte. Build it twice and refuse to write unless both builds agree,
// then read the written file back and verify it matches what was built.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
// buildDossier returns bytes (a Uint8Array), so compare byte for byte,
// never by reference.
const dossierFirst = Buffer.from(buildDossier(outputDir, dossierOptions));
const dossierSecond = Buffer.from(buildDossier(outputDir, dossierOptions));
if (!dossierFirst.equals(dossierSecond)) {
  throw new Error('dossier is not deterministic: two builds differ');
}
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(dossierPath, dossierFirst);
if (!readFileSync(dossierPath).equals(dossierFirst)) {
  throw new Error('dossier.json read-back does not match the build');
}
