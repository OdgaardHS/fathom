import { TAU } from '../../core/math.js';
import { spiralPath, star } from '../sprites.js';

/**
 * Sunlit Shallows: a pale sandy seabed under clear, shallow water.
 * Floor details are placed by a deterministic hash per grid cell, so the world is
 * endless but always looks the same in the same spot.
 */

const BACKGROUND = '#c7b98f'; // sand
const WATER_TINT = 'rgba(30, 140, 150, 0.15)'; // the water over the sand
const CELL = 128; // small ground details
const PATCH = 384; // big sand patches (ripples run the same way within one)
const SCHOOL_CELL = 900; // ambient fish schools

// Decorations are muted so they never compete with enemies for attention.
const CORAL = ['#c96f86', '#c98a5c', '#9a74b8', '#b8a46a'];
const BLEACHED = '#e2ddd0';
const SHADOW = 'rgba(70, 58, 32, 0.24)';

function hash(x, y, salt) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt + 1, 0x5bd1e995);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const mod = (v, m) => ((v % m) + m) % m;

export function createShallowsTheme() {
  const caustics = makeCausticTile(256, 22, 7);
  let pattern = null;
  let clock = 0;
  let vignette = null;
  let vignetteKey = '';
  const motes = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.3 + Math.random() * 0.7, // depth: nearer motes are brighter and move more
    size: 0.8 + Math.random() * 1.8,
  }));

  return {
    background: BACKGROUND,

    reset() {},

    /** Visual clock: keeps the water moving even on menus. */
    update(dt) {
      clock += dt;
    },

    /** The Shallows' teases are all part of the floor (carved spirals, circling fish). */
    omen() {},

    /** World space, under all entities. */
    drawFloor(ctx, camera) {
      const left = camera.x - camera.viewW / 2;
      const top = camera.y - camera.viewH / 2;
      const right = left + camera.viewW;
      const bottom = top + camera.viewH;

      drawSandPatches(ctx, left, top, right, bottom);
      drawDetails(ctx, left, top, right, bottom, clock);

      // Tint everything on the floor slightly turquoise: we're looking through water.
      ctx.fillStyle = WATER_TINT;
      ctx.fillRect(left, top, camera.viewW, camera.viewH);

      // Rippling sunlight on the sand: two layers of the same pattern drifting apart.
      if (!pattern) pattern = ctx.createPattern(caustics, 'repeat');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.16;
      pattern.setTransform(new DOMMatrix().translateSelf(clock * 12, clock * 5).scaleSelf(1.25, 1.25));
      ctx.fillRect(left, top, camera.viewW, camera.viewH);
      ctx.globalAlpha = 0.1;
      pattern.setTransform(new DOMMatrix().translateSelf(-clock * 9, clock * 10 + 40).rotateSelf(30).scaleSelf(1.7, 1.7));
      ctx.fillRect(left, top, camera.viewW, camera.viewH);
      ctx.restore();

      drawSchools(ctx, left, top, right, bottom, clock);
    },

    /** Screen space, over the world and under the HUD. */
    drawOverlay(ctx, w, h, camera) {
      // Sun rays slanting down through the water
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const span = w + 400;
      for (let i = 0; i < 4; i++) {
        const base = (i * span) / 4 + Math.sin(clock * 0.12 + i * 1.7) * 50 - camera.x * camera.zoom * 0.08;
        const x = mod(base, span) - 200;
        const bw = 70 + (i % 2) * 60;
        ctx.save();
        ctx.translate(x, -20);
        ctx.rotate(0.38);
        const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        g.addColorStop(0, 'rgba(255, 255, 230, 0)');
        g.addColorStop(0.5, 'rgba(255, 255, 230, 0.06)');
        g.addColorStop(1, 'rgba(255, 255, 230, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-bw / 2, 0, bw, h * 1.4);
        ctx.restore();
      }
      ctx.restore();

      // Drifting specks in the water, with a little parallax
      ctx.fillStyle = 'rgb(225, 255, 250)';
      for (const m of motes) {
        const sx = mod(m.x * w - camera.x * camera.zoom * m.z * 0.5, w);
        const sy = mod(m.y * h - camera.y * camera.zoom * m.z * 0.5 - clock * 10 * m.z, h);
        ctx.globalAlpha = 0.12 + 0.3 * m.z;
        ctx.fillRect(sx, sy, m.size, m.size);
      }
      ctx.globalAlpha = 1;

      if (vignetteKey !== `${w}x${h}`) {
        vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        vignette.addColorStop(0, 'rgba(10, 60, 70, 0)');
        vignette.addColorStop(1, 'rgba(10, 50, 60, 0.45)');
        vignetteKey = `${w}x${h}`;
      }
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

// ------------------------------------------------------------------ floor

function drawSandPatches(ctx, left, top, right, bottom) {
  for (let cy = Math.floor(top / PATCH) - 1; cy <= Math.floor(bottom / PATCH) + 1; cy++) {
    for (let cx = Math.floor(left / PATCH) - 1; cx <= Math.floor(right / PATCH) + 1; cx++) {
      const x = (cx + hash(cx, cy, 11)) * PATCH;
      const y = (cy + hash(cx, cy, 12)) * PATCH;
      const r = 120 + hash(cx, cy, 13) * 140;
      // Pale dry-looking sand, or darker damp sand
      const light = hash(cx, cy, 14) < 0.6;
      const color = light ? '255, 248, 225' : '110, 95, 60';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color}, ${light ? 0.22 : 0.14})`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

function drawDetails(ctx, left, top, right, bottom, t) {
  const c0 = Math.floor(left / CELL) - 1;
  const c1 = Math.floor(right / CELL) + 1;
  const r0 = Math.floor(top / CELL) - 1;
  const r1 = Math.floor(bottom / CELL) + 1;
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const x = (cx + 0.15 + hash(cx, cy, 1) * 0.7) * CELL;
      const y = (cy + 0.15 + hash(cx, cy, 2) * 0.7) * CELL;
      // Rare: a rock with a spiral carved into it. Nobody explains it.
      if (hash(cx, cy, 9) < 0.007) {
        drawCarvedRock(ctx, x, y, cx, cy);
        continue;
      }
      const roll = hash(cx, cy, 0);
      if (roll < 0.1) drawCoral(ctx, x, y, cx, cy);
      else if (roll < 0.16) drawBrainCoral(ctx, x, y, cx, cy);
      else if (roll < 0.27) drawRock(ctx, x, y, cx, cy, 10 + hash(cx, cy, 3) * 14);
      else if (roll < 0.4) drawSeaweed(ctx, x, y, cx, cy, t);
      else if (roll < 0.45) drawStarfish(ctx, x, y, cx, cy);
      else if (roll < 0.49) drawShell(ctx, x, y, cx, cy);
      else if (roll < 0.88) drawRipples(ctx, x, y, cx, cy);
    }
  }
}

function drawCoral(ctx, x, y, cx, cy) {
  const bleached = hash(cx, cy, 3) < 0.3;
  const color = bleached ? BLEACHED : CORAL[Math.floor(hash(cx, cy, 4) * CORAL.length)];
  const n = 5 + Math.floor(hash(cx, cy, 5) * 4);
  const size = 14 + hash(cx, cy, 6) * 12;
  const rot = hash(cx, cy, 7) * TAU;

  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.arc(x + 4, y + 6, size * 0.85, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + (hash(cx + i, cy, 8) - 0.5) * 0.6;
    const len = size * (0.6 + hash(cx, cy + i, 8) * 0.5);
    const mx = x + Math.cos(a) * len * 0.55;
    const my = y + Math.sin(a) * len * 0.55;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(a + 0.7) * len * 0.35, my + Math.sin(a + 0.7) * len * 0.35);
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawBrainCoral(ctx, x, y, cx, cy) {
  const r = 10 + hash(cx, cy, 3) * 8;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.arc(x + 3, y + 5, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hash(cx, cy, 4) < 0.5 ? '#a8805f' : '#8a7aa0';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    const oy = y + i * r * 0.45;
    ctx.moveTo(x - r * 0.75, oy);
    ctx.bezierCurveTo(x - r * 0.3, oy - r * 0.3, x + r * 0.2, oy + r * 0.3, x + r * 0.75, oy);
  }
  ctx.stroke();
}

function rockPath(ctx, x, y, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const rr = size * (0.75 + hash(cx * 7 + i, cy, 4) * 0.35);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawRock(ctx, x, y, cx, cy, size) {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.25, y + size * 0.45, size, size * 0.7, 0, 0, TAU);
  ctx.fill();
  rockPath(ctx, x, y, cx, cy, size);
  ctx.fillStyle = '#7f7a6b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(50, 40, 25, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.ellipse(x - size * 0.2, y - size * 0.25, size * 0.45, size * 0.28, 0, 0, TAU);
  ctx.fill();
}

function drawCarvedRock(ctx, x, y, cx, cy) {
  const size = 28 + hash(cx, cy, 3) * 8;
  drawRock(ctx, x, y, cx, cy, size);
  ctx.strokeStyle = 'rgba(10, 25, 30, 0.6)';
  ctx.lineWidth = 2.2;
  spiralPath(ctx, x, y, size * 0.55);
  ctx.stroke();
}

function drawSeaweed(ctx, x, y, cx, cy, t) {
  const strands = 3 + Math.floor(hash(cx, cy, 3) * 3);
  ctx.strokeStyle = hash(cx, cy, 4) < 0.5 ? 'rgba(70, 160, 100, 0.7)' : 'rgba(110, 170, 80, 0.7)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < strands; i++) {
    // The current pushes every strand roughly the same way.
    const a = -0.6 + hash(cx + i, cy, 5) * 1.2;
    const len = 18 + hash(cx, cy + i, 6) * 18;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const bx = x + (i - strands / 2) * 3;
    ctx.moveTo(bx, y);
    for (let k = 1; k <= 4; k++) {
      const f = k / 4;
      const sway = Math.sin(t * 1.6 + k * 0.8 + i + cx) * 4 * f;
      ctx.lineTo(bx + dx * len * f - dy * sway, y + dy * len * f + dx * sway);
    }
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawStarfish(ctx, x, y, cx, cy) {
  const size = 7 + hash(cx, cy, 3) * 3;
  star(ctx, x, y, size, size * 0.42, 5, hash(cx, cy, 4) * TAU);
  ctx.fillStyle = hash(cx, cy, 5) < 0.6 ? '#b8694c' : '#8e64a6';
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.25, 0, TAU);
  ctx.fill();
}

function drawShell(ctx, x, y, cx, cy) {
  const rot = hash(cx, cy, 3) * TAU;
  ctx.fillStyle = 'rgba(230, 210, 190, 0.7)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, 7, rot - 1.1, rot + 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 90, 70, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    const a = rot + k * 0.45;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
  }
  ctx.stroke();
}

/**
 * Sand ripples: wavy parallel ridges, each a bright crest with a soft shadow behind it.
 * Ripples in the same big patch all run the same way, like real ones shaped by a current.
 */
function drawRipples(ctx, x, y, cx, cy) {
  const patchX = Math.floor((cx * CELL) / PATCH);
  const patchY = Math.floor((cy * CELL) / PATCH);
  const angle = (hash(patchX, patchY, 31) - 0.5) * 1.2;
  const count = 3 + Math.floor(hash(cx, cy, 32) * 3);
  const len = 40 + hash(cx, cy, 33) * 30;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  for (const [color, offset] of [['rgba(110, 90, 55, 0.18)', 2.5], ['rgba(255, 250, 232, 0.28)', 0]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const oy = (k - count / 2) * 10 + offset;
      ctx.moveTo(-len / 2, oy);
      ctx.bezierCurveTo(-len / 6, oy - 5, len / 6, oy + 5, len / 2, oy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Little silver fish swimming in perfect, unnaturally steady circles. */
function drawSchools(ctx, left, top, right, bottom, t) {
  const c0 = Math.floor((left - 150) / SCHOOL_CELL);
  const c1 = Math.floor((right + 150) / SCHOOL_CELL);
  const r0 = Math.floor((top - 150) / SCHOOL_CELL);
  const r1 = Math.floor((bottom + 150) / SCHOOL_CELL);
  ctx.fillStyle = 'rgba(45, 85, 95, 0.45)';
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      if (hash(cx, cy, 21) > 0.4) continue;
      const x = (cx + 0.2 + hash(cx, cy, 22) * 0.6) * SCHOOL_CELL;
      const y = (cy + 0.2 + hash(cx, cy, 23) * 0.6) * SCHOOL_CELL;
      const radius = 45 + hash(cx, cy, 24) * 40;
      const count = 9 + Math.floor(hash(cx, cy, 25) * 6);
      const dir = hash(cx, cy, 26) < 0.5 ? 1 : -1;
      const spin = t * 0.9 * dir;
      for (let i = 0; i < count; i++) {
        const a = spin + (i / count) * TAU;
        ctx.save();
        ctx.translate(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        ctx.rotate(a + (dir * Math.PI) / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 2.2, 0, 0, TAU);
        ctx.moveTo(-5, 0);
        ctx.lineTo(-9, -2.5);
        ctx.lineTo(-9, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

// ------------------------------------------------------------------ textures

/**
 * Tileable caustic light pattern: bright wavy lines along the borders of Voronoi
 * cells. Generated once at startup.
 */
function makeCausticTile(size, points, seed) {
  const pts = [];
  for (let i = 0; i < points; i++) pts.push([hash(i, seed, 1) * size, hash(i, seed, 2) * size]);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const tctx = canvas.getContext('2d');
  const img = tctx.createImageData(size, size);
  const lineWidth = size * 0.035;
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Warp the lookup (in a tile-safe way) so the lines come out curvy.
      const wx = x + Math.sin((y / size) * TAU * 3) * 5;
      const wy = y + Math.sin((x / size) * TAU * 3) * 5;
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of pts) {
        let dx = Math.abs(wx - px);
        if (dx > half) dx = size - dx;
        let dy = Math.abs(wy - py);
        if (dy > half) dy = size - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const v = Math.max(0, 1 - edge / lineWidth);
      const i = (y * size + x) * 4;
      img.data[i] = 220;
      img.data[i + 1] = 255;
      img.data[i + 2] = 250;
      img.data[i + 3] = Math.round(v * v * 255);
    }
  }
  tctx.putImageData(img, 0, 0);
  return canvas;
}
