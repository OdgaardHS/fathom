import { TAU } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { drawEye, eyeHeatColor as heatColor } from '../../render/sprites.js';
import { WEAPON_TALENTS } from '../talents.js';
import { enemiesWithin } from './common.js';

const MAX_MULT = 6; // at full heat the gaze does 6× its starting damage
const RAMP_SLOW = 5; // seconds of staring to reach full heat with no haste...
const RAMP_FAST = 2; // ...and with HASTE_FOR_FAST haste or more
const HASTE_FOR_FAST = 0.5; // +50% haste: what the Haste passive gives at its top level
const TICK = 0.2; // seconds between burns
const KEEP_RANGE = 1.15; // keeps staring until its target is this much further than its range
const RECHECK = 0.5; // how often it looks for a boss or elite to switch to
const COOL = 1.5; // with nothing to stare at, it cools from full heat in this many seconds
const LINGER = 0.4; // Lingering Gaze: keeps 40% of its heat for the next target (× duration, up to 90%)
const SEARING_TIME = 2; // Searing Death: the burst does 2 seconds' worth of gaze damage...
const SEARING_REACH = 70; // ...to everything this close (× size)
const SPREAD_REACH = 90; // The Eye Opens: enemies this close to the target burn too (× size)...
const SPREAD_SHARE = 0.5; // ...at half the target's damage
const GLARE_SLOW = 0.5; // Glare: bosses (which can't be pinned) are slowed this much instead
const HOVER = 38; // how far above you the eyes float

/**
 * The Watching Eye: an eye floats over your shoulder and stares at the toughest enemy near
 * you. The longer it holds the same target, the hotter its gaze burns, up to 6× damage. Full
 * heat takes 5 seconds, down to 2 seconds with +50% haste. Heat starts over on a new target.
 * Found deeper down: level-ups only offer it from The Open Blue on, and once you've taken it on
 * a dive you can start dives with it.
 *   damage × might, time to full heat × haste, sight range × size, +1 eye per amount
 *   (each eye picks a different target).
 */
export const eye = {
  name: 'The Watching Eye',
  icon: 'Ey',
  color: '#ffb35c',
  description: 'An eye floats over your shoulder and stares at the toughest enemy near you. The longer it holds that stare, the hotter its gaze burns, up to 6× damage after 5 seconds. A boss killer that is slow against swarms.',
  foundFrom: 'openblue',
  foundText: 'Found in The Open Blue and deeper. Take it once on a dive to start dives with it.',
  tags: ['damage', 'cooldown', 'area'],
  scaling: {
    damage: 'more damage',
    cooldown: 'heats up faster (full heat in 2 seconds at +50% haste)',
    area: 'sees further',
    amount: 'one more eye, staring at a different enemy',
  },
  talents: WEAPON_TALENTS.eye,
  levels: [
    { damage: 6, range: 300 },
    { damage: 8, range: 300, text: '+2 damage' },
    { damage: 10, range: 330, text: '+2 damage, sees further' },
    { damage: 13, range: 330, text: '+3 damage' },
    { damage: 16, range: 360, text: '+3 damage, sees further' },
    { damage: 20, range: 360, text: '+4 damage' },
  ],
  create(w) {
    w.state.eyes = [];
    w.state.recheck = 0;
  },
  hud(game) {
    const w = game.player.getWeapon('eye');
    const ramp = rampTime(game.player);
    const hottest = Math.max(0, ...w.state.eyes.filter((e) => e.target).map((e) => e.heat / ramp));
    return hottest > 0 ? `Eye heat ${Math.round(Math.min(1, hottest) * 100)}%` : null;
  },
  /** Pilot Fish: attacks from your other weapons heat the gaze up. */
  onPilot(w, seconds) {
    for (const e of w.state.eyes) if (e.target) e.heat += seconds;
  },
  update(w, dt, game) {
    const p = game.player;
    const st = w.state;
    const n = 1 + p.stats.amount;
    while (st.eyes.length < n) st.eyes.push({ target: null, heat: 0, tick: 0, mult: 1, charged: false, sound: 0, bob: Math.random() * TAU });
    st.eyes.length = n;

    const range = w.stats.range * p.stats.area;
    const ramp = rampTime(p);
    st.recheck -= dt;
    const recheck = st.recheck <= 0;
    if (recheck) st.recheck = RECHECK;

    for (const eye of st.eyes) {
      const t = eye.target;
      if (t && (t.dead || Math.hypot(t.x - p.x, t.y - p.y) > range * KEEP_RANGE)) lookAway(eye, p, ramp);
      // Switch to a boss or elite as soon as one comes in sight.
      if (eye.target && recheck && !eye.target.boss && !eye.target.elite) {
        const big = toughest(game, st.eyes, p, range);
        if (big && (big.boss || big.elite)) lookAway(eye, p, ramp);
      }
      if (!eye.target) {
        const next = toughest(game, st.eyes, p, range);
        if (next) lockOn(w, game, eye, next);
      }
      if (!eye.target) {
        eye.heat = Math.max(0, eye.heat - (ramp / COOL) * dt); // cools off while it has nothing to stare at
        continue;
      }
      eye.heat += dt;
      eye.tick -= dt;
      if (eye.tick <= 0) {
        eye.tick += TICK;
        burn(w, game, eye, Math.min(1, eye.heat / ramp), range);
      }
    }
  },
  draw(w, ctx, game) {
    const p = game.player;
    const ramp = rampTime(p);
    const eyes = w.state.eyes;
    eyes.forEach((eye, i) => {
      const pos = eyePosition(p, i, eyes.length, game.time, eye.bob);
      const heat = Math.min(1, eye.heat / ramp);
      const t = eye.target;
      if (t && !t.dead) drawGaze(ctx, pos.x, pos.y, t, heat, game.time, eye.charged);
      const look = t && !t.dead ? Math.atan2(t.ry - pos.y, t.rx - pos.x) : Math.atan2(p.facingY, p.facingX);
      drawEye(ctx, pos.x, pos.y, 12, look, heat, game.time, i);
    });
  },
};

