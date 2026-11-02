import {
  COPY_BONUS,
  GEAR,
  GEAR_LOOT,
  GEAR_RARITIES,
  GEAR_RARITY_ORDER,
  GEAR_SETS,
  GEAR_SLOTS,
  GEAR_STATS,
  MAX_COPIES,
  SCRAP_XP,
  SLOT_NAMES,
  gearStatLines,
} from '../data/gear.js';
import { record } from './progression.js';

/**
 * Gear between dives (the items are in data/gear.js). Saved in progress.gear:
 *   owned     { itemId: { copies, seen } }   everything found, shared by every diver
 *   equipped  { heroId: { slot: itemId } }   what each diver has on
 * `seen` is false until you've looked at the item's slot in the loadout (it shows as new).
 */
export function gearSave(progress) {
  progress.gear ??= {};
  progress.gear.owned ??= {};
  progress.gear.equipped ??= {};
  return progress.gear;
}

/** How much stronger copies make an item: 1 as found, +5% per copy after that, up to +50%. */
export const copyStrength = (copies) => 1 + COPY_BONUS * (Math.min(copies, MAX_COPIES) - 1);

/** What diver `heroId` has on: [{ id, def, copies, strength }], in slot order. */
export function equippedGear(progress, heroId) {
  const g = gearSave(progress);
  const on = g.equipped[heroId] ?? {};
  return GEAR_SLOTS.flatMap((slot) => {
    const id = on[slot];
    const def = GEAR[id];
    const owned = g.owned[id];
    if (!def || !owned || def.slot !== slot) return [];
    return [{ id, def, copies: owned.copies, strength: copyStrength(owned.copies) }];
  });
}

/** How many pieces of each set are worn: { setId: count }. */
export function setCounts(worn) {
  const counts = {};
  for (const w of worn) if (w.def.set) counts[w.def.set] = (counts[w.def.set] ?? 0) + 1;
  return counts;
}

/** The sources worn gear adds to a dive (Player.collectSources): each item's stats, and each set's bonus. */
export function gearSources(worn) {
  const list = worn.map((w) => ({
    rank: 1,
    apply: (b) => {
      for (const [stat, v] of Object.entries(w.def.stats)) b[GEAR_STATS[stat].bucket] += v * w.strength;
    },
  }));
  for (const [set, count] of Object.entries(setCounts(worn))) {
    if (count >= 2) list.push({ ...GEAR_SETS[set], rank: count });
  }
  return list;
}

// ------------------------------------------------ loot

/** Can `def` drop at `levelId`? Plain items anywhere; set pieces at their depth (or one that borrows its sets). */
const dropsAt = (def, levelId) => !def.from || def.from === levelId || Boolean(GEAR_LOOT[levelId]?.alsoFrom?.includes(def.from));

/** One item of `rarity` that can drop at `levelId` (or the next rarity down, if there's none). */
function pickItem(levelId, rarity, rng) {
  for (let r = GEAR_RARITY_ORDER.indexOf(rarity); r >= 0; r--) {
    const pool = Object.keys(GEAR).filter((id) => GEAR[id].rarity === GEAR_RARITY_ORDER[r] && dropsAt(GEAR[id], levelId));
    if (pool.length) return pool[Math.floor(rng.next() * pool.length)];
  }
  return null;
}

function pickRarity(odds, rng) {
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (const rarity of GEAR_RARITY_ORDER) {
    roll -= odds[rarity] ?? 0;
    if (roll < 0) return rarity;
  }
  return 'common';
}

/**
 * What clearing `levelId` drops: a list of item ids (GEAR_LOOT says how many and how rare).
 * The first time you clear a depth, one of them is always a piece of one of its sets.
 * `rng` is anything with next() → [0, 1).
 */
export function rollLoot(levelId, rng, firstClear = false) {
  const table = GEAR_LOOT[levelId];
  if (!table) return [];
  const found = [];
  for (let i = 0; i < table.items; i++) {
    const rarity = firstClear && i === 0 ? 'rare' : pickRarity(table.odds, rng);
    const id = pickItem(levelId, rarity, rng);
    if (id) found.push(id);
  }
  return found;
}

/**
 * Put found items in the stash. A copy of something you have makes it 5% stronger; past +50% it
 * turns into XP for the diver `heroId`. Returns what happened to each, for the cleared screen:
 * [{ id, def, copies, isNew, scrapXp }].
 */
