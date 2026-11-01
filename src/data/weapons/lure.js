import { TAU, dist2 } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { WEAPON_TALENTS } from '../talents.js';
import { enemiesWithin, nearestEnemies } from './common.js';

const CAST_RANGE = 300; // casts at crowds this close
const MIN_CAST = 110; // never closer than this, so it doesn't pull enemies onto you
const CAST_TIME = 0.3; // seconds the lure flies before it starts to glow
const PULL_SPEED = 95; // how fast enemies are drawn in (bosses 25%, elites 50%)
const JAW_TIME = 0.4; // how long the bite animation lasts
const SECOND_BITE = 0.3; // Second Bite: the jaws snap again this much later, at half damage
const HUNGER_STEP = 0.1; // Deep Hunger: +10% per kill...
const HUNGER_MAX = 1; // ...up to +100%
const SWALLOW = 0.3; // Swallow Whole: regular enemies below 30% health are eaten outright
const SHOT_PULL = 3.2; // Bright Lure: how fast enemy shots turn toward a lure (radians per second)
const HUNT_SPEED = 70; // Lantern Hunt: how fast a lure swims after the crowd
const GLOW = '#d8ff8a';

/**
 * Anglerfish Lure: casts a glowing lure near the biggest crowd. It draws enemies in while it
 * glows, then a huge pair of jaws snaps shut on it.
 *   bite damage × might, cast rate × haste, pull reach and bite size × size,
 *   glow time × duration, +1 lure per amount.
 */
export const lure = {
  name: 'Anglerfish Lure',
  icon: 'Al',
  color: GLOW,
  description: 'Casts a glowing lure near the biggest crowd. While it glows it draws enemies in, then huge jaws snap shut on it for one big bite. Herds enemies into a clump for your other weapons.',
  tags: ['area', 'damage', 'duration'],
  scaling: {
    damage: 'more damage',
    cooldown: 'casts more often',
    area: 'pulls from further, bigger bite',
    duration: 'glows longer before it bites, gathering more',
    amount: 'one more lure per cast',
  },
  talents: WEAPON_TALENTS.lure,
  levels: [
    { damage: 34, pull: 140, bite: 46, life: 2.0, cooldown: 3.0, count: 1 },
    { damage: 40, pull: 155, bite: 46, life: 2.0, cooldown: 3.0, count: 1, text: '+6 damage, pulls from further' },
    { damage: 40, pull: 155, bite: 46, life: 2.3, cooldown: 2.6, count: 1, text: 'Casts more often, glows longer' },
    { damage: 40, pull: 155, bite: 46, life: 2.3, cooldown: 2.6, count: 2, text: '+1 lure' },
    { damage: 50, pull: 170, bite: 52, life: 2.3, cooldown: 2.6, count: 2, text: '+10 damage, bigger bite, pulls from further' },
    { damage: 62, pull: 170, bite: 52, life: 2.3, cooldown: 2.2, count: 2, text: '+12 damage, casts more often' },
  ],
  create(w) {
    w.state.lures = [];
    w.state.hunger = 0;
  },
  update(w, dt, game) {
    updateLures(w, dt, game);
    w.timer -= dt;
    if (w.timer > 0) return;
    const p = game.player;
    const s = w.stats;
    const spots = pickSpots(game, s.count + p.stats.amount, s.pull * p.stats.area);
    if (spots.length === 0) return;
    w.timer = s.cooldown * p.stats.cooldown;
    const power = game.weaponFired(w);
    for (const spot of spots) cast(w, game, spot, power);
  },
  draw(w, ctx, game) {
    for (const l of w.state.lures) drawLure(ctx, l, game);
  },
};

/** Where to cast: the biggest crowds in range, one per lure, each away from the others. */
function pickSpots(game, count, pullR) {
  const p = game.player;
  const near = nearestEnemies(game, p.x, p.y, CAST_RANGE).slice(0, 60);
  const spots = [];
  const r2 = (pullR * 0.6) ** 2;
  for (let n = 0; n < count; n++) {
    const free = near.filter((e) => spots.every((s) => dist2(s.x, s.y, e.x, e.y) > pullR * pullR));
    let best = null;
    let bestCount = 0;
    for (const e of free) {
      let c = 0;
      for (const o of free) if (dist2(e.x, e.y, o.x, o.y) <= r2) c++;
      if (c > bestCount) {
        bestCount = c;
        best = e;
      }
    }
    if (!best) break;
    // Keep it a safe distance away from you.
    let x = best.x;
    let y = best.y;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < MIN_CAST) {
      const a = d > 1 ? Math.atan2(y - p.y, x - p.x) : Math.atan2(p.facingY, p.facingX);
      x = p.x + Math.cos(a) * MIN_CAST;
      y = p.y + Math.sin(a) * MIN_CAST;
    }
    spots.push({ x, y });
  }
  return spots;
}

