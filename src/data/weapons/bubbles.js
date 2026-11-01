import { TAU } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { WEAPON_TALENTS } from '../talents.js';
import { enemiesWithin, nearestEnemies } from './common.js';

const RANGE = 430; // blows bubbles at enemies this close
const CATCH = 2; // a bubble catches every enemy within this many times its own size of where it lands
const BOSS_SLOW = 0.5; // bosses and elites aren't trapped, just slowed this much
const BURST_REACH = 70; // Burst Spray: splash around a popping bubble (× size)
const PRESSURE = 0.25; // Pressure: +25% pop damage per second trapped
const NET_EVERY = 3; // Humpback's Net: every third volley...
const NET_RING = 8; // ...also rings you with this many bubbles (2 more per amount)
const COLOR = '#bfefff';

/**
 * Bubble Net: big slow bubbles that trap what they catch, then pop for damage.
 *   pop damage × might, volley rate × haste, bubble size (and how many it catches) × size,
 *   trap time and bubble range × duration, +1 bubble per volley per amount.
 * Each trapped enemy is an entry in w.state.traps until it pops.
 */
export const bubbles = {
  name: 'Bubble Net',
  icon: 'Bn',
  color: COLOR,
  description: 'Blows big, slow bubbles at enemies. A bubble traps whatever it catches for 2 seconds, then pops for damage. Trapped enemies can’t hurt you. Bosses and elites are only slowed.',
  tags: ['duration', 'amount', 'area'],
  scaling: {
    damage: 'more damage',
    cooldown: 'blows bubbles more often',
    area: 'bigger bubbles that catch more',
    duration: 'traps last longer, bubbles drift further',
    amount: 'one more bubble per volley',
  },
  talents: WEAPON_TALENTS.bubbles,
  levels: [
    { damage: 17, trap: 2.0, cooldown: 1.35, count: 1, radius: 16, speed: 180 },
    { damage: 17, trap: 2.0, cooldown: 1.35, count: 2, radius: 16, speed: 180, text: '+1 bubble' },
    { damage: 22, trap: 2.0, cooldown: 1.35, count: 2, radius: 18, speed: 185, text: '+5 damage, bigger bubbles' },
    { damage: 22, trap: 2.4, cooldown: 1.15, count: 2, radius: 18, speed: 185, text: 'Blows more often, traps last longer' },
    { damage: 29, trap: 2.4, cooldown: 1.15, count: 3, radius: 19, speed: 190, text: '+1 bubble, +7 damage' },
  ],
  create(w) {
    w.state.traps = [];
    w.state.volleys = 0;
  },
  update(w, dt, game) {
    updateTraps(w, game);
    w.timer -= dt;
    if (w.timer > 0) return;
    const p = game.player;
    const st = w.state;
    // Aim at the nearest enemies that aren't already in a bubble.
    const targets = nearestEnemies(game, p.x, p.y, RANGE).filter((e) => !(e.trapUntil > game.time));
    if (targets.length === 0) return;
    w.timer = w.stats.cooldown * p.stats.cooldown;
    st.volleys++;
    const power = game.weaponFired(w);
    const count = w.stats.count + p.stats.amount;
    for (let i = 0; i < count; i++) {
      const t = targets[i % targets.length];
      const spread = i < targets.length ? 0 : ((i % 2 ? 1 : -1) * Math.ceil((i - targets.length + 1) / 2) * 0.3);
      blow(w, game, Math.atan2(t.y - p.y, t.x - p.x) + spread, power);
    }
    // Humpback's Net: every third volley, a ring of bubbles rises around you.
    if (p.flags.humpbackNet && st.volleys % NET_EVERY === 0) {
      const n = NET_RING + 2 * p.stats.amount;
      const offset = game.rng.range(0, TAU);
      for (let i = 0; i < n; i++) blow(w, game, offset + (i / n) * TAU, power, { radius: 0.8, speed: 0.75 });
    }
  },
  draw(w, ctx, game) {
    for (const t of w.state.traps) drawTrap(ctx, t, game.time);
  },
};

