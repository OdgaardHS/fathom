import { TAU } from '../core/math.js';
import { serpentSegmentRadius } from '../entities/behaviors.js';

/**
 * Drawing code for creatures, made from canvas shapes. Each sprite is
 * `(ctx, enemy, time) => void` and draws at the enemy's interpolated position
 * (e.rx, e.ry). Enemies pick one by name via `sprite` in src/data/enemies.js.
 * To switch to image sprites later, replace a function here with ctx.drawImage.
 */

const FLASH = '#ffffff';
const OUTLINE = 'rgba(10, 30, 40, 0.45)';

/** The color, or white while the enemy flashes from a hit. */
const tint = (e, color) => (e.flash > 0 ? FLASH : color);

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

/** Rotate the context so the creature faces +x. Pair with ctx.restore(). */
function faceForward(ctx, e) {
  ctx.save();
  ctx.translate(e.rx, e.ry);
  ctx.rotate(Math.atan2(e.dirY, e.dirX));
}

export function spiralPath(ctx, x, y, r, turns = 2.25) {
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const a = t * turns * TAU;
    const px = x + Math.cos(a) * r * t;
    const py = y + Math.sin(a) * r * t;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

export function star(ctx, x, y, outer, inner, points, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i / (points * 2)) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** A razor starfish (the weapon, and the thrown ones). */
export function drawStarfish(ctx, x, y, size, rotation, color) {
  star(ctx, x, y, size, size * 0.42, 5, rotation);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(90, 30, 10, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd3a8';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.22, 0, TAU);
  ctx.fill();
}

function drawCrabBody(ctx, e, time, raise = 0, clawSize = 1) {
  const r = e.radius;
  const p = e.type.palette;
  const flash = e.flash > 0;
  const step = Math.sin(time * 16 + e.id);
  const legWidth = Math.max(1.5, r * 0.13);

  // Legs: three a side, alternating as it walks
  ctx.strokeStyle = tint(e, p.leg);
  ctx.lineWidth = legWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const lx = r * (0.35 - i * 0.4);
    const k = (i % 2 === 0 ? step : -step) * r * 0.18;
    ctx.moveTo(lx, -r * 0.6);
    ctx.lineTo(lx - r * 0.3 + k, -r * 1.2);
    ctx.moveTo(lx, r * 0.6);
    ctx.lineTo(lx - r * 0.3 - k, r * 1.2);
  }
  ctx.stroke();

  // Claws (raised claws spread wider and further forward)
  for (const side of [-1, 1]) {
    const cx = r * (1.05 + 0.3 * raise + 0.15 * (clawSize - 1));
    const cy = side * r * (0.6 + 0.35 * raise);
    ctx.strokeStyle = tint(e, p.leg);
    ctx.lineWidth = legWidth * clawSize;
    ctx.beginPath();
    ctx.moveTo(r * 0.45, side * r * 0.45);
    ctx.lineTo(cx - r * 0.2, cy);
    ctx.stroke();
    ctx.fillStyle = tint(e, p.claw);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.34 * clawSize, r * 0.24 * clawSize, side * 0.3, 0, TAU);
    ctx.fill();
    if (clawSize > 1) ctx.stroke();
    if (!flash) {
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.05, cy);
      ctx.lineTo(cx + r * 0.34 * clawSize, cy + side * r * 0.04);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';

  // Shell
  ctx.fillStyle = tint(e, p.shell);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.95, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (!flash) {
    ctx.fillStyle = p.spot;
    circle(ctx, -r * 0.2, -r * 0.35, r * 0.14);
    ctx.fill();
    circle(ctx, -r * 0.25, r * 0.3, r * 0.11);
    ctx.fill();
    circle(ctx, r * 0.1, r * 0.05, r * 0.09);
    ctx.fill();
  }

  // Eyes on stalks
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#f4f1ea';
    circle(ctx, r * 0.72, side * r * 0.22, r * 0.12);
    ctx.fill();
    ctx.fillStyle = '#121a1f';
    circle(ctx, r * 0.76, side * r * 0.22, r * 0.06);
    ctx.fill();
  }
}

