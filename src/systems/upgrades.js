import { CONFIG } from '../config.js';
import { HEROES } from '../data/heroes.js';
import { PASSIVES } from '../data/passives.js';
import { FALLBACK_TALENT, TAG_LABELS, TIER_COLORS, findTalent } from '../data/talents.js';
import { TRINKETS, TRINKET_ORDER, worksOn } from '../data/trinkets.js';
import { WEAPONS, weaponsUsing } from '../data/weapons.js';

const FALLBACK_HEAL = 40;
const TIER_WEIGHT = { 1: 1, 2: 0.9, 3: 0.7 };
const SYNERGY_BONUS = 0.5; // each tag a talent shares with your build adds +50% to its odds
const NEW_WEAPON_ODDS = 3.2; // total weight of all new-weapon cards together (split between them)

// ------------------------------------------------------------ normal level-ups

/**
 * Lists every weapon/passive upgrade the player could take right now, then draws
 * `count` of them at random (weighted, no duplicates). `canOffer(id)` says which new
 * weapons this dive can offer (weapons found deeper down only show up from their depth on).
 */
export function rollUpgrades(player, rng, count = CONFIG.levelUpChoices, canOffer = () => true) {
  const pool = [];
  const newLevel = player.flags.juryRig ? 2 : 1; // Jury-Rig: new weapons start at level 2

  for (const w of player.weapons) {
    if (!w.isMaxed) pool.push(weaponOption(w.id, w.level + 1, 1));
  }
  if (player.weapons.length < player.weaponSlots) {
    // With many weapons, each new one is a little rarer, so new-weapon cards don't crowd out upgrades.
    const fresh = Object.keys(WEAPONS).filter((id) => !player.getWeapon(id) && canOffer(id));
    const weight = Math.min(0.9, NEW_WEAPON_ODDS / Math.max(1, fresh.length));
    for (const id of fresh) pool.push(weaponOption(id, newLevel, weight, true));
  }
  for (const [id, level] of player.passives) {
    if (level < PASSIVES[id].maxLevel) pool.push(passiveOption(player, id, level + 1, 0.8));
  }
  if (player.passives.size < CONFIG.slots.passives) {
    for (const id of Object.keys(PASSIVES)) {
      if (!player.passives.has(id)) pool.push(passiveOption(player, id, 1, 0.6));
    }
  }

  const picks = drawWeighted(pool, rng, count);

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

// ------------------------------------------------------------------ talents

/** The talent pool: your character's talents plus those of every weapon you carry. */
export function talentPool(player) {
  return [...player.hero.talents, ...player.weapons.flatMap((w) => w.def.talents ?? [])];
}

/**
 * Draws talent offers from the pool. Talents unlock by tier as you level, only one
 * build-defining (tier 3) talent is allowed per dive, and talents that share tags
 * with what you already own are more likely to show up.
 */
export function rollTalents(player, rng, count = CONFIG.levelUpChoices) {
  const tierFrom = CONFIG.talents.tierLevels;
  const owned = player.talents;
  const hasKeystone = [...owned.keys()].some((id) => findTalent(id)?.tier === 3);
  const myTags = player.tagSet();

  const pool = [];
  for (const t of talentPool(player)) {
    const rank = owned.get(t.id) ?? 0;
    if (rank >= (t.ranks ?? 1)) continue;
    if (player.level < tierFrom[t.tier]) continue;
    if (t.tier === 3 && hasKeystone) continue;
    if (t.requires && !t.requires.every((id) => owned.has(id))) continue;
    const shared = (t.tags ?? []).filter((tag) => myTags.has(tag)).length;
    pool.push(talentOption(t, rank + 1, TIER_WEIGHT[t.tier] * (1 + SYNERGY_BONUS * shared)));
  }

  const picks = drawWeighted(pool, rng, count);
  if (picks.length === 0) picks.push(talentOption(FALLBACK_TALENT, (owned.get(FALLBACK_TALENT.id) ?? 0) + 1, 1));
  return picks;
}

// ------------------------------------------------------------------ trinkets

/** Trinkets you haven't found yet this dive. */
function unfoundTrinkets(player) {
  const found = new Set(player.trinkets);
  return TRINKET_ORDER.filter((id) => !found.has(id));
}

/** Whether an elite chest's trinket has somewhere to go: one left to find and a weapon with a free slot. */
export function canTakeTrinket(player) {
  return unfoundTrinkets(player).length > 0 && player.weapons.some((w) => !w.trinket);
}

/** Up to three trinkets you haven't found yet this dive. */
export function rollTrinkets(player, rng, count = CONFIG.levelUpChoices) {
  return drawWeighted(unfoundTrinkets(player).map((id) => trinketOption(player, id)), rng, count);
}

/**
 * Your weapon slots for the trinket screen, so trinkets can be dropped straight onto a weapon.
 * One entry per slot (null when the slot is empty), with the trinket it already holds and what
 * each offered trinket would do on it (`effects[trinketId]`, null where it has no effect).
 */
export function trinketLoadout(player, offers) {
  const slots = [];
  for (let i = 0; i < player.weaponSlots; i++) {
    const w = player.weapons[i];
    if (!w) {
      slots.push(null);
      continue;
    }
    const held = w.trinket ? TRINKETS[w.trinket] : null;
    const effects = {};
    for (const t of offers) effects[t.id] = worksOn(t.id, w.id) ? TRINKETS[t.id].onWeapon[w.id] : null;
    slots.push({
      id: w.id,
      name: w.def.name,
      icon: w.def.icon,
      color: w.def.color,
      level: w.level,
      sprite: { kind: 'weapon', id: w.id },
      trinket: held ? { id: w.trinket, name: held.name, icon: held.icon, color: held.color, sprite: { kind: 'trinket', id: w.trinket } } : null,
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

export function applyUpgrade(choice, game) {
  const p = game.player;
  switch (choice.kind) {
    case 'weapon':
      if (choice.isNew) p.addWeapon(choice.id, choice.level);
      else p.getWeapon(choice.id).level = choice.level;
      p.dirty = true;
      break;
    case 'passive':
      p.setPassive(choice.id, choice.level);
      break;
    case 'talent':
      p.addTalent(choice.id);
      findTalent(choice.id)?.onPick?.(game);
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
    text: isNew ? `${def.description} Adds its talents to your pool.` : def.levels[level - 1].text,
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

/** "Mara", "Harpoon", ...: who a talent belongs to, shown on its card. */
function ownerName(owner) {
  if (HEROES[owner]) return HEROES[owner].name.split(' ')[0];
  return WEAPONS[owner]?.name ?? 'Talent';
}

function talentOption(t, rank, weight) {
  const ranks = t.ranks ?? 1;
  const owner = ownerName(t.owner);
  let tag = t.tier === 3 ? `${owner} · build-defining` : `${owner} · tier ${t.tier}`;
  if (ranks > 1 && ranks < 99) tag += ` · rank ${rank}/${ranks}`;
  return {
    kind: 'talent',
    id: t.id,
    rank,
    weight,
    name: t.name,
    icon: t.icon,
    color: TIER_COLORS[t.tier],
    tier: t.tier,
    tag,
    text: t.text,
    tags: (t.tags ?? []).map((tag) => TAG_LABELS[tag] ?? tag),
  };
}
