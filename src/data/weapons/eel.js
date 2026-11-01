import { dist2 } from '../../core/math.js';
import { SOURCES } from '../../entities/projectile.js';
import { WEAPON_TALENTS } from '../talents.js';

const RANGE = 330; // zaps only when an enemy is this close
const FALLOFF = 0.85; // each jump keeps 85% of the damage
const BUILDING = 1.1; // Building Charge: each jump hits 10% harder instead
const STORM_FALLOFF = 0.8; // Living Storm: jumps past the normal ones lose 20% each
const STORM_MAX = 30; // Living Storm: safety limit on extra jumps
const STORE_MAX = 6; // Stored Charge: most unused jumps saved for the next zap
const COLOR = '#a5f3ff';
const BOLT = '#38b6ff'; // the arcs: a deeper blue than the icon, so they show up on light sand
const CHARGED = '#ffd23a';

/**
 * Eel Lance: zaps the nearest enemy, and the shock arcs on from enemy to enemy.
 *   damage × might, zap rate × haste, arc reach × size, +1 jump per amount.
 */
export const eel = {
  name: 'Eel Lance',
  icon: 'El',
  color: COLOR,
  description: 'Zaps the nearest enemy with an electric shock that arcs on to 2 more enemies close by, a little weaker with every jump. The denser the crowd, the better it gets.',
  tags: ['amount', 'area', 'cooldown'],
  scaling: {
    damage: 'more damage',
    cooldown: 'zaps more often',
    area: 'arcs jump further',
    amount: 'arcs jump to one more enemy',
  },
  talents: WEAPON_TALENTS.eel,
  range: RANGE,
  levels: [
    { damage: 10, cooldown: 1.1, jumps: 2, reach: 115 },
    { damage: 10, cooldown: 1.1, jumps: 3, reach: 115, text: '+1 jump' },
    { damage: 13, cooldown: 1.0, jumps: 3, reach: 125, text: '+3 damage, zaps faster, arcs jump further' },
    { damage: 13, cooldown: 0.9, jumps: 4, reach: 125, text: '+1 jump, zaps faster' },
    { damage: 17, cooldown: 0.85, jumps: 5, reach: 135, text: '+4 damage, +1 jump, arcs jump further' },
    { damage: 22, cooldown: 0.75, jumps: 6, reach: 145, text: '+5 damage, +1 jump, zaps faster' },
  ],
  update(w, dt, game) {
    w.timer -= dt;
    if (w.timer > 0) return;
    const p = game.player;
    const first = game.nearestEnemy(p.x, p.y, RANGE);
    if (!first) return; // hold the charge until something is in range
    w.timer = w.stats.cooldown * p.stats.cooldown;
    zap(w, game, first, game.weaponFired(w));
  },
};

/** One zap: strike `first`, then arc from enemy to enemy. */
function zap(w, game, first, power) {
  const s = w.stats;
  const p = game.player;
  const f = p.flags;
  const st = w.state;
  const reach = s.reach * p.stats.area * power.size;
  const color = power.charged ? CHARGED : BOLT;
  const width = power.charged ? 3 : 2;

  let jumps = s.jumps + p.stats.amount;
  if (f.storedCharge) jumps += st.stored ?? 0; // Stored Charge: jumps saved from earlier zaps
  const extra = f.livingStorm ? STORM_MAX : 0;
  const baseDamage = s.damage * p.stats.might * power.damage;

  const hitCount = new Map();
  let damage = baseDamage;
  let fromX = p.x;
  let fromY = p.y;
  let current = first;
  let prev = null;
  let last = null;
  let used = -1; // jumps used (the first strike isn't a jump)
  for (let i = 0; current && i <= jumps + extra; i++) {
    used++;
    game.effects.lightning(fromX, fromY, current.x, current.y, color, width);
    hitCount.set(current, (hitCount.get(current) ?? 0) + 1);
    game.strike(current, damage, SOURCES.eel, 40, fromX, fromY);
    last = current;
    fromX = current.x;
    fromY = current.y;
    const past = i >= jumps; // Living Storm: past the normal jumps
    damage *= past ? STORM_FALLOFF : f.buildingCharge ? BUILDING : FALLOFF;
    if (past && damage < baseDamage * 0.1) break;
    prev = current;
    current = nextTarget(game, fromX, fromY, reach, hitCount, prev, f.groundLoop);
  }

  // Stunning Arc: the last enemy the zap reached is pinned.
  if (f.stunningArc && last) last.root(0.6 * p.stats.duration);
  // Stored Charge: jumps nobody was in reach for are saved for next time.
  if (f.storedCharge) st.stored = Math.min(STORE_MAX, Math.max(0, jumps - used));
}

/**
 * The next enemy an arc jumps to: the nearest one within `reach` it hasn't hit yet. With
 * Ground Loop it can go back to one it hit once (never the one it's leaving), preferring new ones.
 */
function nextTarget(game, x, y, reach, hitCount, prev, loop) {
  const maxHits = loop ? 2 : 1;
  let best = null;
  let bestScore = Infinity;
  for (const e of game.enemiesNear(x, y, reach)) {
    if (e.dead || e === prev) continue;
    const hits = hitCount.get(e) ?? 0;
    if (hits >= maxHits) continue;
    const d2 = dist2(x, y, e.x, e.y);
    if (d2 > (reach + e.radius) ** 2) continue;
    const score = d2 + hits * 1e7; // anything new beats anything already hit
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