export const SPRITES = {
  fish(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    faceForward(ctx, e);

    // Tail wags
    ctx.save();
    ctx.translate(-r * 0.95, 0);
    ctx.rotate(Math.sin(time * 14 + e.id) * 0.35);
    ctx.fillStyle = tint(e, p.fin);
    ctx.beginPath();
    ctx.moveTo(r * 0.15, 0);
    ctx.lineTo(-r * 0.75, -r * 0.6);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r * 0.75, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Side fins
    ctx.fillStyle = tint(e, p.fin);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(r * 0.1, side * r * 0.55, r * 0.35, r * 0.14, side * 0.5, 0, TAU);
      ctx.fill();
    }

    // Body with stripes
    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (e.flash <= 0) {
      ctx.fillStyle = p.stripe;
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, 0, r * 0.14, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r * 0.25, 0, r * 0.12, r * 0.5, 0, 0, TAU);
      ctx.fill();
    }

    // Milky, pupil-less eyes
    ctx.fillStyle = p.eye;
    circle(ctx, r * 0.68, -r * 0.3, r * 0.15);
    ctx.fill();
    circle(ctx, r * 0.68, r * 0.3, r * 0.15);
    ctx.fill();
    ctx.restore();
  },

  barracuda(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    faceForward(ctx, e);

    // Forked tail
    ctx.save();
    ctx.translate(-r * 1.55, 0);
    ctx.rotate(Math.sin(time * 10 + e.id) * 0.25);
    ctx.fillStyle = tint(e, p.fin);
    ctx.beginPath();
    ctx.moveTo(r * 0.2, 0);
    ctx.lineTo(-r * 0.55, -r * 0.55);
    ctx.lineTo(-r * 0.25, 0);
    ctx.lineTo(-r * 0.55, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Long body with a pointed snout
    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 1.9, 0);
    ctx.quadraticCurveTo(r * 0.8, -r * 0.5, -r * 1.6, -r * 0.18);
    ctx.lineTo(-r * 1.6, r * 0.18);
    ctx.quadraticCurveTo(r * 0.8, r * 0.5, r * 1.9, 0);
    ctx.fill();
    ctx.stroke();

    if (e.flash <= 0) {
      ctx.strokeStyle = p.back;
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(r * 1.1, 0);
      ctx.lineTo(-r * 1.3, 0);
      ctx.stroke();
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = r * (0.6 - i * 0.5);
        ctx.moveTo(x, -r * 0.26);
        ctx.lineTo(x - r * 0.12, r * 0.26);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    ctx.fillStyle = p.eye;
    circle(ctx, r * 1.2, -r * 0.2, r * 0.11);
    ctx.fill();
    circle(ctx, r * 1.2, r * 0.2, r * 0.11);
    ctx.fill();
    ctx.restore();
  },

  crab(ctx, e, time) {
    faceForward(ctx, e);
    drawCrabBody(ctx, e, time);
    ctx.restore();
  },

  matriarch(ctx, e, time) {
    const s = e.state;
    const r = e.radius;
    const p = e.type.palette;
    // Claws rise during the wind-up and come down as she recovers
    let raise = 0;
    if (s.phase === 'windup') raise = Math.min(1, 1 - s.timer / 0.6);
    else if (s.phase === 'recover') raise = Math.max(0, s.timer);

    faceForward(ctx, e);
    drawCrabBody(ctx, e, time * 0.5, raise, 1.45);
    if (e.flash <= 0) {
      // Worn rim and cracks in the bleached shell
      ctx.strokeStyle = 'rgba(120, 110, 95, 0.45)';
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.64, r * 0.8, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(105, 95, 80, 0.55)';
      ctx.lineWidth = r * 0.025;
      ctx.beginPath();
      for (const [x0, y0, x1, y1, x2, y2] of [
        [0.6, -0.4, 0.35, -0.3, 0.3, -0.12],
        [0.15, 0.8, 0.1, 0.55, 0.28, 0.42],
        [-0.7, 0.4, -0.48, 0.3, -0.42, 0.12],
      ]) {
        ctx.moveTo(x0 * r, y0 * r);
        ctx.lineTo(x1 * r, y1 * r);
        ctx.lineTo(x2 * r, y2 * r);
      }
      ctx.stroke();

      // Barnacles
      for (const [x, y] of [[0.42, 0.18], [0.35, -0.55], [-0.3, -0.72], [-0.68, -0.25], [0.5, 0.5]]) {
        ctx.fillStyle = '#cfc6b3';
        circle(ctx, x * r, y * r, r * 0.075);
        ctx.fill();
        ctx.fillStyle = '#5d564b';
        circle(ctx, x * r, y * r, r * 0.03);
        ctx.fill();
      }

      // Branching coral growing out of her shell
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.075;
      const growths = [
        [-0.42, -0.45, 0.24, 0.3],
        [-0.5, 0.38, 0.28, 2.2],
        [-0.1, 0.62, 0.18, 1.4],
        [0.12, -0.62, 0.16, 4.1],
      ];
      growths.forEach(([x, y, size, rot], i) => {
        ctx.strokeStyle = p.coral[i % p.coral.length];
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = rot + (k / 5) * TAU;
          const len = size * r * (k % 2 ? 0.7 : 1);
          ctx.moveTo(x * r, y * r);
          ctx.lineTo(x * r + Math.cos(a) * len, y * r + Math.sin(a) * len);
        }
        ctx.stroke();
      });
      ctx.lineCap = 'butt';

      // The same spiral as on the rocks
      ctx.strokeStyle = p.carving;
      ctx.lineWidth = r * 0.05;
      spiralPath(ctx, r * 0.05, 0, r * 0.32);
      ctx.stroke();
      // Her eyes burn red once she's badly hurt
      if (e.hp < e.maxHp * 0.5) {
        ctx.fillStyle = 'rgba(255, 60, 60, 0.95)';
        circle(ctx, r * 0.76, -r * 0.22, r * 0.07);
        ctx.fill();
        circle(ctx, r * 0.76, r * 0.22, r * 0.07);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  jelly(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    const x = e.rx;
    const y = e.ry;
    const pulse = Math.sin(e.state.pulse ?? 0);
    const w = r * (1 + 0.12 * pulse);
    const h = r * (0.85 - 0.1 * pulse);
    const rim = y + r * 0.1;

    ctx.fillStyle = p.glow;
    circle(ctx, x, y, r * 1.6);
    ctx.fill();

    // Trailing tentacles
    ctx.strokeStyle = e.flash > 0 ? FLASH : p.tentacle;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const tx = x + (i - 2) * w * 0.32;
      let ty = rim;
      ctx.moveTo(tx, ty);
      for (let k = 1; k <= 4; k++) {
        ty += r * 0.36;
        ctx.lineTo(tx + Math.sin(time * 4 + k * 0.9 + i * 1.3 + e.id) * r * 0.2, ty);
      }
    }
    ctx.stroke();

    // Bell with a scalloped rim
    ctx.fillStyle = tint(e, p.bell);
    ctx.beginPath();
    ctx.ellipse(x, rim, w, h, 0, Math.PI, TAU);
    for (let i = 0; i < 4; i++) {
      const x0 = x + w - (i * 2 * w) / 4;
      const x1 = x0 - (2 * w) / 4;
      ctx.quadraticCurveTo((x0 + x1) / 2, rim + r * 0.25, x1, rim);
    }
    ctx.closePath();
    ctx.fill();

    if (e.flash <= 0) {
      ctx.fillStyle = p.inner;
      circle(ctx, x - w * 0.3, rim - h * 0.35, r * 0.15);
      ctx.fill();
      circle(ctx, x + w * 0.3, rim - h * 0.35, r * 0.15);
      ctx.fill();
      circle(ctx, x, rim - h * 0.6, r * 0.13);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(x - w * 0.35, rim - h * 0.65, w * 0.22, h * 0.12, -0.5, 0, TAU);
      ctx.fill();
    }
  },

  puffer(ctx, e, time) {
    const p = e.type.palette;
    const inflate = e.state.inflate ?? 0;
    const r = e.radius * (1 + 0.55 * inflate);
    faceForward(ctx, e);
    // Trembles just before it bursts
    if (inflate > 0.5) ctx.translate(Math.sin(time * 70) * 1.5 * inflate, 0);

    // Tail
    ctx.fillStyle = tint(e, p.fin);
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.35, -r * 0.4);
    ctx.lineTo(-r * 1.35, r * 0.4);
    ctx.closePath();
    ctx.fill();

    // Spikes grow as it inflates
    const spike = r * (0.12 + 0.4 * inflate);
    ctx.strokeStyle = tint(e, p.spike);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      ctx.lineTo(Math.cos(a) * (r + spike), Math.sin(a) * (r + spike));
    }
    ctx.stroke();

    // Body
    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    circle(ctx, 0, 0, r);
    ctx.fill();
    ctx.stroke();
    if (e.flash <= 0) {
      ctx.fillStyle = p.belly;
      ctx.beginPath();
      ctx.ellipse(r * 0.15, 0, r * 0.55, r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.spot;
      for (const [sx, sy] of [[-0.45, -0.35], [-0.5, 0.3], [-0.1, -0.62], [-0.15, 0.62], [-0.7, 0]]) {
        circle(ctx, sx * r, sy * r, r * 0.09);
        ctx.fill();
      }
    }

    // Side fins flutter
    const flap = Math.sin(time * 18 + e.id) * 0.4;
    ctx.fillStyle = tint(e, p.fin);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.95, r * 0.28, r * 0.12, -0.6 + flap, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, r * 0.28, r * 0.12, 0.6 - flap, 0, TAU);
    ctx.fill();

    // Big worried eyes
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      circle(ctx, r * 0.5, side * r * 0.38, r * 0.2);
      ctx.fill();
      ctx.fillStyle = '#16202a';
      circle(ctx, r * 0.58, side * r * 0.38, r * 0.1);
      ctx.fill();
    }
    ctx.restore();
  },
};

