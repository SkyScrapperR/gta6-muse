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

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Mirror one directory tree into the output, creating the target first.
function mirrorTree(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

// Count the regular files directly inside a directory (used for a sanity
// report before the dossier is built; the dossier itself enforces the caps).
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    if (statSync(join(dir, name)).isFile()) total += 1;
  }
  return total;
}

mirrorTree(join(repoRoot, 'game'), join(outputDir, 'game'));

const shotDir = join(repoRoot, 'screenshots');
const shotTarget = join(outputDir, 'screenshots');
mkdirSync(shotTarget, { recursive: true });
if (existsSync(shotDir)) mirrorTree(shotDir, shotTarget);

const shotCount = countFiles(shotTarget);
if (shotCount < 3 || shotCount > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotCount}`);
}

// The scorer's caps for this competition: the dossier text is capped at
// 160 KiB; at most 4 screenshots of at most 256 KiB each; game/ holds at most
// 993 files and directories totalling at most 48 MiB, with no path longer
// than 1000 bytes. buildDossier refuses an entry the scorer would refuse.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
