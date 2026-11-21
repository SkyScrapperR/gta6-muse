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
// short side at least 480 pixels (the pixel size is a property of the
// image bytes, checked by the scorer, not by this program); the dossier
// text is capped at 160 KiB and the dossier itself at 1.5 MiB.
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;
const GAME_PATH_MAX_BYTES = 1000;
const INDEX_MAX_BYTES = 1048576;
const SHOT_MAX_BYTES = 262144;
const SHOT_NAME = /^[A-Za-z0-9._-]{1,128}$/;

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

// Check the copied screenshots/: 3 to 4 files, each at most 256 KiB,
// with a plain name (letters, digits, '.', '_' or '-', 1 to 128
// characters, not starting with '.' or '-').
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
