/**
 * Enemy archetypes.
 *   hp        base health (the spawner scales it up the longer you survive)
 *   speed     world units per second
 *   damage    contact damage to the player
 *   xp        value of the pearl it drops
 *   behavior  name of a movement function in src/entities/behaviors.js
 *   sprite    name of a drawing function in src/render/sprites.js
 *   color     used for hit particles
 *   palette   colors the sprite uses
 * Any other fields are read by the behavior (see puffer, barracuda, matriarch).
 */
export const ENEMY_TYPES = {
  // ------------------------------------------------------------- Sunlit Shallows
  snapper: {
    name: 'Snapper',
    hp: 5,
    speed: 92,
    damage: 5,
    radius: 10,
    xp: 1,
    behavior: 'school',
    sprite: 'fish',
    color: '#ffcf3f',
    palette: { body: '#ffcf3f', fin: '#f2a03d', stripe: '#2f6f9f', eye: '#e9f2ef' },
  },
  crab: {
    name: 'Reef Crab',
    hp: 16,
    speed: 56,
    damage: 9,
    radius: 14,
    xp: 2,
    behavior: 'scuttle',
    sprite: 'crab',
    color: '#e8603c',
    palette: { shell: '#e8603c', claw: '#c9452a', leg: '#b23d26', spot: '#f39a6b' },
  },
  jelly: {
    name: 'Jellyfish',
    hp: 10,
    speed: 72,
    damage: 7,
    radius: 13,
    xp: 2,
    behavior: 'drift',
    sprite: 'jelly',
    knockbackResist: 0.3,
    color: '#f49ac1',
    palette: {
      bell: 'rgba(246, 160, 205, 0.8)',
      inner: 'rgba(255, 220, 240, 0.9)',
      tentacle: 'rgba(250, 190, 225, 0.7)',
      glow: 'rgba(255, 170, 220, 0.16)',
    },
  },
  puffer: {
    name: 'Pufferfish',
    hp: 22,
    speed: 54,
    damage: 8,
    radius: 13,
    xp: 3,
    behavior: 'puffer',
    sprite: 'puffer',
    color: '#e9c46a',
    palette: { body: '#e9c46a', belly: '#f6e3a8', spot: '#8a6a2a', spike: '#fff3c4', fin: '#d9a441' },
    fireRange: 170, // starts inflating when this close
    inflateTime: 0.8, // warning time before the spines fly
    spines: 10,
    spineSpeed: 210,
    spineDamage: 7,
    cooldown: 3.5,
  },
  barracuda: {
    name: 'Barracuda',
    hp: 20,
    speed: 60,
    damage: 12,
    radius: 12,
    xp: 3,
    behavior: 'charge',
    sprite: 'barracuda',
    color: '#b9c7d3',
    palette: { body: '#b9c7d3', back: '#5d7385', fin: '#8aa0b2', eye: '#f2f6f8' },
    dashRange: 280, // starts a lunge when this close
    windup: 0.55, // telegraph time before lunging
    dashSpeed: 420,
    dashTime: 0.45,
    dashCooldown: 2.5,
  },
  brood: {
    name: 'Brood Crab',
    hp: 8,
    speed: 82,
    damage: 6,
    radius: 9,
    xp: 1,
    behavior: 'scuttle',
    sprite: 'crab',
    color: '#e4ddd0',
    palette: { shell: '#e4ddd0', claw: '#cfc6b5', leg: '#b8ae9c', spot: '#f3efe6' },
  },
  matriarch: {
    name: 'The Bleached Matriarch',
    hp: 2200,
    speed: 62,
    damage: 28,
    radius: 46,
    xp: 50,
    behavior: 'matriarch',
    sprite: 'matriarch',
    knockbackResist: 1,
    boss: true, // shows a health bar
    color: '#e8e2d6',
    palette: {
      shell: '#e8e2d6',
      claw: '#d6cfc0',
      leg: '#bdb4a2',
      spot: '#f6f2ea',
      coral: ['#ff8fa3', '#ffa94d', '#c77dff'],
      carving: 'rgba(70, 60, 50, 0.6)',
    },
    slam: { radius: 64, delay: 1.0, damage: 22 }, // telegraphed claw slams
    broodCount: 5, // small crabs per summon
  },
};

