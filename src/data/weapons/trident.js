import { TAU } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { UNDERTOW_RETURN, hasTrinket } from '../trinkets.js';
import { WEAPON_TALENTS } from '../talents.js';
import { angleDiff, enemiesWithin } from './common.js';

const SEEK = 1.7; // looks for crowds out to this many times its reach
const WINDOW = 0.65; // radians either side of a direction that count toward "the horde"
const FAN = 0.3; // radians between thrust lanes
const HALF_WIDTH = 0.36; // half-angle of each thrust's wedge
const GAP = 0.09; // seconds between thrusts
const ANIM = 0.16; // how long one thrust takes to strike out and pull back
const PULL = 230; // Riptide: how hard thrusts drag enemies toward the tip
const LUNGE_TIME = 0.12; // Lunge: a short dash toward the horde...
const LUNGE_SPEED = 380; // ...at this speed
const RIPOSTE_WAIT = 2; // Riposte: at most once every 2 seconds
const WAVE_TIME = 0.28; // Brine Wave: how long the wave takes to roll out
const WHIRL_LANES = 8; // Whirlpool: thrusts in a full circle (2 more per amount)
const WHIRL_GAP = 0.04;
const WHIRL_DAMAGE = 0.7;
const SHAFT = '#c9a46a';
const PRONGS = '#c8f4ee';

/**
 * Riptide Trident: three quick thrusts in a fan, swept across the biggest crowd near you.
 * Hits harder than anything else, but only reaches a short way.
 *   damage × might, attack rate × haste, reach × size, +1 thrust per amount.
 */