function cast(w, game, spot, power) {
  const p = game.player;
  const s = w.stats;
  const now = game.time;
  const glow = s.life * p.stats.duration;
  w.state.lures.push({
    x: p.x,
    y: p.y,
    fromX: p.x,
    fromY: p.y,
    toX: spot.x,
    toY: spot.y,
    castAt: now,
    landAt: now + CAST_TIME,
    biteAt: now + CAST_TIME + glow,
    bites: p.flags.secondBite ? 2 : 1, // bites still to come
    damage: s.damage * p.stats.might * power.damage,
    pullR: s.pull * p.stats.area * power.size,
    biteR: s.bite * p.stats.area * Math.sqrt(power.size),
    charged: power.charged,
    jawAt: [], // when each bite happened (for the animation)
    huntTimer: 0,
  });
}

function updateLures(w, dt, game) {
  const st = w.state;
  if (st.lures.length === 0) return;
  const f = game.player.flags;
  const keep = [];
  for (const l of st.lures) {
    const now = game.time;
    if (now < l.landAt) {
      // flying out on its line
      const k = (now - l.castAt) / CAST_TIME;
      l.x = l.fromX + (l.toX - l.fromX) * k;
      l.y = l.fromY + (l.toY - l.fromY) * k;
      keep.push(l);
      continue;
    }
    if (l.bites > 0) {
      if (now < l.biteAt) {
        if (f.lanternHunt) hunt(l, dt, game);
        pull(l, dt, game);
        if (f.brightLure) drawShots(l, dt, game);
      } else {
        bite(w, game, l, l.jawAt.length === 0 ? 1 : 0.5);
        l.bites--;
        l.biteAt = now + SECOND_BITE;
      }
      keep.push(l);
    } else if (now - l.jawAt[l.jawAt.length - 1] < JAW_TIME) {
      keep.push(l); // still drawing the last bite
    }
  }
  st.lures = keep;
}

/** Draw enemies in toward the lure. Big ones resist. */
function pull(l, dt, game) {
  const stop = l.biteR * 0.35;
  for (const e of enemiesWithin(game, l.x, l.y, l.pullR)) {
    const dx = l.x - e.x;
    const dy = l.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= stop) continue;
    const resist = e.boss ? 0.25 : e.elite ? 0.5 : 1 - (e.knockbackResist ?? 0) * 0.5;
    const step = Math.min(PULL_SPEED * resist * dt, d - stop);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
  }
}

/** Lantern Hunt: the lure swims after the nearest crowd while it glows. */
function hunt(l, dt, game) {
  l.huntTimer -= dt;
  if (l.huntTimer <= 0) {
    l.huntTimer = 0.4;
    const near = nearestEnemies(game, l.x, l.y, l.pullR * 1.6);
    l.huntX = near.length ? near.reduce((s, e) => s + e.x, 0) / near.length : l.x;
    l.huntY = near.length ? near.reduce((s, e) => s + e.y, 0) / near.length : l.y;
  }
  const dx = l.huntX - l.x;
  const dy = l.huntY - l.y;
  const d = Math.hypot(dx, dy);
  if (d > 4) {
    const step = Math.min(HUNT_SPEED * dt, d);
    l.x += (dx / d) * step;
    l.y += (dy / d) * step;
  }
}

/** Bright Lure: enemy shots nearby curve toward the glow and are swallowed by it. */
function drawShots(l, dt, game) {
  const reach2 = (l.pullR * 1.3) ** 2;
  for (const s of game.enemyShots) {
    if (s.dead) continue;
    const d2 = dist2(s.x, s.y, l.x, l.y);
    if (d2 > reach2) continue;
    if (d2 < 16 * 16) {
      s.dead = true;
      game.effects.burst(s.x, s.y, GLOW, 3, 60);
      continue;
    }
    const want = Math.atan2(l.y - s.y, l.x - s.x);
    let diff = want - s.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.angle += Math.max(-SHOT_PULL * dt, Math.min(SHOT_PULL * dt, diff));
    s.vx = Math.cos(s.angle) * s.speed;
    s.vy = Math.sin(s.angle) * s.speed;
  }
}

