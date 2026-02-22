/**
 * Black Hole Frame Generator for OblivionEngine
 *
 * Procedurally generates ASCII art frames of a massive black hole.
 * Uses gamma-corrected brightness mapping for rich mid-tones and
 * multi-layer compositing for physically-inspired visuals.
 *
 * Visual layers:
 *   1. Event horizon (void)
 *   2. Photon ring (intense inner glow)
 *   3. Accretion disk (spiral arms, Doppler beaming, turbulence)
 *   4. Gravitational lensing (back-disk arc above hole)
 *   5. Extended halo (diffuse glow)
 *   6. Particle wisps (sparse filaments)
 *
 * Outputs: idle.frames.json, success.frames.json, error.frames.json
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'animations', 'default');

// ================================================================
// Configuration
// ================================================================

const WIDTH = 120;
const HEIGHT = 36;
const CHAR_RATIO = 2.1;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

// Geometry (world units — larger = fills more of the frame)
const R_EVENT = 3.2;
const R_PHOTON = 4.8;
const R_DISK_INNER = 4.2;
const R_DISK_OUTER = 18.0;
const DISK_THICK = 0.65;

// Spiral
const N_ARMS = 3;
const SPIRAL_K = 0.35;

// Brightness
const GAMMA = 0.55;         // < 1 brightens midtones (critical for visibility)
const DISK_BOOST = 1.9;     // Multiplier for disk brightness
const HALO_STRENGTH = 0.10; // Outer glow intensity
const BRIGHTNESS_FLOOR = 0.02; // Below this → space (kills faint background noise)

// Character ramp (17 levels, void → max)
const CHARS = " .'`^-:;~=+*#%@$&";

// ================================================================
// Noise
// ================================================================

function hash(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 73.13) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, s, octaves = 3) {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq, s + i * 31.7);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// ================================================================
// Brightness Computation
// ================================================================

function computeBrightness(wx, wy, r, theta, phase, breathe, seed) {
  if (r < R_EVENT) return 0;

  let b = 0;

  // ── Photon ring ──
  // Gaussian peak centered just outside event horizon
  {
    const peak = R_EVENT + 0.8;
    const sigma = 0.9;
    const d = r - peak;
    const ring = Math.exp(-(d * d) / (2 * sigma * sigma)) * 1.0;
    b = Math.max(b, ring);
  }

  // ── Accretion disk ──
  {
    const rMin = R_DISK_INNER * 0.5;
    const rMax = R_DISK_OUTER * 1.15;
    if (r >= rMin && r <= rMax) {
      const halfH = Math.max(1.2, r * DISK_THICK);
      const dv = Math.abs(wy) / halfH;

      if (dv < 1.0) {
        const rn = (r - rMin) / (rMax - rMin);

        // Radial: very gradual falloff (keeps outer disk visible)
        const radial = Math.pow(Math.max(0, 1 - rn), 0.5) * 0.6
                     + Math.exp(-rn * 1.8) * 0.4;

        // Vertical: smooth bell at midplane
        const vert = Math.pow(1 - dv * dv, 1.0);

        // Spiral arms
        const sa = theta + r * SPIRAL_K + phase;
        const spiral = 0.3 + 0.7 * Math.pow((Math.sin(sa * N_ARMS) + 1) / 2, 0.5);

        // Doppler beaming (mild asymmetry)
        const doppler = 0.7 + 0.3 * Math.cos(theta - Math.PI * 0.75);

        // Turbulence
        const turb = 0.8 + 0.2 * fbm(theta * 2, r * 0.4, seed);

        const disk = radial * vert * spiral * doppler * turb * DISK_BOOST;
        b = Math.max(b, Math.min(1, disk));
      }
    }
  }

  // ── Gravitational lensing: back-disk arc (above the hole) ──
  if (wy < 0) {
    const ay = -wy;
    if (r >= R_EVENT * 0.6 && r < R_PHOTON + 7) {
      // Arc curve: sits above the event horizon, hugs the photon sphere
      const arcY = R_EVENT * 0.5 + Math.max(0, r - R_EVENT) * 0.22;
      const arcD = Math.abs(ay - arcY);
      const arcW = 2.8;

      if (arcD < arcW) {
        const an = arcD / arcW;
        const arcB = Math.exp(-an * an * 1.5) * 0.75;
        const arcR = Math.exp(-Math.max(0, r - R_PHOTON) * 0.2);
        const arcSpiral = 0.35 + 0.65 * Math.pow(
          (Math.sin(theta * N_ARMS - r * SPIRAL_K * 0.5 + phase * 1.4) + 1) / 2, 0.6
        );
        const lens = arcB * arcR * arcSpiral;
        b = Math.max(b, lens);
      }
    }
  }

  // ── Lensing glow below hole (front enhancement) ──
  if (wy > 0 && r >= R_EVENT * 0.7 && r < R_PHOTON + 4) {
    const farcY = R_EVENT * 0.35 + (r - R_EVENT) * 0.18;
    const fd = Math.abs(wy - farcY);
    if (fd < 2.2) {
      const fg = Math.exp(-fd * 1.0) * 0.35 * Math.exp(-Math.max(0, r - R_PHOTON) * 0.35);
      b = Math.max(b, fg);
    }
  }

  // ── Extended halo (confined near the disk, not frame-filling) ──
  {
    const hd = r - R_EVENT;
    if (hd > 0 && hd < R_DISK_OUTER * 1.2) {
      const hn = hd / (R_DISK_OUTER * 0.8);
      const halo = HALO_STRENGTH * Math.exp(-hn * hn * 1.2);
      const ha = 0.65 + 0.35 * Math.cos(theta * 2 + phase * 0.2);
      const hv = halo * ha;
      b = Math.max(b, hv);
    }
  }

  // ── Particle wisps (sparse filaments at outer edge) ──
  {
    if (r > R_DISK_OUTER * 0.7 && r < R_DISK_OUTER * 1.5) {
      const wn = fbm(theta * 4, r * 0.3, seed + 100, 2);
      if (wn > 0.6) {
        const wisp = (wn - 0.6) * 0.4;
        const wr = 1 - Math.abs(r - R_DISK_OUTER) / (R_DISK_OUTER * 0.5);
        b = Math.max(b, wisp * Math.max(0, wr));
      }
    }
  }

  // Breathing offset
  b += breathe * 0.07;
  b = Math.max(0, Math.min(1, b));

  // Floor: anything below threshold is true darkness (space)
  if (b < BRIGHTNESS_FLOOR) return 0;

  // Gamma correction: brightens midtones, keeps blacks black
  b = Math.pow(b, GAMMA);

  return b;
}

// ================================================================
// Frame Generation
// ================================================================

function generateFrame(phase, breathe, seed) {
  const lines = [];
  for (let row = 0; row < HEIGHT; row++) {
    let line = '';
    for (let col = 0; col < WIDTH; col++) {
      const wx = (col - CX) / CHAR_RATIO;
      const wy = row - CY;
      const r = Math.sqrt(wx * wx + wy * wy);
      const theta = Math.atan2(wy, wx);
      const b = computeBrightness(wx, wy, r, theta, phase, breathe, seed);
      const idx = Math.min(CHARS.length - 1, Math.floor(b * CHARS.length));
      line += CHARS[idx];
    }
    lines.push(line.padEnd(WIDTH));
  }
  return lines;
}

// ================================================================
// Idle: slow spiral rotation + breathing glow
// ================================================================

function genIdle() {
  const N = 8;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const phase = t * Math.PI * 2 / N_ARMS;
    const breathe = Math.sin(t * Math.PI * 2) * 0.5;
    frames.push(generateFrame(phase, breathe, i * 7.7));
  }
  return {
    meta: { name: "Oblivion Singularity", author: "OblivionEngine", frameDelayMs: 400 },
    frames
  };
}

// ================================================================
// Success: bright pulse expanding outward
// ================================================================

function genSuccess() {
  const N = 8;
  const frames = [];
  const curve = [0, 0.5, 1.2, 1.8, 1.8, 1.2, 0.6, 0.2];
  for (let i = 0; i < N; i++) {
    frames.push(generateFrame(0, curve[i], i * 3.3));
  }
  return {
    meta: { name: "Oblivion Success Pulse", author: "OblivionEngine", frameDelayMs: 120 },
    frames
  };
}

// ================================================================
// Error: flickering distortion
// ================================================================

function genError() {
  const N = 8;
  const frames = [];
  const curve = [-0.3, 0.9, -0.4, 1.1, -0.3, 0.7, -0.2, 0.3];
  for (let i = 0; i < N; i++) {
    frames.push(generateFrame(Math.PI * 0.35 * i, curve[i], i * 5.5));
  }
  return {
    meta: { name: "Oblivion Error Distort", author: "OblivionEngine", frameDelayMs: 100 },
    frames
  };
}

// ================================================================
// Output
// ================================================================

console.log('Generating black hole frames...');

const idle = genIdle();
const success = genSuccess();
const error = genError();

writeFileSync(join(ASSETS_DIR, 'idle.frames.json'), JSON.stringify(idle, null, 2));
writeFileSync(join(ASSETS_DIR, 'success.frames.json'), JSON.stringify(success, null, 2));
writeFileSync(join(ASSETS_DIR, 'error.frames.json'), JSON.stringify(error, null, 2));

console.log(`idle: ${idle.frames.length}f @ ${idle.meta.frameDelayMs}ms`);
console.log(`success: ${success.frames.length}f @ ${success.meta.frameDelayMs}ms`);
console.log(`error: ${error.frames.length}f @ ${error.meta.frameDelayMs}ms`);

console.log('\n── idle frame 0 ──');
idle.frames[0].forEach(l => console.log(l));
console.log('\n── idle frame 4 ──');
idle.frames[4].forEach(l => console.log(l));
