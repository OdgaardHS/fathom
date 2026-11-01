import { TAU, dist2 } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { WEAPON_TALENTS } from '../talents.js';
import { enemiesWithin, pruneHitTimes } from './common.js';

const SPACING = 7; // the path you swim is remembered as points this far apart
const SPREAD = 10; // how far apart the tendrils trail, side by side
const NUMB = 0.65; // Numbing Sting: stung enemies move at 65% speed...
const NUMB_TIME = 1; // ...for this long (× duration)
const ENTANGLE_EVERY = 3; // Entangle: every third sting on the same enemy pins it...
const ENTANGLE_TIME = 0.6; // ...for this long (× duration)
const DRAG = 150; // Drag Net: how hard stings tug enemies along the way you swim
const COIL_RADIUS = 34; // Coiling Drift: the ring's inner size (× size)
const COIL_DELAY = 0.3; // standing still this long starts the coil
const SHED_EVERY = 3; // Shed Tendrils: seconds between sheds (× haste)
const SHED_SHARE = 0.4; // the outer 40% of each tendril breaks off
const SHED_TIME = 4; // and keeps stinging this long (× duration)
const NODE_COLORS = ['#ff9ad5', '#9ad8ff', '#c5a3ff'];

/**
 * Siphonophore Tendrils: long stinging tendrils trail behind you along the path you swim,
 * like a man o' war. No cooldown: anything touching a tendril gets stung every so often.
 *   sting damage × might, tendril length × duration, sting rate × attack speed,
 *   tendril thickness × size, +1 tendril per amount.
 */
export const tendrils = {
  name: 'Siphonophore Tendrils',
  icon: 'St',
  color: '#c5a3ff',
  description: 'Long stinging tendrils trail behind you along the path you swim. Anything that touches one gets stung. Swim in loops to wrap them around a crowd.',
  tags: ['duration', 'attackSpeed', 'amount'],
  scaling: {
    damage: 'more damage',
    area: 'thicker tendrils',
    duration: 'longer tendrils',
    amount: 'one more tendril',
    attackSpeed: 'sting more often',
  },
  talents: WEAPON_TALENTS.tendrils,
  layer: 'under',
  levels: [
    { damage: 7, length: 165, count: 2, interval: 0.5, width: 6 },
    { damage: 9, length: 165, count: 2, interval: 0.5, width: 6, text: '+2 damage' },
    { damage: 9, length: 190, count: 3, interval: 0.5, width: 6, text: '+1 tendril, longer tendrils' },
    { damage: 12, length: 190, count: 3, interval: 0.45, width: 6, text: '+3 damage, stings more often' },
    { damage: 14, length: 215, count: 4, interval: 0.45, width: 7, text: '+1 tendril, +2 damage, longer tendrils' },
  ],
  create(w) {
    w.state.path = []; // where you've been, newest first
    w.state.nextHit = new Map(); // enemy id -> game time it can be stung again
    w.state.stings = new Map(); // Entangle: enemy id -> stings so far
    w.state.coil = 0; // Coiling Drift: 0 = trailing, 1 = curled around you
    w.state.still = 0;
    w.state.shed = []; // Shed Tendrils: broken-off pieces
    w.state.shedTimer = SHED_EVERY;
  },
  update(w, dt, game) {
    const p = game.player;
    const f = p.flags;
    const st = w.state;
    recordPath(w, p);

    // Coiling Drift: curl up after standing still for a moment.
    st.still = p.moving ? 0 : st.still + dt;
    const coilTarget = f.coilingDrift && st.still > COIL_DELAY ? 1 : 0;
    st.coil += (coilTarget - st.coil) * Math.min(1, dt * 5);

    const lines = tendrilLines(w, game, p.x, p.y);
    // Shed Tendrils: every few seconds the tips break off and stay where they fell.
    if (f.shedTendrils) {
      st.shedTimer -= dt;
      if (st.shedTimer <= 0) {
        st.shedTimer = SHED_EVERY * p.stats.cooldown;
        for (const line of lines) {
          const from = Math.floor(line.length * (1 - SHED_SHARE));
          if (line.length - from >= 3) st.shed.push({ pts: line.slice(from), born: game.time, until: game.time + SHED_TIME * p.stats.duration });
        }
      }
      st.shed = st.shed.filter((s) => s.until > game.time);
    }
    sting(w, game, [...lines, ...st.shed.map((s) => s.pts)]);
    pruneHitTimes(st.nextHit, game.time);
    if (st.stings.size > 400) st.stings.clear();
  },
  draw(w, ctx, game) {
    const p = game.player;
    const st = w.state;
    const width = w.stats.width * p.stats.area;
    for (const s of st.shed) {
      const fade = Math.min(1, (s.until - game.time) / 0.8);
      drawTendril(ctx, s.pts, width, game.time, 0.6 * fade, 0);
    }
    tendrilLines(w, game, p.rx, p.ry).forEach((line, i) => drawTendril(ctx, line, width, game.time, 1, i));
    drawFloat(ctx, p, game.time);
  },
};