function bite(w, game, l, share) {
  const p = game.player;
  const f = p.flags;
  const st = w.state;
  l.jawAt.push(game.time);
  const damage = l.damage * share * (1 + (f.deepHunger ? st.hunger : 0));
  let kills = 0;
  for (const e of enemiesWithin(game, l.x, l.y, l.biteR)) {
    // Swallow Whole: weak regular enemies are eaten outright.
    if (f.swallowWhole && !e.boss && !e.elite && e.hp < e.maxHp * SWALLOW) {
      game.killEnemy(e, SOURCES.lure);
      kills++;
      continue;
    }
    game.strike(e, damage, SOURCES.lure, 90, l.x, l.y);
    if (e.dead) kills++;
  }
  // Deep Hunger: kills feed the next bite; a bite that kills nothing goes hungry again.
  if (f.deepHunger) st.hunger = kills > 0 ? Math.min(HUNGER_MAX, st.hunger + HUNGER_STEP * kills) : 0;
  game.effects.burst(l.x, l.y, '#ffffff', 6, 120);
  game.camera.shake(2, 0.1);
  game.audio.play('chomp');
}

// ------------------------------------------------------------------ drawing

function drawLure(ctx, l, game) {
  const p = game.player;
  const now = game.time;
  const glowing = now >= l.landAt && l.bites > 0;

  // the line back to you, sagging a little
  if (l.bites > 0) {
    const mx = (p.rx + l.x) / 2;
    const my = (p.ry + l.y) / 2 + 24;
    ctx.strokeStyle = 'rgba(225, 235, 205, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.rx, p.ry - 6);
    ctx.quadraticCurveTo(mx, my, l.x, l.y);
    ctx.stroke();
  }

  if (glowing) {
    // the reach of the pull, faintly
    ctx.strokeStyle = 'rgba(216, 255, 138, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 9]);
    ctx.lineDashOffset = now * 20; // dashes crawl inward
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.pullR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (l.bites > 0) {
    // the glowing bulb
    const pulse = 0.75 + 0.25 * Math.sin(now * 9);
    const halo = (glowing ? 26 : 14) * pulse;
    const g = ctx.createRadialGradient(l.x, l.y, 1, l.x, l.y, halo);
    g.addColorStop(0, l.charged ? 'rgba(255, 224, 102, 0.9)' : 'rgba(216, 255, 138, 0.9)');
    g.addColorStop(1, 'rgba(216, 255, 138, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, halo, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f6ffd8';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 4.5, 0, TAU);
    ctx.fill();
  }

  for (const at of l.jawAt) {
    const k = (now - at) / JAW_TIME;
    if (k >= 0 && k <= 1) drawJaws(ctx, l.x, l.y, l.biteR, k);
  }
}

/** A huge anglerfish mouth that gapes open and snaps shut. k: 0 → 1 over the bite. */
function drawJaws(ctx, x, y, r, k) {
  const open = k < 0.35 ? 1 : Math.max(0, 1 - (k - 0.35) / 0.12); // gape, then snap
  const alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
  const size = r * (0.85 + 0.25 * Math.min(1, k / 0.35));
  const gap = size * 0.55 * open;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  for (const side of [-1, 1]) {
    const edge = side * gap * 0.5;
    // jaw
    ctx.beginPath();
    ctx.moveTo(-size, edge);
    ctx.quadraticCurveTo(0, edge + side * size * 1.15, size, edge);
    ctx.quadraticCurveTo(0, edge + side * size * 0.25, -size, edge);
    ctx.fillStyle = '#1b2230';
    ctx.fill();
    ctx.strokeStyle = '#46546b';
    ctx.lineWidth = 2;
    ctx.stroke();
    // teeth along the inner edge
    ctx.fillStyle = '#efeadb';
    const teeth = 7;
    for (let i = 0; i < teeth; i++) {
      const t = (i + 0.5) / teeth;
      const tx = -size + t * size * 2;
      const curve = Math.sin(t * Math.PI) * side * size * 0.12;
      const len = size * (0.18 + 0.12 * Math.sin(t * Math.PI));
      ctx.beginPath();
      ctx.moveTo(tx - size * 0.07, edge + curve);
      ctx.lineTo(tx + size * 0.07, edge + curve);
      ctx.lineTo(tx, edge + curve - side * len);
      ctx.closePath();
      ctx.fill();
    }
  }
  // a pale eye on the upper jaw
  ctx.fillStyle = 'rgba(230, 240, 200, 0.85)';
  ctx.beginPath();
  ctx.arc(size * 0.45, -gap * 0.5 - size * 0.42, size * 0.09, 0, TAU);
  ctx.fill();
  ctx.restore();
}