function blow(w, game, angle, power, scale = {}) {
  const p = game.player;
  const s = w.stats;
  game.spawnProjectile({
    x: p.x,
    y: p.y,
    angle,
    speed: s.speed * (scale.speed ?? 1),
    damage: s.damage * p.stats.might * power.damage, // what its trap pops for
    pierce: p.flags.netting ? 2 : 0, // Netting: keeps going until it has caught three
    radius: s.radius * p.stats.area * power.size * (scale.radius ?? 1),
    life: 1.7 * p.stats.duration,
    color: power.color ?? COLOR,
    shape: 'bubble',
    kind: 'bubble',
    onHit: (pr, e, g) => catchAround(w, g, pr, e),
  });
  game.audio.play('bubbleShot');
}

/** A bubble reached enemy `hit`: trap it and everything else close enough to where it landed. */
function catchAround(w, game, pr, hit) {
  const reach = pr.radius * CATCH;
  const caught = enemiesWithin(game, pr.x, pr.y, reach);
  if (!caught.includes(hit)) caught.push(hit);
  for (const e of caught) trap(w, game, e, pr.damage);
  game.effects.burst(pr.x, pr.y, '#e6fbff', 4, 70);
}

function trap(w, game, e, damage) {
  if (e.dead || e.trapUntil > game.time) return; // already in a bubble
  const p = game.player;
  const time = w.stats.trap * p.stats.duration;
  if (e.boss || e.elite) e.slow(BOSS_SLOW, time);
  else e.root(time);
  e.trapUntil = game.time + time;
  w.state.traps.push({ enemy: e, start: game.time, until: e.trapUntil, damage, radius: e.radius * 1.45 + 4 });
  game.audio.play('bubbleTrap');
}

/** Pop bubbles whose time is up. A bubble whose enemy died early just bursts. */
function updateTraps(w, game) {
  const st = w.state;
  if (st.traps.length === 0) return;
  const p = game.player;
  const f = p.flags;
  const keep = [];
  for (const t of st.traps) {
    const e = t.enemy;
    if (e.dead) {
      game.effects.burst(e.x, e.y, '#e6fbff', 5, 90);
      continue;
    }
    if (game.time < t.until) {
      keep.push(t);
      continue;
    }
    // Pop!
    let damage = t.damage;
    if (f.pressure) damage *= 1 + PRESSURE * (t.until - t.start);
    e.trapUntil = -1;
    game.strike(e, damage, SOURCES.bubble, 60, e.x, e.y + 10);
    if (f.burstSpray) {
      const reach = BURST_REACH * p.stats.area;
      for (const o of enemiesWithin(game, e.x, e.y, reach)) {
        if (o !== e) game.strike(o, damage * 0.5, SOURCES.bubble, 140, e.x, e.y);
      }
      game.effects.ring(e.x, e.y, reach, '#bfefff');
    }
    game.effects.burst(e.x, e.y, '#e6fbff', 8, 140);
    for (let i = 0; i < 3; i++) game.effects.bubble(e.x + (Math.random() - 0.5) * t.radius, e.y + (Math.random() - 0.5) * t.radius);
    game.audio.play('bubblePop');
  }
  st.traps = keep;
}

/** A bubble around a trapped enemy. It shivers more as it's about to pop. */
function drawTrap(ctx, t, time) {
  const e = t.enemy;
  if (e.dead) return;
  const left = Math.max(0, t.until - time);
  const shiver = left < 0.5 ? Math.sin(time * 50) * (0.5 - left) * 4 : 0;
  const r = t.radius + Math.sin(time * 4 + e.id) * 1.2;
  const x = e.rx;
  const y = e.ry;
  ctx.fillStyle = 'rgba(190, 240, 255, 0.16)';
  ctx.strokeStyle = 'rgba(220, 250, 255, 0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(x, y, r + shiver, r - shiver, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.42, y - r * 0.45, r * 0.22, r * 0.11, -0.7, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.45, y + r * 0.38, r * 0.06, 0, TAU);
  ctx.fill();
}
