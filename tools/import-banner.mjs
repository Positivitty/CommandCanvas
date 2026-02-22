/**
 * Banner Import + Animation Generator
 *
 * Takes a plain-text ASCII art banner, cleans it up, adds an
 * "OBLIVION ENGINE" title, and generates animation frame files.
 *
 * Animation:
 *   - Idle: Edge shimmer on the black hole + CSS breathing glow
 *   - Success/Error: Static master frame (CSS handles color/glow)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'animations', 'default');
const BANNER_PATH = join('/Users/noahkerr/Downloads/banner.txt');

const TARGET_HEIGHT = 36;
const TARGET_WIDTH = 120;

// ================================================================
// 1. Load banner and extract the black hole art
// ================================================================

const raw = readFileSync(BANNER_PATH, 'utf8').split('\n');
console.log(`Loaded banner: ${raw.length} lines`);

// Convert dot background to spaces, preserving dots adjacent to art
const cleaned = raw.map(line => {
  let result = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '.') {
      const neighborhood = line.slice(Math.max(0, i - 1), i + 2);
      const hasArt = /[^.\s]/.test(neighborhood);
      result += hasArt ? '.' : ' ';
    } else {
      result += line[i];
    }
  }
  return result;
});

// Find the largest continuous block of content (the black hole).
// This skips the faint garbage text at the bottom by choosing
// the biggest cluster, not just first-to-last.
const contentLines = [];
for (let i = 0; i < cleaned.length; i++) {
  const nonSpace = cleaned[i].replace(/\s/g, '').length;
  contentLines.push({ idx: i, weight: nonSpace });
}

// Find continuous blocks (allow up to 2 consecutive blank lines within a block)
const blocks = [];
let currentBlock = null;
let blankRun = 0;
for (const { idx, weight } of contentLines) {
  if (weight > 5) {
    if (!currentBlock || blankRun > 2) {
      currentBlock = { start: idx, end: idx, totalWeight: 0 };
      blocks.push(currentBlock);
    }
    currentBlock.end = idx;
    currentBlock.totalWeight += weight;
    blankRun = 0;
  } else {
    blankRun++;
  }
}

// Pick the block with the most total content (the black hole)
blocks.sort((a, b) => b.totalWeight - a.totalWeight);
const bestBlock = blocks[0];
const firstArt = bestBlock.start;
const lastArt = bestBlock.end;

const artLines = cleaned.slice(firstArt, lastArt + 1);
console.log(`Black hole art: lines ${firstArt + 1}-${lastArt + 1} (${artLines.length} lines)`);

// ================================================================
// 2. Create "OBLIVION ENGINE" title
// ================================================================

const title = [
  '╔══════════════════════════════════════╗',
  '║    O B L I V I O N   E N G I N E     ║',
  '╚══════════════════════════════════════╝',
];

// Center each title line in TARGET_WIDTH
const centeredTitle = title.map(line => {
  const pad = Math.floor((TARGET_WIDTH - line.length) / 2);
  return (' '.repeat(pad) + line).padEnd(TARGET_WIDTH);
});

// ================================================================
// 3. Compose the final frame
// ================================================================

const artHeight = artLines.length;       // ~22 lines
const titleHeight = centeredTitle.length; // 3 lines
const gapHeight = 2;                     // gap between art and title
const contentHeight = artHeight + gapHeight + titleHeight;
const topPad = Math.max(0, Math.floor((TARGET_HEIGHT - contentHeight) / 2));

const frame = [];

// Top padding
for (let i = 0; i < topPad; i++) frame.push(''.padEnd(TARGET_WIDTH));

// Black hole art
for (const line of artLines) {
  frame.push(line.padEnd(TARGET_WIDTH).slice(0, TARGET_WIDTH));
}

// Gap
for (let i = 0; i < gapHeight; i++) frame.push(''.padEnd(TARGET_WIDTH));

// Title
for (const line of centeredTitle) frame.push(line);

// Bottom padding
while (frame.length < TARGET_HEIGHT) frame.push(''.padEnd(TARGET_WIDTH));

// Trim if over (shouldn't happen with correct math)
while (frame.length > TARGET_HEIGHT) frame.pop();

console.log(`Final frame: ${frame.length} lines x ${TARGET_WIDTH} chars`);

// ================================================================
// 4. Generate shimmer animation
// ================================================================

// Characters used in the art, roughly ordered by visual density
const DENSITY = " .'`,;:clodxkOKXNWM0";

function getDensityIndex(ch) {
  const idx = DENSITY.indexOf(ch);
  return idx >= 0 ? idx : -1;
}

// Simple seeded PRNG
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s >> 16) / 32768;
  };
}

/**
 * Create a shimmer variant — subtle char swaps at art edges.
 * Only affects the black hole region, never the title text.
 */
function createShimmerFrame(master, seed) {
  const rand = makeRng(seed);
  const artEnd = topPad + artLines.length; // Don't shimmer below the art

  return master.map((line, row) => {
    // Only shimmer the art region
    if (row < topPad || row >= artEnd) return line;

    let chars = [...line];
    for (let col = 0; col < chars.length; col++) {
      const ch = chars[col];
      if (ch === ' ') continue;

      const di = getDensityIndex(ch);
      if (di < 0) continue;

      // Only shimmer edge characters (adjacent to space)
      const left = col > 0 ? chars[col - 1] : ' ';
      const right = col < chars.length - 1 ? chars[col + 1] : ' ';
      const above = row > 0 ? master[row - 1][col] || ' ' : ' ';
      const below = row < master.length - 1 ? master[row + 1][col] || ' ' : ' ';
      const isEdge = left === ' ' || right === ' ' || above === ' ' || below === ' ';

      if (!isEdge) continue;

      // 10% chance to shimmer
      if (rand() > 0.10) continue;

      // Shift density ±1
      const shift = rand() > 0.5 ? 1 : -1;
      const newIdx = Math.max(1, Math.min(DENSITY.length - 1, di + shift));
      chars[col] = DENSITY[newIdx];
    }
    return chars.join('');
  });
}

// ================================================================
// 5. Build and write frame files
// ================================================================

// Idle: 8 frames with shimmer for a slow, living edge effect
const idleFrames = [];
for (let i = 0; i < 8; i++) {
  idleFrames.push(createShimmerFrame(frame, (i + 1) * 7919));
}

const idle = {
  meta: { name: "Oblivion Singularity", author: "OblivionEngine", frameDelayMs: 350 },
  frames: idleFrames
};

// Success: static master (CSS handles the green pulse)
const success = {
  meta: { name: "Oblivion Success", author: "OblivionEngine", frameDelayMs: 150 },
  frames: [frame, frame, frame, frame]
};

// Error: static master (CSS handles the red flicker)
const error = {
  meta: { name: "Oblivion Error", author: "OblivionEngine", frameDelayMs: 120 },
  frames: [frame, frame, frame, frame]
};

writeFileSync(join(ASSETS_DIR, 'idle.frames.json'), JSON.stringify(idle, null, 2));
writeFileSync(join(ASSETS_DIR, 'success.frames.json'), JSON.stringify(success, null, 2));
writeFileSync(join(ASSETS_DIR, 'error.frames.json'), JSON.stringify(error, null, 2));

console.log(`\nidle: ${idle.frames.length} frames @ ${idle.meta.frameDelayMs}ms`);
console.log(`success: ${success.frames.length} frames @ ${success.meta.frameDelayMs}ms`);
console.log(`error: ${error.frames.length} frames @ ${error.meta.frameDelayMs}ms`);

console.log('\n── master frame ──');
frame.forEach(l => console.log(l));
console.log('── end ──');