export const trident = {
  name: 'Riptide Trident',
  icon: 'Rt',
  color: '#5fd4c4',
  description: 'Sweeps three quick thrusts across the biggest crowd of enemies near you, knocking them back. The hardest hits of any weapon, but the shortest reach.',
  tags: ['damage', 'area', 'cooldown'],
  scaling: {
    damage: 'more damage',
    cooldown: 'attacks more often',
    area: 'longer reach',
    amount: 'one more thrust per attack',
  },
  talents: WEAPON_TALENTS.trident,
  levels: [
    { damage: 16, cooldown: 1.25, thrusts: 3, reach: 92, knockback: 240 },
    { damage: 20, cooldown: 1.25, thrusts: 3, reach: 92, knockback: 240, text: '+4 damage' },
    { damage: 20, cooldown: 1.1, thrusts: 3, reach: 100, knockback: 250, text: 'Longer reach, attacks more often' },
    { damage: 20, cooldown: 1.1, thrusts: 4, reach: 100, knockback: 250, text: '+1 thrust' },
    { damage: 26, cooldown: 1.1, thrusts: 4, reach: 108, knockback: 260, text: '+6 damage, longer reach' },
    { damage: 32, cooldown: 0.95, thrusts: 5, reach: 108, knockback: 260, text: '+6 damage, +1 thrust, attacks more often' },
  ],
  create(w) {
    w.state.queue = []; // thrusts waiting to happen
    w.state.anims = []; // thrusts being drawn
    w.state.waves = []; // Brine Wave
    w.state.side = 1;
  },
  update(w, dt, game) {
    const p = game.player;
    const f = p.flags;
    const st = w.state;
    st.anims = st.anims.filter((a) => game.time - a.start < ANIM);
    runQueue(w, game);
    updateWaves(w, game);
    if (st.lunge > 0) {
      st.lunge -= dt;
      p.x += Math.cos(st.lungeAngle) * LUNGE_SPEED * dt;
      p.y += Math.sin(st.lungeAngle) * LUNGE_SPEED * dt;
    }

    const reach = w.stats.reach * p.stats.area;
    // Riposte: getting hit strikes back at once.
    if (f.riposte && (p.counters.riposteAt ?? -1) > (st.riposteSeen ?? -1)) {
      st.riposteSeen = p.counters.riposteAt;
      if (game.time - (st.lastRiposte ?? -Infinity) >= RIPOSTE_WAIT) {
        const dir = hordeDirection(game, p.x, p.y, reach * SEEK);
        if (dir !== null) {
          st.lastRiposte = game.time;
          attack(w, game, dir, { damage: 2, size: 1, color: '#ff8f8f', charged: false });
        }
      }
    }

    w.timer -= dt;
    if (w.timer > 0 || st.queue.length > 0) return;
    const dir = hordeDirection(game, p.x, p.y, reach * SEEK);
    if (dir === null) return; // nobody close enough to be worth a thrust
    w.timer = w.stats.cooldown * p.stats.cooldown;
    attack(w, game, dir, game.weaponFired(w));
  },
  draw(w, ctx, game) {
    const p = game.player;
    const st = w.state;
    for (const a of st.anims) drawThrust(ctx, p, a, game.time);
    for (const wave of st.waves) {
      const k = (game.time - wave.start) / WAVE_TIME;
      if (k < 0 || k > 1) continue;
      ctx.strokeStyle = `rgba(160, 240, 230, ${0.75 * (1 - k)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.rx, p.ry, wave.from + (wave.to - wave.from) * k, wave.angle - HALF_WIDTH * 1.3, wave.angle + HALF_WIDTH * 1.3);
      ctx.stroke();
    }
  },
};

/**
 * The direction of the biggest crowd within `range`: the angle with the most enemies within
 * WINDOW of it (closer enemies count a little more), averaged over those enemies. Null if empty.
 */
function hordeDirection(game, x, y, range) {
  const near = enemiesWithin(game, x, y, range);
  if (near.length === 0) return null;
  const info = near.map((e) => {
    const d = Math.hypot(e.x - x, e.y - y);
    return { angle: Math.atan2(e.y - y, e.x - x), weight: 1 + (1 - Math.min(1, d / range)) };
  });
  let best = info[0];
  let bestScore = -1;
  for (const a of info) {
    let score = 0;
    for (const b of info) if (Math.abs(angleDiff(a.angle, b.angle)) <= WINDOW) score += b.weight;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  // Average the angles in the winning window, so the sweep is centred on the crowd.
  let sx = 0;
  let sy = 0;
  for (const b of info) {
    if (Math.abs(angleDiff(best.angle, b.angle)) > WINDOW) continue;
    sx += Math.cos(b.angle) * b.weight;
    sy += Math.sin(b.angle) * b.weight;
  }
  return Math.atan2(sy, sx);
}

/** Queue one attack's thrusts toward `dir`, scaled by `power` (Conductor Coil, Riposte). */
function attack(w, game, dir, power) {
  const p = game.player;
  const f = p.flags;
  const st = w.state;
  const n = w.stats.thrusts + p.stats.amount;
  const color = power.color ?? PRONGS;
  let lanes = [];
  let gap = GAP;
  let mult = power.damage;
  if (f.whirlpool) {
    // Whirlpool: a full circle of thrusts, starting toward the horde.
    const m = WHIRL_LANES + 2 * p.stats.amount;
    for (let i = 0; i < m; i++) lanes.push(dir + st.side * (i / m) * TAU);
    gap = WHIRL_GAP;
    mult *= WHIRL_DAMAGE;
  } else {
    // A sweep across the crowd, from one side to the other (alternating each attack).
    for (let i = 0; i < n; i++) lanes.push(dir + st.side * (i - (n - 1) / 2) * FAN);
  }
  st.side = -st.side;
  lanes.forEach((angle, i) => {
    st.queue.push({ at: game.time + i * gap, angle, mult, size: power.size, color, first: i === 0, last: i === lanes.length - 1 });
  });
  // Undertow Stone: the trident sweeps back across the same lanes, weaker.
  if (hasTrinket(w, 'undertowStone')) {
    const back = [...lanes].reverse();
    const start = game.time + lanes.length * gap + 0.06;
    back.forEach((angle, i) => {
      st.queue.push({ at: start + i * gap, angle, mult: mult * UNDERTOW_RETURN, size: power.size, color: '#8fb4ff', back: true });
    });
  }
  // Lunge: dash a short way toward the horde.
  if (f.lunge) {
    st.lunge = LUNGE_TIME;
    st.lungeAngle = dir;
  }
}

function runQueue(w, game) {
  const st = w.state;
  if (st.queue.length === 0) return;
  const keep = [];
  for (const t of st.queue) {
    if (game.time >= t.at) thrust(w, game, t);
    else keep.push(t);
  }
  st.queue = keep;
}

/** One thrust: hit everything in a narrow wedge out to the trident's reach. */
function thrust(w, game, t) {
  const p = game.player;
  const f = p.flags;
  const s = w.stats;
  const reach = s.reach * p.stats.area * t.size;
  const damage = s.damage * p.stats.might * t.mult;
  const tipX = p.x + Math.cos(t.angle) * reach * 0.55;
  const tipY = p.y + Math.sin(t.angle) * reach * 0.55;
  for (const e of enemiesWithin(game, p.x, p.y, reach)) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const off = Math.abs(angleDiff(Math.atan2(e.y - p.y, e.x - p.x), t.angle));
    if (off > HALF_WIDTH + Math.atan2(e.radius, Math.max(1, d))) continue;
    if (f.riptide) {
      // Riptide: drag it toward the tip ("away from" a point past the enemy), bunching the crowd up.
      game.strike(e, damage, SOURCES.trident);
      e.knock(PULL, 2 * e.x - tipX, 2 * e.y - tipY);
    } else {
      game.strike(e, damage, SOURCES.trident, s.knockback, p.x, p.y);
    }
    if (f.impale && t.last) e.root(0.6 * p.stats.duration);
  }
  if (!t.first) game.audio.play('thrust'); // the first one sounded when the attack started
  w.state.anims.push({ start: game.time, angle: t.angle, reach, color: t.color });
  // Brine Wave: the last thrust sends a wave rolling on past the tip.
  if (f.brineWave && t.last) {
    w.state.waves.push({ start: game.time, angle: t.angle, from: reach, to: reach * 2, damage: damage * 0.5, hit: new Set() });
  }
}

/** Brine Wave: an arc rolling out from the trident's reach to twice that, hitting each enemy once. */
function updateWaves(w, game) {
  const st = w.state;
  if (st.waves.length === 0) return;
  const p = game.player;
  const keep = [];
  for (const wave of st.waves) {
    const k = (game.time - wave.start) / WAVE_TIME;
    if (k > 1) continue;
    keep.push(wave);
    const front = wave.from + (wave.to - wave.from) * k;
    for (const e of enemiesWithin(game, p.x, p.y, front)) {
      if (wave.hit.has(e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < wave.from * 0.8) continue;
      if (Math.abs(angleDiff(Math.atan2(e.y - p.y, e.x - p.x), wave.angle)) > HALF_WIDTH * 1.3) continue;
      wave.hit.add(e);
      game.strike(e, wave.damage, SOURCES.trident, 200, p.x, p.y);
    }
  }
  st.waves = keep;
}

/** A trident striking out along `a.angle` and pulling back, with a pale swoosh of the wedge it hits. */
function drawThrust(ctx, p, a, time) {
  const k = (time - a.start) / ANIM;
  if (k < 0 || k > 1) return;
  const out = Math.sin(k * Math.PI); // 0 → 1 → 0
  const x = p.rx;
  const y = p.ry;

  // the wedge it sweeps through
  ctx.fillStyle = `rgba(200, 255, 245, ${0.16 * (1 - k)})`;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, a.reach, a.angle - HALF_WIDTH, a.angle + HALF_WIDTH);
  ctx.closePath();
  ctx.fill();

  const len = a.reach * (0.45 + 0.55 * out);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a.angle);
  ctx.lineCap = 'round';
  // shaft
  ctx.strokeStyle = 'rgba(10, 30, 40, 0.6)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(len * 0.25, 0);
  ctx.lineTo(len - 10, 0);
  ctx.stroke();
  ctx.strokeStyle = SHAFT;
  ctx.lineWidth = 3;
  ctx.stroke();
  // three prongs
  ctx.strokeStyle = a.color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(len - 12, -7);
  ctx.lineTo(len - 12, 7);
  ctx.moveTo(len - 12, -7);
  ctx.lineTo(len - 1, -7);
  ctx.moveTo(len - 12, 0);
  ctx.lineTo(len + 4, 0);
  ctx.moveTo(len - 12, 7);
  ctx.lineTo(len - 1, 7);
  ctx.stroke();
  ctx.fillStyle = a.color;
  for (const [px, py, size] of [[len - 1, -7, 3], [len + 4, 0, 3.6], [len - 1, 7, 3]]) {
    ctx.beginPath();
    ctx.moveTo(px + size, py);
    ctx.lineTo(px - 1, py - size * 0.8);
    ctx.lineTo(px - 1, py + size * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.lineCap = 'butt';
}
