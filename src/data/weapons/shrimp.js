import { TAU } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { UNDERTOW_RETURN } from '../trinkets.js';
import { WEAPON_TALENTS } from '../talents.js';
import { distToSegment, enemiesWithin, nearestEnemies } from './common.js';

const RANGE = 420; // snaps at enemies this close
const KNOCKBACK = 220;
const FAN = 0.22; // radians between bubbles when it fires more than one
const BOOM_WIDTH = 18; // Sonic Boom: how wide the shock along the bubble's path is (× size)
const BOOM_SHARE = 0.3; // Sonic Boom: damage along the path, compared to the blast
const BIG_CATCH = 5; // Big Catch: a blast that catches this many enemies...
const CATCH_REFUND = 0.5; // ...brings the next snap this share of a cooldown closer
const STUN_TIME = 0.5; // Stunning Snap: pin time (× duration)
const STUN_BONUS = 1.3; // Stunning Snap: pinned enemies take this much more from blasts
const BOIL_TIME = 1.5; // Boiling Water: how long the spot boils (× duration)
const BOIL_SHARE = 0.2; // Boiling Water: damage per second, compared to the blast
const LANCE_SHARE = 0.4; // Cavitation Lance: the small blasts along the way, compared to a full blast
const LANCE_SIZE = 0.5;
const IMPLODE_DELAY = 0.25; // Undertow Stone: the blast collapses back in this much later
const SPLIT_DELAY = 0.12; // Split Coral: the smaller blasts land this much later...
const SPLIT_REACH = 150; // ...on the nearest enemies this close to the blast
const SPLIT_SIZE = 0.55;
const COLOR = '#e8fbff'; // the cavitation bubble
const FLASH = '#ffbe6e'; // its blast: collapsing bubbles flash with light (sonoluminescence)

/**
 * Pistol Shrimp Claw: a slow, loud snap that fires a cavitation bubble at the nearest enemy.
 * It bursts where it stops, in a blast that throws everything back.
 *   blast damage × might, snap rate × haste, blast size × size, bubble range × duration,
 *   +1 bubble per amount.
 * Its bubbles carry `selfTrinkets`: Undertow Stone and Split Coral change the blast itself.
 */
export const shrimp = {
  name: 'Pistol Shrimp Claw',
  icon: 'Ps',
  color: '#ff8a70',
  description: 'A slow, deafening snap that fires a cavitation bubble at the nearest enemy. It bursts where it stops, blasting everything around it back.',
  tags: ['damage', 'area', 'cooldown'],
  scaling: {
    damage: 'more damage',
    cooldown: 'snaps more often',
    area: 'bigger blasts',
    duration: 'bubbles fly further',
    amount: 'one more bubble per snap',
  },
  talents: WEAPON_TALENTS.shrimp,
  levels: [
    { damage: 26, blast: 58, cooldown: 1.9, count: 1, speed: 640 },
    { damage: 32, blast: 58, cooldown: 1.9, count: 1, speed: 640, text: '+6 damage' },
    { damage: 32, blast: 66, cooldown: 1.7, count: 1, speed: 660, text: 'Bigger blasts, snaps more often' },
    { damage: 32, blast: 66, cooldown: 1.7, count: 2, speed: 660, text: '+1 bubble' },
    { damage: 42, blast: 72, cooldown: 1.7, count: 2, speed: 680, text: '+10 damage, bigger blasts' },
    { damage: 52, blast: 72, cooldown: 1.45, count: 2, speed: 680, text: '+10 damage, snaps more often' },
  ],
  create(w) {
    w.state.pending = []; // blasts that go off a moment later (Undertow Stone, Split Coral)
    w.state.boils = []; // Boiling Water
  },
  update(w, dt, game) {
    runPending(w, game);
    updateBoils(w, dt, game);
    w.timer -= dt;
    if (w.timer > 0) return;
    const p = game.player;
    const target = game.nearestEnemy(p.x, p.y, RANGE);
    if (!target) return;
    const s = w.stats;
    w.timer = s.cooldown * p.stats.cooldown;
    const power = game.weaponFired(w);
    const count = s.count + p.stats.amount;
    const aim = Math.atan2(target.y - p.y, target.x - p.x);
    for (let i = 0; i < count; i++) fire(w, game, aim + (i - (count - 1) / 2) * FAN, power);
  },
  drawUnder(w, ctx, game) {
    for (const b of w.state.boils) drawBoil(ctx, b, game.time);
  },
};

function fire(w, game, angle, power) {
  const p = game.player;
  const s = w.stats;
  const lance = p.flags.cavitationLance;
  const ox = p.x;
  const oy = p.y;
  const damage = s.damage * p.stats.might * power.damage;
  const size = Math.sqrt(power.size); // "double size" doubles the blast's area
  const color = power.color ?? FLASH;
  game.spawnProjectile({
    x: ox,
    y: oy,
    angle,
    speed: s.speed,
    damage,
    pierce: lance ? 999 : 0, // Cavitation Lance: flies to the end of its range
    radius: 7 * p.stats.area,
    life: 0.65 * p.stats.duration,
    color: power.color ?? COLOR,
    shape: 'cavitation',
    kind: 'snap',
    selfTrinkets: true,
    // The bubble itself doesn't hurt; its blast does. With Cavitation Lance, small blasts on the way.
    onHit: (pr, e, g) => {
      if (lance) burst(w, g, e.x, e.y, damage * LANCE_SHARE, size * LANCE_SIZE, color, { child: true });
    },
    onEnd: (pr) => burst(w, game, pr.x, pr.y, damage, size, color, { originX: ox, originY: oy }),
  });
}