export function addLoot(progress, heroId, ids) {
  const g = gearSave(progress);
  return ids.map((id) => {
    const def = GEAR[id];
    const owned = g.owned[id];
    if (!owned) {
      g.owned[id] = { copies: 1, seen: false };
      return { id, def, copies: 1, isNew: true, scrapXp: 0 };
    }
    if (owned.copies < MAX_COPIES) {
      owned.copies++;
      return { id, def, copies: owned.copies, isNew: false, scrapXp: 0 };
    }
    const xp = SCRAP_XP[def.rarity];
    record(progress, 'character', heroId).xp += xp;
    return { id, def, copies: owned.copies, isNew: false, scrapXp: xp };
  });
}

// ------------------------------------------------ the loadout

/** Wear item `id` (it goes in its own slot), or take it off if it's already on. */
export function toggleGear(progress, heroId, id) {
  const g = gearSave(progress);
  const def = GEAR[id];
  if (!def || !g.owned[id]) return false;
  const on = (g.equipped[heroId] ??= {});
  if (on[def.slot] === id) delete on[def.slot];
  else on[def.slot] = id;
  return true;
}

/** You've looked at everything found for `slot`: nothing in it shows as new any more. */
export function markSeen(progress, slot) {
  for (const [id, owned] of Object.entries(gearSave(progress).owned)) if (GEAR[id]?.slot === slot) owned.seen = true;
}

const pctOf = (strength) => Math.round((strength - 1) * 100);

/** Everything the loadout and the plaque show about one item. `worn` is what the diver has on. */
export function itemView(id, owned, worn) {
  const def = GEAR[id];
  const strength = copyStrength(owned.copies);
  const counts = setCounts(worn);
  const set = def.set ? GEAR_SETS[def.set] : null;
  const pieces = def.set ? Object.keys(GEAR).filter((k) => GEAR[k].set === def.set) : [];
  return {
    id,
    name: def.name,
    slot: def.slot,
    slotName: SLOT_NAMES[def.slot],
    rarity: def.rarity,
    rarityName: GEAR_RARITIES[def.rarity].name,
    color: GEAR_RARITIES[def.rarity].color,
    cursed: Boolean(def.cursed),
    copies: owned.copies,
    bonus: pctOf(strength),
    maxed: owned.copies >= MAX_COPIES,
    isNew: owned.seen === false,
    worn: worn.some((w) => w.id === id),
    stats: gearStatLines(def, strength),
    sprite: { kind: 'gear', id },
    set: set
      ? {
          name: set.name,
          worn: counts[def.set] ?? 0,
          pieces: pieces.map((k) => ({ name: GEAR[k].name, worn: worn.some((w) => w.id === k) })),
          bonuses: Object.entries(set.text).map(([n, text]) => ({ pieces: Number(n), text, active: (counts[def.set] ?? 0) >= Number(n) })),
          suits: set.suits,
        }
      : null,
  };
}

/**
 * The diver's gear for the loadout: the five slots, the sets being worn, and (when a slot is
 * open) everything found for that slot.
 */
export function gearView(progress, heroId, openSlot = null) {
  const g = gearSave(progress);
  const worn = equippedGear(progress, heroId);
  const ownedIn = (slot) => Object.keys(g.owned).filter((id) => GEAR[id]?.slot === slot);
  const order = (a, b) => GEAR_RARITY_ORDER.indexOf(GEAR[b].rarity) - GEAR_RARITY_ORDER.indexOf(GEAR[a].rarity) || GEAR[a].name.localeCompare(GEAR[b].name);
  const slots = GEAR_SLOTS.map((slot) => {
    const on = worn.find((w) => w.def.slot === slot);
    const ids = ownedIn(slot);
    return {
      slot,
      label: SLOT_NAMES[slot],
      item: on ? itemView(on.id, g.owned[on.id], worn) : null,
      owned: ids.length,
      unseen: ids.filter((id) => g.owned[id].seen === false).length,
      open: slot === openSlot,
    };
  });
  const sets = Object.entries(setCounts(worn)).map(([id, count]) => ({ id, name: GEAR_SETS[id].name, count, active: count >= 2 }));
  const open = openSlot
    ? { slot: openSlot, label: SLOT_NAMES[openSlot], items: ownedIn(openSlot).sort(order).map((id) => itemView(id, g.owned[id], worn)) }
    : null;
  return { slots, sets, open };
}