/** Remember where you swim, as points SPACING apart. */
function recordPath(w, p) {
  const path = w.state.path;
  const head = path[0];
  if (!head || dist2(head.x, head.y, p.x, p.y) >= SPACING * SPACING) path.unshift({ x: p.x, y: p.y });
  const maxPoints = Math.ceil((w.stats.length * p.stats.duration * 1.2) / SPACING) + 2;
  if (path.length > maxPoints) path.length = maxPoints;
}

/**
 * Each tendril as a list of points, from your back to its tip. They follow your path, side
 * by side, fanning out and swaying toward the tips. (x, y) is where you are (the render
 * position when drawing). With Coiling Drift they blend into a ring around you.
 */
function tendrilLines(w, game, x, y) {
  const p = game.player;
  const st = w.state;
  const n = w.stats.count + p.stats.amount;
  const len = w.stats.length * p.stats.duration;
  const steps = Math.floor(len / SPACING);
  const path = [{ x, y }, ...st.path];
  const time = game.time;
  const ring = COIL_RADIUS * p.stats.area;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const lane = i - (n - 1) / 2;
    const pts = [];
    for (let j = 0; j <= steps && j < path.length; j++) {
      const d = j * SPACING;
      const a = path[Math.min(j + 1, path.length - 1)];
      const b = path[Math.max(j - 1, 0)];
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const t = d / len;
      const side = lane * SPREAD * Math.min(1, d / 30) * (1 + t * 0.6) + Math.sin(time * 2.4 + d * 0.045 + i * 1.9) * 7 * t;
      let px = path[j].x - ty * side;
      let py = path[j].y + tx * side;
      if (st.coil > 0.01) {
        const ang = (i / n) * TAU + time * 0.6 + d / (ring + d * 0.12);
        const r = ring + d * 0.12;
        px += (x + Math.cos(ang) * r - px) * st.coil;
        py += (y + Math.sin(ang) * r - py) * st.coil;
      }
      pts.push({ x: px, y: py });
    }
    lines.push(pts);
  }
  return lines;
}

/** Sting every enemy touching any of `lines` whose sting cooldown is up. */
function sting(w, game, lines) {
  const p = game.player;
  const f = p.flags;
  const st = w.state;
  const width = w.stats.width * p.stats.area;
  const reach = w.stats.length * p.stats.duration + 40;
  const candidates = enemiesWithin(game, p.x, p.y, reach);
  for (const s of st.shed) {
    const mid = s.pts[Math.floor(s.pts.length / 2)];
    for (const e of enemiesWithin(game, mid.x, mid.y, s.pts.length * SPACING)) if (!candidates.includes(e)) candidates.push(e);
  }
  const damage = w.stats.damage * p.stats.might;
  let stung = false;
  for (const e of candidates) {
    if ((st.nextHit.get(e.id) ?? 0) > game.time) continue;
    const touch = (width + e.radius) ** 2;
    if (!lines.some((pts) => pts.some((q) => dist2(q.x, q.y, e.x, e.y) <= touch))) continue;
    st.nextHit.set(e.id, game.time + w.stats.interval / p.stats.attackSpeed);
    game.strike(e, damage, SOURCES.tendril);
    stung = true;
    if (e.dead) continue;
    if (f.numbingSting) e.slow(NUMB, NUMB_TIME * p.stats.duration);
    if (f.entangle) {
      const n = (st.stings.get(e.id) ?? 0) + 1;
      st.stings.set(e.id, n);
      if (n % ENTANGLE_EVERY === 0) e.root(ENTANGLE_TIME * p.stats.duration);
    }
    // Drag Net: stings tug the enemy along the way you swim.
    if (f.dragNet && p.moving) e.knock(DRAG, e.x - p.facingX, e.y - p.facingY);
  }
  if (stung) game.audio.play('sting');
}

// ------------------------------------------------------------------ drawing

function drawTendril(ctx, pts, width, time, alpha, index) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  trace();
  ctx.strokeStyle = 'rgba(150, 170, 255, 0.2)'; // the reach of its sting
  ctx.lineWidth = width * 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30, 20, 70, 0.45)'; // dark edge so the stem shows on light sand
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.strokeStyle = '#c9bbff';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // stinging clusters along the stem, getting smaller toward the tip
  for (let i = 2; i < pts.length; i += 3) {
    const t = i / pts.length;
    const pulse = 0.7 + 0.3 * Math.sin(time * 6 - i * 0.6);
    ctx.fillStyle = NODE_COLORS[(i + index) % NODE_COLORS.length];
    ctx.strokeStyle = 'rgba(30, 20, 70, 0.5)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * pulse;
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, Math.max(1.4, width * 0.6 * (1 - t * 0.6)), 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** The siphonophore's gas float, bobbing at your back. */
function drawFloat(ctx, p, time) {
  const x = p.rx - p.facingX * 15;
  const y = p.ry - p.facingY * 15 - 10 + Math.sin(time * 3) * 1.5;
  ctx.fillStyle = 'rgba(170, 150, 255, 0.45)';
  ctx.strokeStyle = 'rgba(225, 215, 255, 0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 5.5, -0.3, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // its crest
  ctx.strokeStyle = 'rgba(255, 150, 210, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 3);
  ctx.quadraticCurveTo(x, y - 9, x + 5, y - 4);
  ctx.stroke();
}