const DEFAULT_DIVER = { suit: '#c9893a', helmet: '#d4a94f', trim: '#6e4f1a', gear: 'salvager' };

/**
 * The player: a diver seen from above, facing +x. Colors come from the character's palette,
 * and `palette.gear` picks their kit so characters are easy to tell apart:
 *   salvager  brass helmet with portholes, a rope coil and grappling hook over the
 *             shoulder, a salvage net with finds on the back (Mara)
 *   pilot     modern helmet with a dark visor, a radio antenna, a mini drone docked on the
 *             back and a controller held out in front (Otto)
 */
export function drawDiver(ctx, p, time) {
  const r = p.radius;
  const pal = p.hero?.palette ?? DEFAULT_DIVER;
  const pilot = pal.gear === 'pilot';
  ctx.save();
  ctx.translate(p.rx, p.ry);
  ctx.rotate(Math.atan2(p.facingY, p.facingX));
  ctx.lineJoin = 'round';

  // Flippers kick while moving
  const kick = p.moving ? Math.sin(time * 10) * 0.35 : 0;
  ctx.fillStyle = pal.fins ?? '#1f3b4d';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-r * 0.75, side * r * 0.32);
    ctx.rotate(side * (0.15 + kick * side));
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.14);
    ctx.lineTo(-r * 0.75, -r * 0.24);
    ctx.lineTo(-r * 0.75, r * 0.24);
    ctx.lineTo(0, r * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Air tank on the back
  ctx.fillStyle = '#9aa7b0';
  ctx.strokeStyle = 'rgba(20, 30, 40, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-r * 1.0, -r * 0.42, r * 0.7, r * 0.84, r * 0.25);
  ctx.fill();
  ctx.stroke();
  if (!pilot) drawSalvageNet(ctx, r);

  // Diving suit
  ctx.fillStyle = p.hurtFlash > 0 ? '#ff8a8a' : pal.suit;
  ctx.strokeStyle = 'rgba(20, 15, 10, 0.6)';
  ctx.lineWidth = 2;
  circle(ctx, -r * 0.1, 0, r * 0.82);
  ctx.fill();
  ctx.stroke();

  if (pilot) {
    drawDockedDrone(ctx, r, time);
    drawController(ctx, r, pal, time);
    drawVisorHelmet(ctx, r, pal, time);
    drawAntenna(ctx, r, time);
  } else {
    drawRopeCoil(ctx, r, pal);
    drawBrassHelmet(ctx, r, pal);
  }
  ctx.restore();
}

