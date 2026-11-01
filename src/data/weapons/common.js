import { dist2 } from '../../core/math.js';

/** Helpers several weapons share. */

/** Live enemies touching a circle of `radius` around (x, y), as a new array (safe to keep). */
export function enemiesWithin(game, x, y, radius) {
  return game.enemiesNear(x, y, radius).filter((e) => !e.dead && dist2(x, y, e.x, e.y) <= (radius + e.radius) ** 2);
}

/** Live enemies within `range` of (x, y), nearest first. */
export function nearestEnemies(game, x, y, range) {
  return enemiesWithin(game, x, y, range).sort((a, b) => dist2(x, y, a.x, a.y) - dist2(x, y, b.x, b.y));
}

/**
 * Where the biggest crowd is: of the enemies within `range` of (x, y), the one with the most
 * other enemies within `radius` of it. Returns { x, y, count } or null when nobody is in range.
 * Only the nearest `limit` enemies are compared, to keep it cheap in a big horde.
 */
export function crowdCenter(game, x, y, range, radius, limit = 60) {
  const near = nearestEnemies(game, x, y, range).slice(0, limit);
  let best = null;
  let bestCount = -1;
  const r2 = radius * radius;
  for (const e of near) {
    let count = 0;
    for (const o of near) if (dist2(e.x, e.y, o.x, o.y) <= r2) count++;
    if (count > bestCount) {
      bestCount = count;
      best = e;
    }
  }
  return best ? { x: best.x, y: best.y, count: bestCount } : null;
}

/** Shortest distance from (px, py) to the segment (ax, ay)–(bx, by). */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Smallest difference between two angles, -PI..PI. */
export function angleDiff(a, b) {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/** Weapons with a hit cooldown per enemy (stings, cuts): forget entries that ran out, so the map stays small. */
export function pruneHitTimes(map, now, limit = 300) {
  if (map.size <= limit) return;
  for (const [id, t] of map) if (t <= now) map.delete(id);
}
