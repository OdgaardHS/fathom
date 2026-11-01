/**
 * Central tuning knobs. Most balancing starts here.
 * Content (weapons, enemies, waves, passives) lives in src/data/.
 */
export const CONFIG = {
  title: 'Fathom', // working title

  // The simulation runs at a fixed rate so gameplay doesn't depend on the monitor's refresh rate.
  tickRate: 60,
  // Longest frame we'll simulate in one go (stops a long stall from freezing the game).
  maxFrameTime: 0.25,

  // The camera zooms so at least this much of the world (in world units) is always visible.
  view: { minWidth: 960, minHeight: 600 },

  player: {
    radius: 14,
    maxHp: 100,
    moveSpeed: 160, // world units per second
    magnet: 70, // pearls (XP) inside this radius fly to the player
    invulnTime: 0.4, // seconds of invulnerability after taking a hit
  },

  defaultHero: 'mara',
  defaultWeapon: 'harpoon',
  // Every weapon can be picked at the start for now. Later, set this to false and
  // add ids to progress.unlockedWeapons as players find weapons during dives.
  unlockAllWeapons: true,
  slots: { weapons: 4, passives: 4 },
  levelUpChoices: 3,

  talents: {
    every: 5, // every 5th level is a talent pick instead of a normal one
    tierLevels: { 1: 5, 2: 10, 3: 20 }, // first level each talent tier can be offered
    rerollsPerDive: 1,
  },

  /** XP needed to go from `level` to `level + 1`. */
  xpToNext: (level) => Math.floor(5 + 4 * Math.pow(level - 1, 1.2)),

  enemies: {
    max: 450, // regular spawning pauses at this many live enemies
    spawnMargin: 60, // spawn this far outside the visible area
    hpScalePerMinute: 0.15, // +15% enemy HP per minute survived
    separation: 0.5, // 0..1, how hard overlapping enemies push apart
  },

  pickups: {
    maxGems: 350, // past this, new XP merges into pearls already on the ground
    healChance: 0.012,
    healAmount: 25,
    magnetChance: 0.004,
  },

  effects: {
    maxParticles: 500,
    maxTexts: 120,
    damageNumbers: true,
    screenShake: true,
  },
};
