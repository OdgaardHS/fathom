import { WEAPONS } from './weapons.js';

/**
 * Weapon augments: level-up cards that make one weapon better. The card names the weapon, and a
 * weapon can take any number of them. They come in rarities: common, uncommon and rare ones each
 * boost one stat (a little, more, a lot). Only the exotic one does more than that: it changes a
 * different axis entirely (one more harpoon per volley, one more jump for the Eel Lance's arcs...),
 * or for a weapon without one, boosts all its stats.
 *
 * Augments only boost stats the weapon actually uses (its `scaling` in weapons.js). They add to the
 * same stat buckets as everything else, but only for that weapon (see Weapon.boosted).
 */

/** The stats an augment can boost, keyed like a weapon's `scaling`, with the bucket each adds to. */
export const AUGMENT_STATS = {
  damage: { name: 'Might', icon: 'might', bucket: 'might', text: 'damage' },
  cooldown: { name: 'Haste', icon: 'haste', bucket: 'haste', text: 'haste' },
  area: { name: 'Reach', icon: 'reach', bucket: 'area', text: 'size' },
  duration: { name: 'Persistence', icon: 'persistence', bucket: 'duration', text: 'duration' },
  attackSpeed: { name: 'Overdrive', icon: 'overdrive', bucket: 'attackSpeed', text: 'attack speed' },
};

/**
 * `weight`: how often a weapon's augment card is of this rarity (out of 100).
 * `value`: the boost to the stat it names (the exotic one adds 1 amount instead).
 */
export const RARITIES = {
  common: { name: 'Common', color: '#d9c58f', weight: 55, value: 0.05 },
  uncommon: { name: 'Uncommon', color: '#7ad98f', weight: 28, value: 0.1 },
  rare: { name: 'Rare', color: '#6cb6ff', weight: 13, value: 0.15 },
  exotic: { name: 'Exotic', color: '#d58cff', weight: 4, value: 0.12 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'exotic'];

/** How likely augment cards for one carried weapon are, all rarities together (a weapon level-up card is 1). */
export const AUGMENT_WEIGHT = 0.9;

const percent = (v) => `+${Math.round(v * 100)}%`;

/**
 * Every augment weapon `weaponId` could get, each with its share of AUGMENT_WEIGHT:
 * { key, rarity, boosts: { stat: amount }, name, icon, text, weight }.
 */
export function augmentsFor(weaponId) {
  const scaling = WEAPONS[weaponId]?.scaling ?? {};
  const stats = Object.keys(AUGMENT_STATS).filter((k) => scaling[k]);
  const tiers = {
    // one stat, a little
    common: stats.map((k) => single(k, 'common')),
    // one stat, more
    uncommon: stats.map((k) => single(k, 'uncommon')),
    // one stat, a lot
    rare: stats.map((k) => single(k, 'rare')),
    // another axis: one more of whatever the weapon makes more of; a weapon without one gets all
    // of its stats boosted instead
    exotic: [scaling.amount ? plusOne(scaling.amount) : overhaul(stats)],
  };
  const list = [];
  for (const rarity of RARITY_ORDER) {
    const options = tiers[rarity].filter(Boolean);
    for (const o of options) list.push({ ...o, rarity, weight: (AUGMENT_WEIGHT * RARITIES[rarity].weight) / 100 / options.length });
  }
  return list;
}

function single(stat, rarity) {
  const s = AUGMENT_STATS[stat];
  const v = RARITIES[rarity].value;
  return { key: `${stat}.${rarity}`, boosts: { [stat]: v }, name: s.name, icon: s.icon, text: `${percent(v)} ${s.text}` };
}

function plusOne(how) {
  return { key: 'amount.exotic', boosts: { amount: 1 }, name: 'Plus One', icon: 'duplicator', text: `+1 amount: ${how}` };
}

function overhaul(stats) {
  if (!stats.length) return null;
  const v = RARITIES.exotic.value;
  return {
    key: 'all.exotic',
    boosts: Object.fromEntries(stats.map((k) => [k, v])),
    name: 'Overhaul',
    icon: 'reach',
    text: `${percent(v)} ${stats.map((k) => AUGMENT_STATS[k].text).join(', ')}`,
  };
}
