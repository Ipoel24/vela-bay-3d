// main.ts — build program for the VELA BAY 3D entry (Node 22, stdlib only,
// erasable TypeScript: run it with `node main.ts`, no flags, no build, no
// install). Reads the output directory from OUTPUT_DIR (default "output"),
// copies game/ + screenshots/ into it, builds the dossier with the kit's
// caps, and writes dossier.json. Running it twice with different output
// directories produces byte-identical output. Written fresh for this entry
// by Builder E — every line below is my own work for this rebuild.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

// The kit caps for gta6-01 (study notes §2): dossier text 160 KiB, at most
// 4 screenshots of 256 KiB each, game/ at most 993 entries and 48 MiB.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// validateShots() — every screenshot shots.json names must exist on disk
// before the build starts. A build that silently copied a stale or missing
// screenshot used to produce a dossier whose cover was last round's image;
// failing here, with the missing names listed, makes that impossible.
function validateShots() {
  const mapPath = 'shots.json';
  if (!existsSync(mapPath)) throw new Error(`build refused: ${mapPath} is missing`);
  const map = JSON.parse(readFileSync(mapPath, 'utf8')) as Record<string, { scene: string; seed: number }>;
  const names = Object.keys(map);
  if (names.length === 0) throw new Error('build refused: shots.json names no screenshots');
  if (names.length > CAPS.screenshots.max) {
    throw new Error(`build refused: ${names.length} screenshots named, cap is ${CAPS.screenshots.max}`);
  }
  const missing = names.filter((n) => !existsSync(join('screenshots', n)));
  if (missing.length > 0) {
    throw new Error(`build refused: missing screenshot(s) in screenshots/: ${missing.join(', ')} — retake them via photo mode first`);
  }
  const oversize = names.filter((n) => {
    try {
      return readFileSync(join('screenshots', n)).length > CAPS.screenshots.max_bytes;
    } catch {
      return false;
    }
  });
  if (oversize.length > 0) {
    throw new Error(`build refused: screenshot(s) over the ${CAPS.screenshots.max_bytes} byte cap: ${oversize.join(', ')}`);
  }
  console.log(`screenshots ok: ${names.length} file(s) present (${names.join(', ')})`);
}

const outDir: string = process.env.OUTPUT_DIR || process.env.OUT_DIR || 'output';

validateShots();

// Never delete the output directory itself: create it, then delete only
// each entry inside it, so a stale dossier or screenshot cannot survive.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

cpSync('game', join(outDir, 'game'), { recursive: true });
cpSync('screenshots', join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
