export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Frame-rate independent smoothing toward `target`. Higher `sharpness` = snappier. */
export const damp = (current, target, sharpness, dt) => lerp(current, target, 1 - Math.exp(-sharpness * dt));

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/**
 * Seeded random number generator (mulberry32).
 * Use this for ALL gameplay randomness so a run can be replayed from its seed.
 * (Purely visual randomness, like particles, can use Math.random.)
 */
export function createRng(seed) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Pick one entry from a list of objects that each have a `weight`. */
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e.weight;
      let roll = next() * total;
      for (const e of entries) {
        roll -= e.weight;
        if (roll < 0) return e;
      }
      return entries[entries.length - 1];
    },
  };
}