/** Mara's classic brass helmet: round, with side portholes and a big front window. */
function drawBrassHelmet(ctx, r, pal) {
  ctx.fillStyle = pal.helmet;
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 2.5;
  circle(ctx, r * 0.15, 0, r * 0.66);
  ctx.fill();
  ctx.stroke();
  // rivets around the collar
  ctx.fillStyle = pal.trim;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    circle(ctx, r * 0.15 + Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.05);
    ctx.fill();
  }
  ctx.fillStyle = '#5bb7c8';
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    circle(ctx, r * 0.1, side * r * 0.42, r * 0.13);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#7fd8e6';
  ctx.lineWidth = 2;
  circle(ctx, r * 0.5, 0, r * 0.28);
  ctx.fill();
  ctx.stroke();
  // cage bars over the front window
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(r * 0.5, -r * 0.27);
  ctx.lineTo(r * 0.5, r * 0.27);
  ctx.moveTo(r * 0.23, 0);
  ctx.lineTo(r * 0.77, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  circle(ctx, r * 0.6, -r * 0.12, r * 0.07);
  ctx.fill();
}

/** Mara: a coil of rope with a grappling hook slung over one shoulder, on a strap. */
function drawRopeCoil(ctx, r, pal) {
  // strap across the chest
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.55);
  ctx.lineTo(-r * 0.05, -r * 0.7);
  ctx.stroke();
  // the coil
  const cx = -r * 0.42;
  const cy = -r * 0.66;
  ctx.strokeStyle = 'rgba(40, 25, 10, 0.8)';
  ctx.lineWidth = r * 0.22;
  circle(ctx, cx, cy, r * 0.27);
  ctx.stroke();
  ctx.strokeStyle = '#e3cf98';
  ctx.lineWidth = r * 0.14;
  circle(ctx, cx, cy, r * 0.27);
  ctx.stroke();
  ctx.strokeStyle = '#b89a5c';
  ctx.lineWidth = 1;
  circle(ctx, cx, cy, r * 0.2);
  ctx.stroke();
  // grappling hook hanging off it
  const hx = cx - r * 0.38;
  const hy = cy - r * 0.28;
  ctx.strokeStyle = '#cfd5db';
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, cy - r * 0.1);
  ctx.lineTo(hx, hy);
  for (const a of [-0.9, 0.4, 1.7]) {
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(a + Math.PI) * r * 0.2, hy + Math.sin(a + Math.PI) * r * 0.2);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Mara: a mesh salvage net on her back with gold and a pearl poking out. */
function drawSalvageNet(ctx, r) {
  const x = -r * 0.62;
  const y = r * 0.6;
  ctx.fillStyle = '#7a5a2c';
  ctx.strokeStyle = 'rgba(30, 18, 6, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.36, r * 0.3, 0.3, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  circle(ctx, x - r * 0.1, y - r * 0.05, r * 0.11);
  ctx.fill();
  ctx.fillStyle = '#f4efe2';
  circle(ctx, x + r * 0.12, y + r * 0.06, r * 0.09);
  ctx.fill();
  // net mesh over the finds
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.36, r * 0.3, 0.3, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(230, 210, 160, 0.75)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let k = -3; k <= 3; k++) {
    ctx.moveTo(x + k * r * 0.12 - r * 0.4, y - r * 0.4);
    ctx.lineTo(x + k * r * 0.12 + r * 0.4, y + r * 0.4);
    ctx.moveTo(x + k * r * 0.12 + r * 0.4, y - r * 0.4);
    ctx.lineTo(x + k * r * 0.12 - r * 0.4, y + r * 0.4);
  }
  ctx.stroke();
  ctx.restore();
}