// The Open Blue enemies live in their own block below, merged into ENEMY_TYPES.
Object.assign(ENEMY_TYPES, {
  // --------------------------------------------------------------- The Open Blue
  mackerel: {
    name: 'Mackerel',
    hp: 6,
    speed: 108,
    damage: 7,
    radius: 10,
    xp: 1,
    behavior: 'school',
    sprite: 'fish',
    color: '#9ec3dd',
    palette: { body: '#9ec3dd', fin: '#5f8fb3', stripe: '#24476b', eye: '#e9f2ef' },
  },
  moonJelly: {
    name: 'Moon Jelly',
    hp: 16,
    speed: 66,
    damage: 9,
    radius: 15,
    xp: 3,
    behavior: 'drift',
    sprite: 'jelly',
    knockbackResist: 0.3,
    color: '#bcd7ff',
    palette: {
      bell: 'rgba(190, 215, 255, 0.72)',
      inner: 'rgba(235, 200, 255, 0.95)',
      tentacle: 'rgba(200, 225, 255, 0.6)',
      glow: 'rgba(160, 200, 255, 0.2)',
    },
  },
  glassSquid: {
    name: 'Glass Squid',
    hp: 18,
    speed: 72,
    damage: 8,
    radius: 12,
    xp: 3,
    behavior: 'kite',
    sprite: 'squid',
    color: '#c9e8ff',
    palette: { body: 'rgba(205, 235, 255, 0.6)', organs: '#ff9ecf', eye: '#16222e', ink: '#24163a' },
    keepAway: 230, // tries to stay this far from you
    fireRange: 330,
    inkSpeed: 150,
    inkDamage: 7,
    cooldown: 3.5,
  },
  sailfish: {
    name: 'Sailfish',
    hp: 26,
    speed: 72,
    damage: 12,
    radius: 13,
    xp: 4,
    behavior: 'charge',
    sprite: 'sailfish',
    color: '#4f7fb8',
    palette: { body: '#3f6fa8', sail: '#22457f', spots: '#8fd0ff', eye: '#f2f6f8' },
    dashRange: 320,
    windup: 0.5,
    dashSpeed: 520,
    dashTime: 0.45,
    dashCooldown: 2.2,
  },
  blueShark: {
    name: 'Blue Shark',
    hp: 45,
    speed: 92,
    damage: 13,
    radius: 17,
    xp: 6,
    behavior: 'stalk',
    sprite: 'shark',
    knockbackResist: 0.4,
    color: '#3d6ea8',
    palette: { body: '#3d6ea8', fin: '#2c5688', eye: '#0d1a26' },
    circleRadius: 170, // circles you at this distance...
    circleTime: 3.5, // ...for this long, then strikes
    windup: 0.45,
    dashSpeed: 420,
    dashTime: 0.55,
  },
  omen: {
    name: 'The Omen',
    hp: 2600,
    speed: 85,
    damage: 26,
    radius: 30,
    xp: 60,
    behavior: 'serpent',
    sprite: 'oarfish',
    knockbackResist: 1,
    boss: true,
    color: '#d7dde4',
    palette: { body: '#d7dde4', crest: '#e5484d', spots: '#8a98a8', eye: '#f4f1d0', carving: 'rgba(60, 70, 85, 0.6)' },
    segments: 22, // its long body; every part of it hurts to touch
    spacing: 16,
    windup: 0.8, // before a lunge
    dashSpeed: 460,
    dashTime: 0.7,
    schoolSize: 10, // mackerel it calls in
  },
});

/** Elite versions of any enemy: bigger, hit harder, worth more, and drop a chest. */
export const ELITE = { size: 1.4, damage: 1.5, xp: 5 };

/** Largest possible enemy radius. Spatial queries are padded by this. */
export const MAX_ENEMY_RADIUS = Math.max(
  ...Object.values(ENEMY_TYPES).map((t) => (t.boss ? t.radius : t.radius * ELITE.size)),
);