/** Seconds of staring to reach full heat: 5, falling to 2 as haste climbs to +50%. */
export function rampTime(p) {
  const k = Math.max(0, Math.min(1, (p.bonus?.haste ?? 0) / HASTE_FOR_FAST));
  return RAMP_SLOW - (RAMP_SLOW - RAMP_FAST) * k;
}

/** The toughest enemy in sight that no other eye is staring at: bosses, then elites, then most health. */
function toughest(game, eyes, p, range) {
  const taken = new Set(eyes.map((e) => e.target).filter(Boolean));
  let best = null;
  let bestScore = -1;
  for (const e of enemiesWithin(game, p.x, p.y, range)) {
    if (taken.has(e)) continue;
    const score = (e.boss ? 1e7 : e.elite ? 1e6 : 0) + e.hp;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function lockOn(w, game, eye, target) {
  eye.target = target;
  eye.tick = 0;
  const power = game.weaponFired(w); // a new stare counts as an attack (Conductor Coil, Pilot Fish)
  eye.mult = power.damage;
  eye.charged = power.charged;
}

/** Lose the target. Heat starts over, unless Lingering Gaze keeps some of it. */
function lookAway(eye, p, ramp) {
  eye.target = null;
  const keep = p.flags.lingeringGaze ? Math.min(0.9, LINGER * p.stats.duration) : 0;
  eye.heat = Math.min(eye.heat, ramp) * keep;
  eye.mult = 1;
  eye.charged = false;
}

/** One burn on the eye's target, at heat `heat` (0..1). */
function burn(w, game, eye, heat, range) {
  const p = game.player;
  const f = p.flags;
  const t = eye.target;
  const dps = w.stats.damage * p.stats.might * eye.mult * (1 + (MAX_MULT - 1) * heat);
  const full = heat >= 1;
  if (f.evilEye) t.gazedUntil = game.time + TICK * 1.5;
  // Glare: at full heat the target is held in place.
  if (f.glare && full) {
    if (t.boss) t.slow(GLARE_SLOW, TICK * 1.5);
    else t.root(TICK * 1.5);
  }
  game.strike(t, dps * TICK, SOURCES.eye);
  // The Eye Opens: at full heat the gaze spills onto everything around the target.
  if (f.eyeOpens && full) {
    const reach = SPREAD_REACH * p.stats.area;
    for (const o of enemiesWithin(game, t.x, t.y, reach)) if (o !== t) game.strike(o, dps * TICK * SPREAD_SHARE, SOURCES.eye);
  }
  eye.sound -= TICK;
  if (eye.sound <= 0) {
    eye.sound = 0.5;
    game.audio.play('eyeBurn', { heat });
  }
  if (t.dead) {
    // Searing Death: burned to death at full heat, it bursts into flame.
    if (f.searingDeath && full) game.blast(t.x, t.y, SEARING_REACH * p.stats.area, dps * SEARING_TIME, SOURCES.eye, { color: '#ff7b3a', knockback: 140 });
    lookAway(eye, p, rampTime(p));
  }
}

function eyePosition(p, i, n, time, bob) {
  const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.85;
  return {
    x: p.rx + Math.cos(a) * HOVER + Math.sin(time * 1.3 + bob) * 3,
    y: p.ry + Math.sin(a) * HOVER + Math.cos(time * 1.7 + bob) * 2.5,
  };
}

function drawGaze(ctx, x, y, t, heat, time, charged) {
  const flicker = 0.85 + 0.15 * Math.sin(time * 40);
  const width = 1.2 + 4 * heat;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(t.rx, t.ry);
  ctx.strokeStyle = charged ? `rgba(255, 224, 102, ${0.35 * flicker})` : heatColor(heat, 0.35 * flicker);
  ctx.lineWidth = width * 3;
  ctx.stroke();
  ctx.strokeStyle = heatColor(Math.max(0, heat - 0.3), 0.95);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.lineCap = 'butt';
  // the burning spot on the target
  const r = t.radius * (0.7 + 0.6 * heat) * flicker;
  const g = ctx.createRadialGradient(t.rx, t.ry, 1, t.rx, t.ry, r);
  g.addColorStop(0, heatColor(heat, 0.7));
  g.addColorStop(1, heatColor(heat, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(t.rx, t.ry, r, 0, TAU);
  ctx.fill();
}