/** Otto's modern helmet: smooth shell, dark wraparound visor, two headlights. */
function drawVisorHelmet(ctx, r, pal, time) {
  ctx.fillStyle = pal.helmet;
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 2.2;
  circle(ctx, r * 0.15, 0, r * 0.64);
  ctx.fill();
  ctx.stroke();
  // visor
  ctx.strokeStyle = '#162430';
  ctx.lineWidth = r * 0.26;
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.5, -1.05, 1.05);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(127, 249, 255, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.55, -0.7, -0.2);
  ctx.stroke();
  // headlights
  const glow = 0.75 + 0.25 * Math.sin(time * 3);
  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgba(255, 244, 200, ${glow})`;
    circle(ctx, r * 0.42, side * r * 0.55, r * 0.1);
    ctx.fill();
  }
}

/** Otto: a radio antenna with a blinking tip. */
function drawAntenna(ctx, r, time) {
  ctx.strokeStyle = '#2a3a44';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.25, -r * 0.35);
  ctx.lineTo(-r * 0.8, -r * 0.95);
  ctx.stroke();
  ctx.fillStyle = Math.floor(time * 2) % 2 === 0 ? '#ff5d5d' : '#7a2020';
  circle(ctx, -r * 0.8, -r * 0.95, r * 0.12);
  ctx.fill();
}

/** Otto: a spare drone docked on his back, facing backward. */
function drawDockedDrone(ctx, r, time) {
  ctx.save();
  ctx.translate(-r * 0.86, 0);
  ctx.rotate(Math.PI);
  drawDroneBody(ctx, r * 0.44, time, false);
  ctx.restore();
}

/** Otto: arms holding the drone controller out in front, its screen glowing. */
function drawController(ctx, r, pal, time) {
  ctx.strokeStyle = pal.suit;
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(r * 0.05, side * r * 0.62);
    ctx.lineTo(r * 0.82, side * r * 0.3);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#26333d';
  ctx.strokeStyle = 'rgba(10, 15, 20, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(r * 0.8, -r * 0.46, r * 0.34, r * 0.92, r * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(127, 249, 255, ${0.7 + 0.3 * Math.sin(time * 6)})`;
  ctx.fillRect(r * 0.86, -r * 0.3, r * 0.22, r * 0.6);
}

