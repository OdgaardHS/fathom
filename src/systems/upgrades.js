import { CONFIG } from '../config.js';
import { RARITIES, augmentsFor } from '../data/augments.js';
import { PASSIVES } from '../data/passives.js';
import { TRINKETS, TRINKET_ORDER, worksOn } from '../data/trinkets.js';
import { WEAPONS, weaponsUsing } from '../data/weapons.js';

const FALLBACK_HEAL = 40;
const NEW_WEAPON_ODDS = 3.2; // total weight of all new-weapon cards together (split between them)

// ------------------------------------------------------------ normal level-ups

/** How many cards a level-up shows (the Hollow Diver: 2, or 1 with One Path). */
export const cardCount = (player) => player.flags.cardCount ?? CONFIG.levelUpChoices + (player.flags.extraCards ?? 0);

/**
 * Lists every weapon/passive upgrade the player could take right now, then draws
 * `count` of them at random (weighted, no duplicates). `canOffer(id)` says which new
 * weapons this dive can offer (weapons found deeper down only show up from their depth on).
 */
export function rollUpgrades(player, rng, count = cardCount(player), canOffer = () => true) {
  const picks = drawWeighted(upgradePool(player, canOffer), rng, count);

  // Everything is maxed: still give the player something.
  if (picks.length === 0) {
    picks.push({
      kind: 'heal',
      id: 'heal',
      name: 'Second Breath',
      icon: '+',
      color: '#e5484d',
      tag: 'Recover',
      text: `Restore ${FALLBACK_HEAL} health`,
      weight: 1,
    });
  }
  return picks;
}

/**
 * The card `choice` stands for, as it would be offered right now (its next level), or null if
 * it can't be taken any more. For cards taken alongside another (Gorge, Nothing Wasted) and the
 * card that comes back (Aftertaste).
 */
export function findUpgrade(player, choice, canOffer = () => true) {
  if (choice.kind === 'heal') return choice;
  return upgradePool(player, canOffer).find((o) => o.kind === choice.kind && o.id === choice.id && Boolean(o.isNew) === Boolean(choice.isNew)) ?? null;
}

/** Every weapon, augment and passive card that could be offered right now. */
function upgradePool(player, canOffer) {
  const pool = [];
  const eaten = new Set(player.eaten.map((w) => w.id)); // weapons the Hollow Diver ate don't come back
  const newLevel = player.flags.juryRig ? 2 : 1; // Jury-Rig: new weapons start at level 2

  for (const w of player.weapons) {
    if (!w.isMaxed) pool.push(weaponOption(w.id, w.level + 1, 1));
    // augments for it: any number, rarer the stronger
    for (const aug of augmentsFor(w.id)) pool.push(augmentOption(w, aug));
  }
  if (player.weapons.length < player.weaponSlots) {
    // With many weapons, each new one is a little rarer, so new-weapon cards don't crowd out upgrades.
    const fresh = Object.keys(WEAPONS).filter((id) => !player.getWeapon(id) && !eaten.has(id) && canOffer(id));
    const weight = Math.min(0.9, NEW_WEAPON_ODDS / Math.max(1, fresh.length));
    for (const id of fresh) pool.push(weaponOption(id, newLevel, weight, true));
  }
  for (const [id, level] of player.passives) {
    if (level < PASSIVES[id].maxLevel) pool.push(passiveOption(player, id, level + 1, 0.8));
    else if (player.flags.overflow) pool.push(overflowOption(player, id, 0.5)); // Overflow (the Hollow Diver)
  }
  if (player.passives.size < CONFIG.slots.passives) {
    for (const id of Object.keys(PASSIVES)) {
      if (!player.passives.has(id)) pool.push(passiveOption(player, id, 1, 0.6));
    }
  }
  return pool;
}

// ------------------------------------------------------------------ trinkets

/** Trinkets you haven't found yet this dive. */
function unfoundTrinkets(player) {
  const found = new Set(player.trinkets);
  return TRINKET_ORDER.filter((id) => !found.has(id));
}

/** Whether an elite chest's trinket has somewhere to go: one left to find and a free socket. */
export function canTakeTrinket(player) {
  const suitFree = player.flags.innerShrine && !player.shrine;
  return unfoundTrinkets(player).length > 0 && (suitFree || player.weapons.some((w) => player.freeSockets(w) > 0));
}

/** Up to three trinkets you haven't found yet this dive (two with the Hollow Diver's Twin Sockets). */
export function rollTrinkets(player, rng, count = player.flags.trinketCount ?? CONFIG.levelUpChoices + (player.flags.extraTrinkets ?? 0)) {
  return drawWeighted(unfoundTrinkets(player).map((id) => trinketOption(player, id)), rng, count);
}

const heldTrinket = (id) => {
  if (!id) return null;
  const t = TRINKETS[id];
  return { id, name: t.name, icon: t.icon, color: t.color, sprite: { kind: 'trinket', id } };
};

/**
 * Your weapon slots for the trinket screen, so trinkets can be dropped straight onto a weapon.
 * One entry per slot (null when the slot is empty), with the trinkets it already holds, whether
 * it has room for another (`open`), and what each offered trinket would do on it
 * (`effects[trinketId]`, null where it has no effect). With the Hollow Diver's Inner Shrine, the
 * suit's own socket comes last (`suit: true`).
 */
