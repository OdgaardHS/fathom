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

  defaultHero: 'otto',
  defaultWeapon: 'harpoon',
  // Every weapon can be picked at the start for now. Later, set this to false and
  // add ids to progress.unlockedWeapons as players find weapons during dives.
  unlockAllWeapons: true,
  slots: { weapons: 4, passives: 4 },
  levelUpChoices: 3,

  // Between dives: characters and weapons level up from pearls, 1 talent point per level
  // (see systems/progression.js). XP needed to go from `level` to `level + 1`. A cleared depth
  // is worth about 3,000 XP: the first character level comes from even a short dive, the full
  // character tree takes about 8 cleared dives, and a weapon earns about one point per dive you
  // carry it through.
  progression: {
    characterXp: (level) => 600 + 300 * (level - 1),
    weaponXp: (level) => 2000 + 1000 * (level - 1),
  },

  /** XP needed to go from `level` to `level + 1`. */
  xpToNext: (level) => Math.floor(5 + 4 * Math.pow(level - 1, 1.2)),

  enemies: {
    max: 450, // regular spawning pauses at this many live enemies
    spawnMargin: 60, // spawn this far outside the visible area
    // Enemy toughness: every enemy but a depth's final boss has `hpBase` times its listed health,
    // and everyone gains `hpScalePerMinute` more per minute survived (+20%).
    hpBase: 1.8,
    hpScalePerMinute: 0.2,
    // Most enemies arrive in packs: every `packEvery` seconds (a random time in that range) a
    // school of one kind swims in from one side, `packShare` of the spawn rate. The rest trickle in.
    packShare: 0.6,
    packEvery: [5, 8],
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
