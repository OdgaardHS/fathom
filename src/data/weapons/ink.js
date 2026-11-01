import { TAU, dist2 } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { WEAPON_TALENTS } from '../talents.js';
import { enemiesWithin } from './common.js';

const TICK = 0.5; // seconds between hits on everything inside a cloud
const SLOW = 0.6; // enemies inside move at 60% speed
const GROW_TIME = 0.25; // a fresh cloud billows out to full size this fast
const BEHIND = 34; // how far behind you a squirt lands (plus the cloud's own size)
const JET_TIME = 0.18; // Jet Squirt: how long each push forward lasts...
const JET_SPEED = 300; // ...and how fast it carries you
const HUNT_REACH = 260; // Hunting Ink: clouds drift toward enemies this close
const HUNT_SPEED = 38;
const BOMB_TICKS = 3; // Ink Bomb: a fading cloud bursts for this many ticks of damage
const TRAIL_STEP = 42; // Kraken's Wake: a cloud every this many units you swim (× haste)
const TRAIL_SIZE = 0.7; // Kraken's Wake: trail clouds are smaller

/**
 * Ink Sac: squirts clouds of ink behind you. Clouds hang in the water, hurting and slowing
 * anything inside, so swimming away lays ink across the path of whatever chases you.
 *   damage × might, cloud size × size, cloud life × duration, squirt rate × haste,
 *   +1 cloud per squirt per amount.
 */
export const ink = {
  name: 'Ink Sac',
  icon: 'Ik',
  color: '#9b7ae0',
  description: 'Squirts a cloud of squid ink behind you. Clouds hang in the water for a few seconds, hurting and slowing anything inside, so whatever chases you has to swim through them.',
  tags: ['duration', 'area', 'cooldown'],
  scaling: {
    damage: 'more damage',
    cooldown: 'squirts more often',
    area: 'bigger clouds',
    duration: 'clouds last longer',
    amount: 'one more cloud per squirt',
  },
  talents: WEAPON_TALENTS.ink,
  layer: 'under',
  levels: [
    { damage: 4, radius: 48, life: 4.0, cooldown: 1.6, count: 1 },
    { damage: 4, radius: 54, life: 4.0, cooldown: 1.6, count: 1, text: 'Bigger clouds' },
    { damage: 6, radius: 54, life: 4.0, cooldown: 1.4, count: 1, text: '+2 damage, squirts more often' },
    { damage: 6, radius: 54, life: 4.0, cooldown: 1.4, count: 2, text: '+1 cloud per squirt' },
    { damage: 8, radius: 60, life: 4.5, cooldown: 1.3, count: 2, text: '+2 damage, bigger clouds that last longer' },
  ],
  create(w) {
    w.state.clouds = [];
  },
  update(w, dt, game) {
    const p = game.player;
    const st = w.state;
    if (p.flags.krakenWake) wakeTrail(w, game);
    else squirtWhenReady(w, dt, game);

    // Jet Squirt: a short push forward after each squirt.
    if (st.jet > 0) {
      st.jet -= dt;
      p.x += p.facingX * JET_SPEED * dt;
      p.y += p.facingY * JET_SPEED * dt;
    }
    updateClouds(w, dt, game);
  },
  draw(w, ctx, game) {
    for (const c of w.state.clouds) drawCloud(ctx, c, game.time);
  },
};

function squirtWhenReady(w, dt, game) {
  w.timer -= dt;
  if (w.timer > 0) return;
  const p = game.player;
  if (!game.nearestEnemy(p.x, p.y, 700)) return; // nothing around: keep the ink
  w.timer = w.stats.cooldown * p.stats.cooldown;
  const power = game.weaponFired(w);
  const s = w.stats;
  const count = s.count + p.stats.amount;
  // A bigger cloud grows in area, not radius: "double size" doubles the area it covers.
  const radius = s.radius * p.stats.area * Math.sqrt(power.size);
  const back = Math.atan2(-p.facingY, -p.facingX);
  const sideX = -Math.sin(back);
  const sideY = Math.cos(back);
  for (let i = 0; i < count; i++) {
    const k = i - (count - 1) / 2;
    const dist = BEHIND + radius * 0.6 - Math.abs(k) * radius * 0.3; // outer clouds sit a little closer
    const x = p.x + Math.cos(back) * dist + sideX * k * radius * 1.15;
    const y = p.y + Math.sin(back) * dist + sideY * k * radius * 1.15;
    addCloud(w, game, x, y, radius, s.damage * p.stats.might * power.damage, power.charged);
  }
  if (p.flags.jetSquirt) w.state.jet = JET_TIME;
}

