/**
 * Passive items, offered to every hero on normal level-ups.
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
  might: {
    name: 'Might',
    icon: 'Mi',
    color: '#ff6b6b',
    maxLevel: 5,
    text: '+10% damage',
    tags: ['damage'],
    apply: (b, l) => {
      b.might += 0.1 * l;
    },
  },
  haste: {
    name: 'Haste',
    icon: 'Ha',
    color: '#ffd166',
    maxLevel: 5,
    text: '+10% haste',
    tags: ['cooldown'],
    apply: (b, l) => {
      b.haste += 0.1 * l;
    },
  },
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
  reach: {
    name: 'Reach',
    icon: 'Re',
    color: '#9775fa',
    maxLevel: 5,
    text: '+10% size',
    tags: ['area'],
    apply: (b, l) => {
      b.area += 0.1 * l;
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
  duplicator: {
    name: 'Duplicator',
    icon: 'Du',
    color: '#e599f7',
    maxLevel: 2,
    text: '+1 amount',
    tags: ['amount'],
    apply: (b, l) => {
      b.amount += l;
    },
  },
  persistence: {
    name: 'Persistence',
    icon: 'Pe',
    color: '#74c0fc',
    maxLevel: 5,
    text: '+12% duration',
    tags: ['duration'],
    apply: (b, l) => {
      b.duration += 0.12 * l;
    },
  },
  overdrive: {
    name: 'Overdrive',
    icon: 'Ov',
    color: '#ff922b',
    maxLevel: 5,
    text: '+10% attack speed',
    tags: ['attackSpeed'],
    apply: (b, l) => {
      b.attackSpeed += 0.1 * l;
    },
  },
  insight: {
    name: 'Insight',
    icon: 'In',
    color: '#c0eb75',
    maxLevel: 5,
    text: '+8% pearl value',
    tags: ['growth'],
    apply: (b, l) => {
      b.growth += 0.08 * l;
    },
  },
};