/**
 * A blast at (x, y). `child` blasts (Split Coral pieces, Cavitation Lance pops) don't
 * set off their own Undertow or Split Coral follow-ups.
 */
function burst(w, game, x, y, damage, size, color, { child = false, implode = false, originX, originY } = {}) {
  const p = game.player;
  const f = p.flags;
  const s = w.stats;
  const st = w.state;
  const radius = s.blast * p.stats.area * size;
  const amount = (e) => damage * (f.stunningSnap && e.rooted > 0 ? STUN_BONUS : 1);
  const hit = game.blast(x, y, radius, amount, SOURCES.snap, {
    knockback: implode ? 200 : KNOCKBACK,
    pull: implode,
    color: implode ? '#8fb4ff' : color,
  });
  if (f.stunningSnap) for (const e of hit) e.root(STUN_TIME * p.stats.duration);
  for (let i = 0; i < 4; i++) game.effects.bubble(x + (Math.random() - 0.5) * radius, y + (Math.random() - 0.5) * radius);
  game.audio.play('snapBurst', { small: child });
  if (implode || child) return;

  // Big Catch: a crowded blast brings the next snap closer.
  if (f.bigCatch && hit.length >= BIG_CATCH) w.timer -= s.cooldown * p.stats.cooldown * CATCH_REFUND;
  // Boiling Water: the spot keeps boiling for a moment.
  if (f.boilingWater) {
    st.boils.push({ x, y, radius, until: game.time + BOIL_TIME * p.stats.duration, tick: 0.5, damage: damage * BOIL_SHARE * 0.5, born: game.time });
  }
  // Sonic Boom: the shock also tears along the bubble's path.
  if (f.sonicBoom && originX !== undefined) sonicBoom(game, originX, originY, x, y, damage * BOOM_SHARE, BOOM_WIDTH * p.stats.area, hit);
  // Undertow Stone: the blast collapses back in, pulling enemies with it.
  if (w.trinket === 'undertowStone') {
    st.pending.push({ at: game.time + IMPLODE_DELAY, x, y, damage: damage * UNDERTOW_RETURN, size, color, implode: true });
  }
  // Split Coral: three smaller blasts land on the nearest enemies around it.
  if (w.trinket === 'splitCoral') {
    const near = nearestEnemies(game, x, y, SPLIT_REACH).filter((e) => !hit.includes(e));
    for (let i = 0; i < 3; i++) {
      const t = near[i];
      const a = (i / 3) * TAU + game.rng.range(0, 1);
      st.pending.push({
        at: game.time + SPLIT_DELAY * (1 + i * 0.5),
        x: t ? t.x : x + Math.cos(a) * radius * 1.2,
        y: t ? t.y : y + Math.sin(a) * radius * 1.2,
        damage: damage * 0.5,
        size: size * SPLIT_SIZE,
        color: '#ff9fae',
        child: true,
      });
    }
  }
}

function sonicBoom(game, ax, ay, bx, by, damage, width, already) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const half = Math.hypot(bx - ax, by - ay) / 2;
  for (const e of enemiesWithin(game, mx, my, half + width)) {
    if (already.includes(e) || distToSegment(e.x, e.y, ax, ay, bx, by) > width + e.radius) continue;
    game.strike(e, damage, SOURCES.snap, 80, ax, ay);
  }
  game.effects.beam(ax, ay, bx, by, 'rgba(232, 251, 255, 0.6)', 1);
}

function runPending(w, game) {
  const st = w.state;
  if (st.pending.length === 0) return;
  const keep = [];
  for (const b of st.pending) {
    if (game.time >= b.at) burst(w, game, b.x, b.y, b.damage, b.size, b.color, { child: b.child, implode: b.implode });
    else keep.push(b);
  }
  st.pending = keep;
}

/** Boiling Water: hurts everything in the spot twice a second. */
function updateBoils(w, dt, game) {
  const st = w.state;
  if (st.boils.length === 0) return;
  st.boils = st.boils.filter((b) => b.until > game.time);
  for (const b of st.boils) {
    b.tick -= dt;
    if (b.tick > 0) continue;
    b.tick += 0.5;
    for (const e of enemiesWithin(game, b.x, b.y, b.radius)) game.strike(e, b.damage, SOURCES.snap);
    game.effects.bubble(b.x + (Math.random() - 0.5) * b.radius, b.y + (Math.random() - 0.5) * b.radius, 2.5);
  }
}

function drawBoil(ctx, b, time) {
  const left = b.until - time;
  const fade = Math.min(1, left / 0.4, (time - b.born) / 0.15);
  const g = ctx.createRadialGradient(b.x, b.y, b.radius * 0.1, b.x, b.y, b.radius);
  g.addColorStop(0, `rgba(255, 200, 150, ${0.3 * fade})`);
  g.addColorStop(1, 'rgba(255, 140, 100, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius, 0, TAU);
  ctx.fill();
  // heat shimmer: a wobbling ring
  ctx.strokeStyle = `rgba(255, 220, 190, ${0.35 * fade})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const r = b.radius * (0.82 + 0.06 * Math.sin(a * 5 + time * 9));
    const x = b.x + Math.cos(a) * r;
    const y = b.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
