/**
 * The dives, from shallow to deep. Each depth is its own run: survive until the
 * depth's final boss appears, kill it, and the depth below unlocks.
 *
 *   theme     visual style, see src/render/themes/
 *   enemyHp   extra enemy health multiplier for this depth
 *   timeline  from `at` seconds onward, enemies spawn at `rate` per second, picked
 *             from `pool` by weight. After the last entry the rate keeps climbing.
 *   events    scripted moments, in time order:
 *               ring  - a circle of enemies closing in on the player
 *               swarm - a tight pack arriving from one side
 *               boss  - one big enemy. `elite: true` promotes a normal enemy
 *                       (elites drop a chest with a trinket in it);
 *                       `final: true` means killing it clears the depth
 *               omen  - a hint of what waits below (drawn by the theme)
 *               message - just shows `message`
 *   current   optional { speed, angle, period }: open water pushes you and the
 *             pearls around; the direction slowly swings back and forth
 *
 * A depth without a `timeline` shows on the depth map but isn't playable yet.
 */
export const LEVELS = [
  {
    id: 'shallows',
    name: 'Sunlit Shallows',
    depth: '0–200 m',
    blurb: 'Bright sand and coral. Something about it is slightly off.',
    theme: 'shallows',
    enemyHp: 1,
    timeline: [
      { at: 0, rate: 1.6, pool: { snapper: 1 } },
      { at: 25, rate: 2.0, pool: { snapper: 3, crab: 1 } },
      { at: 60, rate: 2.4, pool: { snapper: 3, crab: 2, jelly: 1 } },
      { at: 110, rate: 2.6, pool: { snapper: 2, crab: 2, jelly: 2, puffer: 1 } },
      { at: 170, rate: 2.9, pool: { snapper: 3, crab: 2, jelly: 1, puffer: 1, barracuda: 1 } },
      { at: 240, rate: 3.2, pool: { snapper: 2, crab: 3, jelly: 2, puffer: 2, barracuda: 2 } },
      { at: 300, rate: 3.5, pool: { snapper: 3, crab: 3, jelly: 2, puffer: 2, barracuda: 2 } },
      // Ease off a little once the boss is up, so the fight is about the boss.
      { at: 360, rate: 2.2, pool: { snapper: 3, crab: 2, jelly: 1 } },
    ],
    events: [
      { at: 45, type: 'swarm', enemy: 'snapper', count: 24, message: 'A school turns toward you' },
      { at: 100, type: 'ring', enemy: 'jelly', count: 20, message: 'Jellyfish bloom' },
      { at: 130, type: 'boss', enemy: 'puffer', elite: true, hpMult: 10, message: 'A bloated elite pufferfish drifts closer' },
      { at: 200, type: 'boss', enemy: 'crab', elite: true, hpMult: 15, message: 'An elite crab emerges' },
      { at: 270, type: 'ring', enemy: 'snapper', count: 36, message: 'Surrounded!' },
      { at: 330, type: 'swarm', enemy: 'barracuda', count: 8, message: 'Barracuda hunt in packs' },
      { at: 360, type: 'boss', enemy: 'matriarch', final: true, message: 'The Bleached Matriarch rises' },
    ],
  },
  {
    id: 'kelp',
    name: 'Kelp Twilight',
    depth: '200–600 m',
    blurb: 'Dim kelp forests hide stones far too old to be here.',
  },
  {
    id: 'openblue',
    name: 'The Open Blue',
    depth: '600–1,000 m',
    blurb: 'No seabed, no walls. Only blue in every direction, and something far below.',
    theme: 'openblue',
    enemyHp: 1,
    current: { speed: 28, angle: 0.4, period: 70 },
    timeline: [
      { at: 0, rate: 1.7, pool: { mackerel: 3, moonJelly: 1 } },
      { at: 30, rate: 2.2, pool: { mackerel: 3, moonJelly: 1, glassSquid: 1 } },
      { at: 75, rate: 2.6, pool: { mackerel: 3, moonJelly: 2, glassSquid: 1, sailfish: 1 } },
      { at: 130, rate: 2.8, pool: { mackerel: 3, moonJelly: 2, glassSquid: 1.5, sailfish: 1, blueShark: 0.5 } },
      { at: 200, rate: 3.1, pool: { mackerel: 3, moonJelly: 2, glassSquid: 2, sailfish: 2, blueShark: 1 } },
      { at: 280, rate: 3.4, pool: { mackerel: 4, moonJelly: 2, glassSquid: 2, sailfish: 2, blueShark: 1.5 } },
      // Ease off once the boss is up, so the fight is about the boss.
      { at: 360, rate: 2.4, pool: { mackerel: 3, moonJelly: 1, glassSquid: 1 } },
    ],
    events: [
      { at: 3, type: 'message', message: 'No seabed below. Only blue.' },
      { at: 50, type: 'swarm', enemy: 'mackerel', count: 24, message: 'A bait ball scatters toward you' },
      { at: 100, type: 'omen', omen: 'leviathan' },
      { at: 130, type: 'boss', enemy: 'glassSquid', elite: true, hpMult: 10, message: 'An elite glass squid flickers into view' },
      { at: 160, type: 'ring', enemy: 'moonJelly', count: 22, message: 'Moon jellies rise around you' },
      { at: 220, type: 'boss', enemy: 'blueShark', elite: true, hpMult: 6, message: 'An elite shark circles' },
      { at: 255, type: 'omen', omen: 'leviathanClose' },
      { at: 300, type: 'swarm', enemy: 'sailfish', count: 6, message: 'Sailfish hunt in a pack' },
      { at: 360, type: 'boss', enemy: 'omen', final: true, message: 'The Omen rises from below' },
    ],
  },
  {
    id: 'midnight',
    name: 'Midnight Zone',
    depth: '1,000–4,000 m',
    blurb: 'No sunlight reaches this far down. Something here does not need it.',
  },
  {
    id: 'wrecks',
    name: 'The Wreck Fields',
    depth: '4,000–6,000 m',
    blurb: 'Sunken ships. Not all of their crews left.',
  },
  {
    id: 'trench',
    name: 'Hadal Trench',
    depth: '6,000–11,000 m',
    blurb: 'Down here, the water has a heartbeat.',
  },
  {
    id: 'hollow',
    name: '???',
    depth: 'Below the sea floor',
    blurb: 'There should be nothing below the sea floor.',
  },
];

export const isPlayable = (level) => Array.isArray(level.timeline);

/** When the depth's final boss appears, in seconds (or null). */
export function bossTime(level) {
  const final = level.events?.find((e) => e.final);
  return final ? final.at : null;
}
