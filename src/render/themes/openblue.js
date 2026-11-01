import { TAU } from '../../core/math.js';

/**
 * The Open Blue: open water with no seabed. Depth is sold by layers that scroll
 * slower the further below you they are (parallax): faint giant shapes far down,
 * fish schools in between, drifting specks close by. The current carries the specks.
 *
 * Its omen: something enormous passes beneath you. It's drawn under every
 * creature, so it reads as far below. The second pass is closer, and it looks up.
 */

const BACKGROUND = '#0b3656';

function hash(x, y, salt) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt + 1, 0x5bd1e995);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const mod = (v, m) => ((v % m) + m) % m;

export function createOpenBlueTheme() {
  let clock = 0;
  let driftX = 0; // how far the current has carried the water so far
  let driftY = 0;
  let omen = null;
  let vignette = null;
  let vignetteKey = '';

  return {
    background: BACKGROUND,
    shadows: false, // nothing below to cast shadows on

    reset() {
      omen = null;
      driftX = 0;
      driftY = 0;
    },

    update(dt, game) {
      clock += dt;
      const c = game?.currentVector ? game.currentVector() : { x: 0, y: 0 };
      driftX += c.x * dt;
      driftY += c.y * dt;
    },

    omen(name) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = 0.3 + Math.random() * 0.4;
      if (name === 'leviathan') omen = { start: clock, duration: 16, dir, lane, close: false };
      if (name === 'leviathanClose') omen = { start: clock, duration: 18, dir, lane, close: true };
    },

    /** World space, under all entities. Deepest layers first. */
    drawFloor(ctx, camera) {
      drawGlow(ctx, camera, 0.08);
      drawGiants(ctx, camera, 0.18, clock);
      if (omen && !drawLeviathan(ctx, camera, omen, clock)) omen = null;
      drawSchools(ctx, camera, 0.42, clock);
      drawSpecks(ctx, camera, 0.7, driftX, driftY, 140, 'rgba(190, 225, 255, 0.4)', 1.6);
    },

    /** Screen space, over the world and under the HUD. */
    drawOverlay(ctx, w, h, camera) {
      // Faint light from far above
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const span = w + 400;
      for (let i = 0; i < 3; i++) {
        const base = (i * span) / 3 + Math.sin(clock * 0.08 + i * 2.1) * 70 - camera.x * camera.zoom * 0.05;
        const x = mod(base, span) - 200;
        const bw = 90 + (i % 2) * 80;
        ctx.save();
        ctx.translate(x, -20);
        ctx.rotate(0.3);
        const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        g.addColorStop(0, 'rgba(150, 210, 255, 0)');
        g.addColorStop(0.5, 'rgba(150, 210, 255, 0.04)');
        g.addColorStop(1, 'rgba(150, 210, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-bw / 2, 0, bw, h * 1.4);
        ctx.restore();
      }
      ctx.restore();

      // Specks right in front of your mask: the nearest layer, moving fastest
      ctx.fillStyle = 'rgb(210, 235, 255)';
      const k = 1.35;
      const cell = 180;
      const ox = camera.x * k + driftX * k;
      const oy = camera.y * k + driftY * k;
      const zoom = camera.zoom;
      for (let cy = Math.floor((oy - h / zoom / 2) / cell) - 1; cy <= Math.floor((oy + h / zoom / 2) / cell) + 1; cy++) {
        for (let cx = Math.floor((ox - w / zoom / 2) / cell) - 1; cx <= Math.floor((ox + w / zoom / 2) / cell) + 1; cx++) {
          if (hash(cx, cy, 51) > 0.5) continue;
          const px = (cx + hash(cx, cy, 52)) * cell;
          const py = (cy + hash(cx, cy, 53)) * cell;
          const sx = (px - ox) * zoom + w / 2;
          const sy = (py - oy) * zoom + h / 2;
          ctx.globalAlpha = 0.25;
          ctx.fillRect(sx, sy, 3, 3);
        }
      }
      ctx.globalAlpha = 1;

      if (vignetteKey !== `${w}x${h}`) {
        vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        vignette.addColorStop(0, 'rgba(0, 10, 25, 0)');
        vignette.addColorStop(1, 'rgba(0, 8, 20, 0.7)');
        vignetteKey = `${w}x${h}`;
      }
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

// ------------------------------------------------------------------ parallax layers

/**
 * Helpers for a layer `k` (1 = moves with the world, smaller = deeper and slower).
 * Things in a layer are laid out in "layer space"; this returns the visible range in
 * that space plus the offset that places layer space into world space.
 */
function layerView(camera, k, margin) {
  const cx = camera.x * k;
  const cy = camera.y * k;
  return {
    left: cx - camera.viewW / 2 - margin,
    right: cx + camera.viewW / 2 + margin,
    top: cy - camera.viewH / 2 - margin,
    bottom: cy + camera.viewH / 2 + margin,
    offX: camera.x * (1 - k),
    offY: camera.y * (1 - k),
  };
}

/** Big soft patches of lighter and darker blue, very deep. */
function drawGlow(ctx, camera, k) {
  const cell = 700;
  const v = layerView(camera, k, cell);
  for (let cy = Math.floor(v.top / cell); cy <= Math.floor(v.bottom / cell); cy++) {
    for (let cx = Math.floor(v.left / cell); cx <= Math.floor(v.right / cell); cx++) {
      const x = (cx + hash(cx, cy, 41)) * cell + v.offX;
      const y = (cy + hash(cx, cy, 42)) * cell + v.offY;
      const r = 250 + hash(cx, cy, 43) * 250;
      const light = hash(cx, cy, 44) < 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, light ? 'rgba(70, 150, 200, 0.12)' : 'rgba(0, 15, 35, 0.25)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

/** Huge, faint fish far below, so the depth has a sense of scale. */
function drawGiants(ctx, camera, k, t) {
  const cell = 650;
  const v = layerView(camera, k, 200);
  ctx.fillStyle = 'rgba(2, 16, 34, 0.35)';
  for (let cy = Math.floor(v.top / cell); cy <= Math.floor(v.bottom / cell); cy++) {
    for (let cx = Math.floor(v.left / cell); cx <= Math.floor(v.right / cell); cx++) {
      if (hash(cx, cy, 61) > 0.3) continue;
      const len = 90 + hash(cx, cy, 62) * 120;
      const dir = hash(cx, cy, 63) * TAU;
      const sway = Math.sin(t * 0.15 + cx * 3 + cy) * 60;
      const x = (cx + 0.5) * cell + Math.cos(dir) * sway + v.offX;
      const y = (cy + 0.5) * cell + Math.sin(dir) * sway + v.offY;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(dir);
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.5, len * 0.13, 0, 0, TAU);
      ctx.moveTo(-len * 0.45, 0);
      ctx.lineTo(-len * 0.7, -len * 0.16);
      ctx.lineTo(-len * 0.7, len * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Loose schools of small fish silhouettes drifting in the middle distance. */
function drawSchools(ctx, camera, k, t) {
  const cell = 520;
  const v = layerView(camera, k, 120);
  ctx.fillStyle = 'rgba(4, 28, 50, 0.5)';
  for (let cy = Math.floor(v.top / cell); cy <= Math.floor(v.bottom / cell); cy++) {
    for (let cx = Math.floor(v.left / cell); cx <= Math.floor(v.right / cell); cx++) {
      if (hash(cx, cy, 71) > 0.35) continue;
      const dir = hash(cx, cy, 72) * TAU;
      const count = 12 + Math.floor(hash(cx, cy, 73) * 10);
      const bx = (cx + 0.5) * cell + Math.cos(dir) * Math.sin(t * 0.2 + cx) * 80 + v.offX;
      const by = (cy + 0.5) * cell + Math.sin(dir) * Math.sin(t * 0.2 + cx) * 80 + v.offY;
      for (let i = 0; i < count; i++) {
        const fx = bx + (hash(cx * 31 + i, cy, 74) - 0.5) * 90 + Math.sin(t * 1.5 + i) * 4;
        const fy = by + (hash(cx, cy * 31 + i, 75) - 0.5) * 60 + Math.cos(t * 1.3 + i) * 4;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(dir);
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 1.8, 0, 0, TAU);
        ctx.moveTo(-4, 0);
        ctx.lineTo(-7.5, -2);
        ctx.lineTo(-7.5, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

/** Marine snow: small specks, carried along by the current. */
function drawSpecks(ctx, camera, k, driftX, driftY, cell, color, size) {
  const v = layerView(camera, k, cell);
  const dx = driftX * k;
  const dy = driftY * k;
  ctx.fillStyle = color;
  for (let cy = Math.floor((v.top - dy) / cell); cy <= Math.floor((v.bottom - dy) / cell); cy++) {
    for (let cx = Math.floor((v.left - dx) / cell); cx <= Math.floor((v.right - dx) / cell); cx++) {
      for (let i = 0; i < 3; i++) {
        const x = (cx + hash(cx * 3 + i, cy, 81)) * cell + dx + v.offX;
        const y = (cy + hash(cx, cy * 3 + i, 82)) * cell + dy + v.offY;
        const s = size * (0.6 + hash(cx + i, cy, 83) * 0.8);
        ctx.fillRect(x, y, s, s);
      }
    }
  }
}

// ------------------------------------------------------------------ the omen

/**
 * Something vast passes far below. Returns false once it has gone.
 * The close pass is bigger and darker, and halfway through an eye opens.
 */
function drawLeviathan(ctx, camera, o, clock) {
  const t = (clock - o.start) / o.duration;
  if (t >= 1) return false;
  const fade = Math.min(1, Math.sin(t * Math.PI) * 1.8);
  const L = camera.viewW * (o.close ? 1.7 : 1.05);
  const fx = o.dir > 0 ? -0.9 + t * 2.8 : 1.9 - t * 2.8; // head position across the view
  const headX = camera.x + (fx - 0.5) * camera.viewW;
  const headY = camera.y + (o.lane - 0.5) * camera.viewH;
  const back = -o.dir; // the body trails behind the head
  const darkness = o.close ? 0.8 : 0.55;

  ctx.save();
  ctx.globalAlpha = fade;

  // The deep light goes dim while it passes
  ctx.fillStyle = `rgba(0, 6, 16, ${o.close ? 0.3 : 0.18})`;
  ctx.fillRect(camera.x - camera.viewW / 2 - 20, camera.y - camera.viewH / 2 - 20, camera.viewW + 40, camera.viewH + 40);

  // Trailing tendrils
  ctx.strokeStyle = `rgba(1, 8, 18, ${darkness * 0.5})`;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const spread = (i - 2.5) * L * 0.025;
    ctx.lineWidth = L * (0.018 - Math.abs(i - 2.5) * 0.002);
    ctx.beginPath();
    const sx = headX + back * L * 0.8;
    ctx.moveTo(sx, headY + spread);
    for (let k = 1; k <= 7; k++) {
      const px = sx + back * k * L * 0.07;
      const py = headY + spread * (1 + k * 0.4) + Math.sin(clock * 1.2 + k * 0.8 + i) * L * 0.012 * k;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // The body: overlapping soft blobs, thick at the head and tapering away
  const n = 14;
  for (let i = n - 1; i >= 0; i--) {
    const f = i / (n - 1);
    const x = headX + back * f * L * 0.8;
    const y = headY + Math.sin(clock * 0.9 + f * 5) * L * 0.035 * f;
    const r = L * (0.1 * (1 - f) + 0.025);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, `rgba(1, 8, 18, ${darkness})`);
    g.addColorStop(0.6, `rgba(1, 8, 18, ${darkness * 0.6})`);
    g.addColorStop(1, 'rgba(1, 8, 18, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, TAU);
    ctx.fill();
  }

  // On the close pass, an eye opens and looks up at you
  if (o.close && t > 0.3 && t < 0.72) {
    const open = Math.sin(((t - 0.3) / 0.42) * Math.PI);
    const ex = headX + o.dir * L * 0.045;
    const ey = headY - L * 0.012;
    const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, L * 0.06);
    glow.addColorStop(0, `rgba(235, 220, 150, ${0.35 * open})`);
    glow.addColorStop(1, 'rgba(235, 220, 150, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ex, ey, L * 0.06, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(240, 228, 170, ${0.95 * open})`;
    ctx.beginPath();
    ctx.ellipse(ex, ey, L * 0.022, L * 0.011 * open + 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(8, 6, 4, ${open})`;
    ctx.beginPath();
    ctx.ellipse(ex, ey, L * 0.004, L * 0.0095 * open + 0.3, 0, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
  return true;
}