export function trinketLoadout(player, offers) {
  const slots = [];
  for (let i = 0; i < player.weaponSlots; i++) {
    const w = player.weapons[i];
    if (!w) {
      slots.push(null);
      continue;
    }
    const effects = {};
    for (const t of offers) effects[t.id] = worksOn(t.id, w.id) ? TRINKETS[t.id].onWeapon[w.id] : null;
    slots.push({
      id: w.id,
      name: w.def.name,
      icon: w.def.icon,
      color: w.def.color,
      level: w.level,
      sprite: { kind: 'weapon', id: w.id },
      trinket: heldTrinket(w.trinket),
      trinket2: heldTrinket(w.trinket2),
      twin: Boolean(player.flags.twinSockets),
      open: player.freeSockets(w) > 0,
      effects,
    });
  }
  if (player.flags.innerShrine) {
    const effects = {};
    for (const t of offers) {
      const on = player.weapons.filter((w) => worksOn(t.id, w.id)).map((w) => w.def.name);
      effects[t.id] = on.length ? `Works on your ${on.join(', ')} as if attached to each, but does nothing for your other weapons.` : null;
    }
    slots.push({
      suit: true,
      id: 'suit',
      name: 'The suit',
      icon: 'Su',
      color: '#8c7ae6',
      sprite: null,
      hero: player.hero, // the slot shows the diver itself
      trinket: heldTrinket(player.shrine?.trinket),
      trinket2: null,
      open: !player.shrine,
      effects,
    });
  }
  return slots;
}

function trinketOption(player, id) {
  const t = TRINKETS[id];
  // Only the weapons you carry: with this many weapons, the full list would be noise.
  const missing = player.weapons.map((w) => w.id).filter((wid) => !worksOn(id, wid));
  return {
    kind: 'trinket',
    id,
    sprite: { kind: 'trinket', id },
    weight: 1,
    name: t.name,
    icon: t.icon,
    color: t.color,
    tag: 'Trinket',
    details: [
      ['Attached weapon', t.attached],
      ['Your other weapons', t.others],
    ],
    note: missing.length ? `No effect on your ${missing.map((wid) => WEAPONS[wid].name).join(', ')}` : null,
  };
}

// ------------------------------------------------------------------ applying

/**
 * `strength`: how many levels the card is worth. 1 normally; the Hollow Diver's cards are
 * stronger (1.25 = a quarter of a level more).
 */
export function applyUpgrade(choice, game, strength = choice.strength ?? 1) {
  const p = game.player;
  switch (choice.kind) {
    case 'weapon':
      if (choice.isNew) p.addWeapon(choice.id, choice.level, strength);
      else {
        const w = p.getWeapon(choice.id);
        if (strength !== 1 || w.power !== null) w.power = (w.power ?? w.level) + strength;
        w.level = choice.level;
      }
      p.dirty = true;
      break;
    case 'passive':
      if (choice.overflow) {
        // Overflow: it pours into whichever passive is worth the least right now.
        const power = (id) => p.passivePower.get(id) ?? p.passives.get(id);
        const target = [...p.passives.keys()].sort((a, b) => power(a) - power(b))[0];
        p.passivePower.set(target, power(target) + strength);
        p.recalcStats();
      } else p.setPassive(choice.id, choice.level, strength);
      break;
    case 'augment':
      p.getWeapon(choice.weapon)?.addAugment(choice.augment, strength);
      break;
    case 'socket':
      p.attachTrinket(choice.id, choice.trinket);
      break;
    case 'heal':
      p.heal(FALLBACK_HEAL);
      break;
  }
}

// ------------------------------------------------------------------ helpers

function drawWeighted(pool, rng, count) {
  const picks = [];
  const left = [...pool];
  while (picks.length < count && left.length > 0) {
    const choice = rng.weighted(left);
    picks.push(choice);
    left.splice(left.indexOf(choice), 1);
  }
  return picks;
}

function weaponOption(id, level, weight, isNew = false) {
  const def = WEAPONS[id];
  return {
    kind: 'weapon',
    id,
    sprite: { kind: 'weapon', id },
    level,
    isNew,
    weight,
    name: def.name,
    icon: def.icon,
    color: def.color,
    tag: isNew ? `New weapon${level > 1 ? ` · Lv ${level}` : ''}` : `Weapon · Lv ${level}`,
    text: isNew ? `${def.description} Brings the talents you've taken in its tree.` : def.levels[level - 1].text,
  };
}

/** An augment card for weapon `w`: the card names it, and shows the augment's rarity. */
function augmentOption(w, aug) {
  const rarity = RARITIES[aug.rarity];
  return {
    kind: 'augment',
    id: `${w.id}:${aug.key}`,
    weapon: w.id,
    augment: aug,
    rarity: aug.rarity,
    sprite: { kind: 'passive', id: aug.icon },
    weight: aug.weight,
    name: aug.name,
    icon: aug.name.slice(0, 2),
    color: rarity.color,
    tag: `${rarity.name} augment`,
    text: aug.text,
    on: { id: w.id, name: w.def.name, icon: w.def.icon, color: w.def.color },
  };
}

/** Overflow: a maxed passive's card keeps coming, and pours into your weakest passive. */
function overflowOption(player, id, weight) {
  const def = PASSIVES[id];
  return {
    kind: 'passive',
    id,
    overflow: true,
    sprite: { kind: 'passive', id },
    level: player.passives.get(id),
    weight,
    name: def.name,
    icon: def.icon,
    color: def.color,
    tag: 'Overflow',
    text: 'Already full: this card pours into your weakest passive instead.',
  };
}

function passiveOption(player, id, level, weight) {
  const def = PASSIVES[id];
  const carried = player.weapons.map((w) => w.id);
  return {
    kind: 'passive',
    id,
    sprite: { kind: 'passive', id },
    level,
    weight,
    name: def.name,
    icon: def.icon,
    color: def.color,
    tag: level === 1 ? 'New passive' : `Passive · Lv ${level}`,
    text: def.text,
    affects: weaponsUsing(def.tags, carried), // only weapons you're carrying
  };
}