/** An attack drone: a small yellow sub with a friendly cyan glow. */
export function drawDrone(ctx, d, time, overclocked, permanent) {
  const r = 9 * d.size;
  const fading = !permanent && d.life < 1.5;
  if (fading && Math.floor(time * 10) % 2 === 0) ctx.globalAlpha = 0.45;

  // Glow says "friendly"; gold rim when overcharged (Conductor Coil)
  ctx.fillStyle = overclocked ? 'rgba(127, 249, 255, 0.34)' : 'rgba(127, 249, 255, 0.16)';
  circle(ctx, d.rx, d.ry, r * 1.8);
  ctx.fill();
  if (d.power > 1 && !d.charges) {
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.3 + 0.35 * (d.power - 1)})`;
    ctx.lineWidth = 2;
    circle(ctx, d.rx, d.ry, r * 1.5);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(d.rx, d.ry);
  ctx.rotate(Math.atan2(d.dirY, d.dirX));
  drawDroneBody(ctx, r, time, overclocked);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * The drone itself, facing +x around (0, 0), `r` across half its length. Shared by the
 * drones in play, the drone docked on Otto's back and the Drone Launcher's icon.
 */
export function drawDroneBody(ctx, r, time, overclocked) {
  // Side thrusters with spinning props
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#2a3a44';
    ctx.beginPath();
    ctx.roundRect(-r * 0.75, side * r * 0.62 - r * 0.2, r * 1.0, r * 0.4, r * 0.15);
    ctx.fill();
    const blur = Math.sin(time * 40 + side) * r * 0.25;
    ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, side * r * 0.62 - blur);
    ctx.lineTo(-r * 0.8, side * r * 0.62 + blur);
    ctx.stroke();
  }

  // Body
  ctx.fillStyle = '#ffc43d';
  ctx.strokeStyle = '#5a3d00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-r * 0.7, -r * 0.45, r * 1.4, r * 0.9, r * 0.28);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90, 61, 0, 0.5)';
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.45);
  ctx.lineTo(-r * 0.2, r * 0.45);
  ctx.stroke();

  // Camera eye
  ctx.fillStyle = '#123';
  circle(ctx, r * 0.42, 0, r * 0.24);
  ctx.fill();
  ctx.fillStyle = overclocked ? '#ffffff' : '#7ff9ff';
  circle(ctx, r * 0.46, 0, r * 0.14);
  ctx.fill();
}

// ------------------------------------------------------------ The Open Blue

Object.assign(SPRITES, {
  /** Long and fast, with a big sail it raises right before a lunge. */
  sailfish(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    const lunging = e.state.phase === 'windup' || e.state.phase === 'dash';
    faceForward(ctx, e);

    // Forked tail
    ctx.save();
    ctx.translate(-r * 1.7, 0);
    ctx.rotate(Math.sin(time * 12 + e.id) * 0.25);
    ctx.fillStyle = tint(e, p.sail);
    ctx.beginPath();
    ctx.moveTo(r * 0.2, 0);
    ctx.lineTo(-r * 0.7, -r * 0.8);
    ctx.lineTo(-r * 0.3, 0);
    ctx.lineTo(-r * 0.7, r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The sail, raised when lunging
    const sail = lunging ? 1 : 0.5;
    ctx.fillStyle = tint(e, p.sail);
    ctx.beginPath();
    ctx.moveTo(r * 0.9, 0);
    ctx.quadraticCurveTo(r * 0.1, -r * 1.7 * sail, -r * 1.2, -r * 0.15);
    ctx.lineTo(-r * 1.2, 0);
    ctx.closePath();
    ctx.fill();

    // Body and bill
    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.quadraticCurveTo(r * 0.3, -r * 0.55, -r * 1.7, -r * 0.12);
    ctx.lineTo(-r * 1.7, r * 0.12);
    ctx.quadraticCurveTo(r * 0.3, r * 0.55, r * 1.3, 0);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = tint(e, p.body);
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.lineTo(r * 2.5, 0);
    ctx.stroke();
    ctx.lineCap = 'butt';

    if (e.flash <= 0) {
      ctx.fillStyle = p.spots;
      for (let i = 0; i < 4; i++) {
        circle(ctx, r * (0.6 - i * 0.45), 0, r * 0.08);
        ctx.fill();
      }
    }
    ctx.fillStyle = p.eye;
    circle(ctx, r * 1.0, -r * 0.18, r * 0.1);
    ctx.fill();
    circle(ctx, r * 1.0, r * 0.18, r * 0.1);
    ctx.fill();
    ctx.restore();
  },

  /** Seen from above: torpedo body, wide pectoral fins, a dark dorsal ridge. */
  shark(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    faceForward(ctx, e);

    ctx.save();
    ctx.translate(-r * 1.45, 0);
    ctx.rotate(Math.sin(time * 6 + e.id) * 0.2);
    ctx.fillStyle = tint(e, p.fin);
    ctx.beginPath();
    ctx.moveTo(r * 0.25, 0);
    ctx.lineTo(-r * 0.6, -r * 0.75);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.5, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = tint(e, p.fin);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.4, side * r * 0.3);
      ctx.lineTo(-r * 0.35, side * r * 1.15);
      ctx.lineTo(-r * 0.05, side * r * 0.3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 1.45, 0);
    ctx.bezierCurveTo(r * 1.2, -r * 0.55, -r * 0.6, -r * 0.5, -r * 1.55, -r * 0.1);
    ctx.lineTo(-r * 1.55, r * 0.1);
    ctx.bezierCurveTo(-r * 0.6, r * 0.5, r * 1.2, r * 0.55, r * 1.45, 0);
    ctx.fill();
    ctx.stroke();

    if (e.flash <= 0) {
      ctx.fillStyle = p.fin;
      ctx.beginPath();
      ctx.moveTo(r * 0.25, 0);
      ctx.lineTo(-r * 0.45, -r * 0.13);
      ctx.lineTo(-r * 0.45, r * 0.13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = p.eye;
    circle(ctx, r * 1.0, -r * 0.28, r * 0.07);
    ctx.fill();
    circle(ctx, r * 1.0, r * 0.28, r * 0.07);
    ctx.fill();
    ctx.restore();
  },

  /** A see-through squid: arms toward you, mantle behind, organs showing through. */
  squid(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    const squeeze = 1 - 0.25 * Math.min(1, (e.state.squirt ?? 0) / 0.25);
    faceForward(ctx, e);

    ctx.strokeStyle = tint(e, p.body);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const off = (i - 2.5) * r * 0.13;
      ctx.moveTo(r * 0.3, off);
      for (let k = 1; k <= 3; k++) {
        ctx.lineTo(r * (0.3 + k * 0.35), off * (1 + k * 0.3) + Math.sin(time * 6 + i + k) * r * 0.1);
      }
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Mantle, squeezed for a moment when it spits ink
    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = 'rgba(225, 245, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(r * 0.4, -r * 0.45 * squeeze);
    ctx.quadraticCurveTo(-r * 1.2, -r * 0.5 * squeeze, -r * 1.75, 0);
    ctx.quadraticCurveTo(-r * 1.2, r * 0.5 * squeeze, r * 0.4, r * 0.45 * squeeze);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 1.45, 0, r * 0.25, r * 0.55, 0, 0, TAU);
    ctx.fill();

    if (e.flash <= 0) {
      ctx.fillStyle = p.organs;
      ctx.beginPath();
      ctx.ellipse(-r * 0.55, 0, r * 0.4, r * 0.13, 0, 0, TAU);
      ctx.fill();
    }
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#eef8ff';
      circle(ctx, r * 0.3, side * r * 0.32, r * 0.17);
      ctx.fill();
      ctx.fillStyle = p.eye;
      circle(ctx, r * 0.35, side * r * 0.32, r * 0.09);
      ctx.fill();
    }
    ctx.restore();
  },

  /** The Omen: a giant oarfish. Silver ribbon body, red crest, and that spiral again. */
  oarfish(ctx, e, time) {
    const r = e.radius;
    const p = e.type.palette;
    const body = e.state.body ?? [];
    const ox = e.rx - e.x; // shift the body by the head's interpolation so they line up
    const oy = e.ry - e.y;
    const flash = e.flash > 0;

    // Body, tail first so the neck sits on top. Only the head (the part you can
    // damage) flashes when hit, so the long body keeps its colors under fire.
    for (let i = body.length - 1; i >= 0; i--) {
      const s = body[i];
      const sr = serpentSegmentRadius(e, i);
      ctx.fillStyle = p.body;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      circle(ctx, s.x + ox, s.y + oy, sr);
      ctx.fill();
      ctx.stroke();
      if (i % 3 === 1) {
        ctx.fillStyle = p.spots;
        circle(ctx, s.x + ox, s.y + oy, sr * 0.3);
        ctx.fill();
      }
    }

    // Red crest running down the spine
    if (body.length > 1) {
      ctx.strokeStyle = p.crest;
      ctx.lineWidth = r * 0.16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.rx, e.ry);
      for (const s of body) ctx.lineTo(s.x + ox, s.y + oy);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // Head with its trailing red plume
    faceForward(ctx, e);
    ctx.strokeStyle = p.crest;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * r * 0.15;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, off);
      ctx.quadraticCurveTo(-r * 0.8, off * 2.6 + Math.sin(time * 4 + k) * r * 0.25, -r * 1.9, off * 3.6 + Math.sin(time * 3 + k) * r * 0.35);
      ctx.stroke();
    }
    ctx.fillStyle = tint(e, p.body);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (!flash) {
      ctx.strokeStyle = p.carving;
      ctx.lineWidth = r * 0.06;
      spiralPath(ctx, -r * 0.15, 0, r * 0.35);
      ctx.stroke();
    }
    const enraged = e.hp < e.maxHp * 0.5;
    for (const side of [-1, 1]) {
      ctx.fillStyle = enraged ? '#ff4d4d' : p.eye;
      circle(ctx, r * 0.6, side * r * 0.42, r * 0.16);
      ctx.fill();
      ctx.fillStyle = '#14100c';
      circle(ctx, r * 0.64, side * r * 0.42, r * 0.07);
      ctx.fill();
    }
    ctx.restore();
  },
});

// ------------------------------------------------------------------ the Watching Eye

/** Pale gold when it starts staring, through orange, to a white-hot crimson at full heat. */
export function eyeHeatColor(heat, alpha) {
  const stops = [
    [255, 236, 160],
    [255, 140, 50],
    [255, 70, 60],
  ];
  const k = heat * 2;
  const [a, b] = k < 1 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const t = k < 1 ? k : k - 1;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/**
 * The eye: bloodshot, with a goat-like slit pupil and thin nerve tendrils hanging below.
 * It looks along `look` and its iris glows as it heats up. Also used for the item icon.
 */
export function drawEye(ctx, x, y, r, look, heat, time, seed = 0) {
  ctx.save();
  ctx.translate(x, y);
  // nerve tendrils
  ctx.strokeStyle = 'rgba(120, 40, 60, 0.8)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const sway = Math.sin(time * 2.2 + i * 1.7 + seed) * 3;
    ctx.beginPath();
    ctx.moveTo(i * r * 0.35, r * 0.55);
    ctx.quadraticCurveTo(i * r * 0.5 + sway, r * 1.2, i * r * 0.3 + sway * 1.6, r * 1.75);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // blink now and then
  const blinkPhase = (time * 0.37 + seed * 0.29) % 1;
  const lid = blinkPhase < 0.03 ? 0.15 : 1;
  ctx.scale(1, lid);
  // glow when hot
  if (heat > 0.05) {
    ctx.fillStyle = eyeHeatColor(heat, 0.25 * heat);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, 0, TAU);
    ctx.fill();
  }
  // white
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU);
  ctx.fillStyle = '#f3ead8';
  ctx.fill();
  // veins
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(200, 50, 60, 0.6)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.78);
    ctx.quadraticCurveTo(Math.cos(a + 0.3) * r * 0.7, Math.sin(a + 0.3) * r * 0.55, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.35);
    ctx.stroke();
  }
  // iris and slit pupil, shifted toward where it's looking
  const ix = Math.cos(look) * r * 0.25;
  const iy = Math.sin(look) * r * 0.2;
  const iris = ctx.createRadialGradient(ix, iy, 0, ix, iy, r * 0.52);
  iris.addColorStop(0, heat > 0.5 ? '#ffd27a' : '#e6d36a');
  iris.addColorStop(1, heat > 0.5 ? eyeHeatColor(heat, 1) : '#7bb34a');
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.52, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#120a10';
  ctx.beginPath();
  ctx.ellipse(ix, iy, r * 0.11, r * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(ix - r * 0.2, iy - r * 0.2, r * 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();
  // lid rim
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU);
  ctx.strokeStyle = '#3a1a2c';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}