/** Kraken's Wake: ink pours out as you swim, a cloud every few steps instead of squirts. */
function wakeTrail(w, game) {
  const p = game.player;
  const st = w.state;
  if (st.lastX === undefined) {
    st.lastX = p.x;
    st.lastY = p.y;
    st.swum = 0;
  }
  st.swum += Math.hypot(p.x - st.lastX, p.y - st.lastY);
  st.lastX = p.x;
  st.lastY = p.y;
  const step = TRAIL_STEP * p.stats.cooldown;
  if (st.swum < step) return;
  st.swum = 0;
  const power = game.weaponFired(w);
  const s = w.stats;
  const count = 1 + p.stats.amount; // amount widens the trail
  const radius = s.radius * TRAIL_SIZE * p.stats.area * Math.sqrt(power.size);
  const sideX = -p.facingY;
  const sideY = p.facingX;
  for (let i = 0; i < count; i++) {
    const k = i - (count - 1) / 2;
    const x = p.x - p.facingX * 18 + sideX * k * radius * 1.2;
    const y = p.y - p.facingY * 18 + sideY * k * radius * 1.2;
    addCloud(w, game, x, y, radius, s.damage * p.stats.might * power.damage, power.charged);
  }
}

function addCloud(w, game, x, y, radius, damage, charged) {
  const life = w.stats.life * game.player.stats.duration;
  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + Math.random() * 0.8;
    const d = i === 0 ? 0 : 0.35 + Math.random() * 0.25;
    puffs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, s: i === 0 ? 0.75 : 0.5 + Math.random() * 0.2, spin: Math.random() * TAU });
  }
  w.state.clouds.push({ x, y, radius, damage, charged, born: game.time, until: game.time + life, tick: TICK * 0.5, puffs });
  for (let i = 0; i < 6; i++) game.effects.bubble(x + (Math.random() - 0.5) * radius, y + (Math.random() - 0.5) * radius, 1.5);
}

/** How big a cloud is right now: it billows out when squirted. */
const cloudRadius = (c, time) => c.radius * (0.4 + 0.6 * Math.min(1, (time - c.born) / GROW_TIME));

function updateClouds(w, dt, game) {
  const p = game.player;
  const f = p.flags;
  const keep = [];
  for (const c of w.state.clouds) {
    const r = cloudRadius(c, game.time);
    const inside = enemiesWithin(game, c.x, c.y, r * 0.9);

    if (game.time >= c.until) {
      // Ink Bomb: the cloud bursts as it fades.
      if (f.inkBomb) {
        for (const e of inside) game.strike(e, c.damage * BOMB_TICKS, SOURCES.inkcloud, 120, c.x, c.y);
        game.effects.ring(c.x, c.y, r, '#9b7ae0');
        game.effects.burst(c.x, c.y, '#5b3a8f', 10, 150);
      }
      continue;
    }
    keep.push(c);

    for (const e of inside) {
      e.slow(SLOW, 0.25);
      if (f.murkyWater) e.inkedUntil = game.time + 0.25;
    }
    c.tick -= dt;
    if (c.tick <= 0) {
      c.tick += TICK;
      for (const e of inside) game.strike(e, c.damage, SOURCES.inkcloud);
    }

    // Smokescreen: enemy shots dissolve in the ink.
    if (f.smokescreen) {
      for (const shot of game.enemyShots) {
        if (shot.dead || dist2(c.x, c.y, shot.x, shot.y) > r * r) continue;
        shot.dead = true;
        game.effects.burst(shot.x, shot.y, '#5b3a8f', 4, 60);
      }
    }

    // Hunting Ink: clouds creep toward the nearest enemy.
    if (f.huntingInk) {
      const target = game.nearestEnemy(c.x, c.y, HUNT_REACH);
      if (target) {
        const d = Math.hypot(target.x - c.x, target.y - c.y) || 1;
        if (d > 8) {
          c.x += ((target.x - c.x) / d) * HUNT_SPEED * dt;
          c.y += ((target.y - c.y) / d) * HUNT_SPEED * dt;
        }
      }
    }
  }
  w.state.clouds = keep;
}

function drawCloud(ctx, c, time) {
  const r = cloudRadius(c, time);
  const left = c.until - time;
  const fade = Math.min(1, left / 0.6, (time - c.born) / 0.1);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  for (const puff of c.puffs) {
    const sway = Math.sin(time * 0.9 + puff.spin) * 0.06;
    const x = c.x + (puff.dx + sway) * r;
    const y = c.y + (puff.dy - sway) * r;
    const pr = r * puff.s;
    const g = ctx.createRadialGradient(x, y, pr * 0.1, x, y, pr);
    g.addColorStop(0, 'rgba(20, 8, 34, 0.78)');
    g.addColorStop(0.6, 'rgba(38, 18, 66, 0.5)');
    g.addColorStop(1, 'rgba(60, 30, 100, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, TAU);
    ctx.fill();
  }
  // a faint rim so the edge of the cloud reads on dark water
  ctx.strokeStyle = c.charged ? 'rgba(255, 224, 102, 0.45)' : 'rgba(155, 122, 224, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 7]);
  ctx.lineDashOffset = -time * 8;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 0.9, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
