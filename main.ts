// Lumenfall Arena — entry program for make.fun's best-game-01 bounty (Node 22, standard library only).
//
// The game itself is the game/ folder next to this file: plain static files (an HTML page, one
// stylesheet and ES modules under game/src/) that a desktop browser plays fully offline — no build
// step, no library, no network request. This program hands the entry in: it copies game/ and
// screenshots/ to the output directory and writes dossier.json there with the vendored make.fun
// library, exactly as the competition's handover contract requires.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the game and its screenshots beside the dossier the judge reads.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (from the competition's gate): text_max_bytes only shapes how much source
// text the dossier carries; the rest restate limits an entry the scorer would refuse must not cross
// (at most 4 screenshots of at most 256 KiB each, at most 993 files and 48 MiB under game/, and no
// path under game/ longer than 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
