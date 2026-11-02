/**
 * Passive items: the diver's own stats (health, speed, armor, regeneration, pickup range), offered
 * to every hero on normal level-ups, 4 at most. (Nothing raises pearl value: more XP from the same
 * pearls snowballs too easily.) What makes weapons better is
 * weapon augments instead, each for one weapon (data/augments.js).
 *
 * `apply(b, level)` adds to the player's stat buckets (see Player.recalcStats).
 * Bonuses to the same stat add together; different stats multiply. Hero talents
 * read the same buckets, which is how passives and talents feed into each other.
 *
 * `text` says only what it does ("+1 amount"), not what that affects: the card shows the
 * icons of the weapons you carry that use the stat (each weapon's `scaling` in weapons.js).
 *
 * `tags` name the stat, for those icons and for the talent system (which talents it pairs with).
 */
export const PASSIVES = {
  vitality: {
    name: 'Vitality',
    icon: 'Vi',
    color: '#ff8fab',
    maxLevel: 5,
    text: '+20 max health',
    tags: ['health'],
    apply: (b, l) => {
      b.maxHp += 20 * l;
    },
  },
  swiftness: {
    name: 'Swiftness',
    icon: 'Sw',
    color: '#63e6be',
    maxLevel: 5,
    text: '+8% move speed',
    tags: ['speed'],
    apply: (b, l) => {
      b.speed += 0.08 * l;
    },
  },
  attractor: {
    name: 'Attractor',
    icon: 'At',
    color: '#4dabf7',
    maxLevel: 5,
    text: '+30% pickup range',
    tags: ['magnet'],
    apply: (b, l) => {
      b.magnet += 0.3 * l;
    },
  },
  recovery: {
    name: 'Recovery',
    icon: 'Rc',
    color: '#a9e34b',
    maxLevel: 5,
    text: '+0.25 health regenerated per second',
    tags: ['regen'],
    apply: (b, l) => {
      b.regen += 0.25 * l;
    },
  },
  armor: {
    name: 'Armor',
    icon: 'Ar',
    color: '#adb5bd',
    maxLevel: 5,
    text: 'Take 1 less damage from every hit',
    tags: ['armor'],
    apply: (b, l) => {
      b.armor += l;
    },
  },
};
