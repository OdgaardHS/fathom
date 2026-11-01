import { CONFIG } from '../config.js';
import { findTalent } from '../data/talents.js';
import { CHARACTER_TREES, WEAPON_TREES } from '../data/trees.js';

/**
 * Progression between dives: characters and weapons level up from the pearls you collect,
 * every level is a talent point, and points are spent in that character's or weapon's tree.
 *
 *   kind  'character' | 'weapon'
 *   Saved in progress.characters[id] / progress.weaponMastery[id] as { xp, talents: { talentId: rank } }.
 *
 * Every talent you've taken is active in every dive (a weapon's once you carry it). Respec is
 * free: refund single points (as long as nothing below depends on them) or reset the tree.
 */

const GROUPS = { character: 'characters', weapon: 'weaponMastery' };

export const treeOf = (kind, id) => (kind === 'character' ? CHARACTER_TREES : WEAPON_TREES)[id] ?? null;

/** A node's id: its talent id, or its `key` for a choice node. */
export const nodeKey = (node) => node.key ?? node.id;

/** The saved record for a character or weapon, created on first use. */
export function record(progress, kind, id) {
  const group = GROUPS[kind];
  progress[group] ??= {};
  progress[group][id] ??= { xp: 0, talents: {} };
  return progress[group][id];
}

/** Level from total XP: { level, maxLevel, into, need } (need = XP for the next level, 0 when maxed). */
export function levelInfo(kind, id, xp) {
  const curve = kind === 'character' ? CONFIG.progression.characterXp : CONFIG.progression.weaponXp;
  const maxLevel = (treeOf(kind, id)?.maxPoints ?? 0) + 1;
  let level = 1;
  let left = xp;
  while (level < maxLevel && left >= curve(level)) {
    left -= curve(level);
    level++;
  }
  return { level, maxLevel, into: level < maxLevel ? left : 0, need: level < maxLevel ? curve(level) : 0 };
}

export function nodeRank(node, alloc) {
  if (node.id) return alloc[node.id] ?? 0;
  return node.choice.reduce((sum, id) => sum + (alloc[id] ?? 0), 0);
}

export const nodeMax = (node) => (node.id ? (findTalent(node.id)?.ranks ?? 1) : 1);

const byKey = (tree, key) => tree.nodes.find((n) => nodeKey(n) === key);
const spent = (tree, alloc) => tree.nodes.reduce((sum, n) => sum + nodeRank(n, alloc), 0);
const pointsAbove = (tree, alloc, row) => tree.nodes.reduce((sum, n) => sum + (n.row < row ? nodeRank(n, alloc) : 0), 0);
const parentsOk = (tree, alloc, node) => !node.from?.length || node.from.some((k) => nodeRank(byKey(tree, k), alloc) > 0);
const gateOk = (tree, alloc, node) => pointsAbove(tree, alloc, node.row) >= (tree.gates?.[node.row] ?? 0);

/** Whether a whole allocation follows the rules (paths, gates, ranks, budget). */
export function isValid(tree, alloc, points) {
  if (spent(tree, alloc) > points) return false;
  for (const node of tree.nodes) {
    const r = nodeRank(node, alloc);
    if (r === 0) continue;
    if (r > nodeMax(node) || !parentsOk(tree, alloc, node) || !gateOk(tree, alloc, node)) return false;
  }
  // nothing taken that isn't in the tree
  const known = new Set(tree.nodes.flatMap((n) => (n.id ? [n.id] : n.choice)));
  return Object.keys(alloc).every((id) => known.has(id) && alloc[id] > 0);
}

/** Everything the tree screen needs about one tree. */
export function treeState(progress, kind, id) {
  const tree = treeOf(kind, id);
  const rec = record(progress, kind, id);
  const info = levelInfo(kind, id, rec.xp);
  const points = info.level - 1;
  // A save that no longer fits the tree (or the budget) starts over rather than breaking.
  if (!isValid(tree, rec.talents, points)) rec.talents = {};
  const used = spent(tree, rec.talents);
  return { kind, id, tree, alloc: rec.talents, ...info, points, spent: used, free: points - used };
}

/**
 * Can a point go into `node` (taking `option` on a choice node)? Returns { ok, reason }.
 * On a choice node that's already taken, picking the other option is a free swap.
 */
export function canBuy(state, node, option = null) {
  const { tree, alloc } = state;
  const r = nodeRank(node, alloc);
  if (node.choice && r > 0) return { ok: option !== null && !alloc[option], reason: 'Click the other option to swap.' };
  if (r >= nodeMax(node)) return { ok: false, reason: 'Fully learned.' };
  if (state.free <= 0) return { ok: false, reason: 'No points left. Level up by diving.' };
  if (!parentsOk(tree, alloc, node)) {
    const names = node.from.map((k) => nodeName(byKey(tree, k))).join(' or ');
    return { ok: false, reason: `Needs a point in ${names}.` };
  }
  if (!gateOk(tree, alloc, node)) {
    const need = tree.gates[node.row];
    return { ok: false, reason: `Opens after ${need} points in the rows above (${pointsAbove(tree, alloc, node.row)} so far).` };
  }
  return { ok: true, reason: null };
}

/** Spend a point (or swap a choice node). Returns true if anything changed. */
export function buy(progress, kind, id, key, option = null) {
  const state = treeState(progress, kind, id);
  const node = byKey(state.tree, key);
  if (!node || !canBuy(state, node, option).ok) return false;
  const alloc = state.alloc;
  if (node.choice) {
    const pick = option ?? node.choice[0];
    for (const o of node.choice) delete alloc[o];
    alloc[pick] = 1;
  } else {
    alloc[node.id] = (alloc[node.id] ?? 0) + 1;
  }
  return true;
}

/** Take one point back out of `key`, if nothing else depends on it. Returns true if it did. */
export function refund(progress, kind, id, key) {
  const state = treeState(progress, kind, id);
  const node = byKey(state.tree, key);
  if (!node || nodeRank(node, state.alloc) === 0) return false;
  const next = { ...state.alloc };
  if (node.choice) for (const o of node.choice) delete next[o];
  else if (next[node.id] > 1) next[node.id]--;
  else delete next[node.id];
  if (!isValid(state.tree, next, state.points)) return false;
  record(progress, kind, id).talents = next;
  return true;
}

export function resetTree(progress, kind, id) {
  record(progress, kind, id).talents = {};
}

/** Why a point can't be refunded, for the tree screen (null when it can). */
export function refundBlocked(state, key) {
  const node = byKey(state.tree, key);
  if (!node || nodeRank(node, state.alloc) === 0) return null;
  const next = { ...state.alloc };
  if (node.choice) for (const o of node.choice) delete next[o];
  else if (next[node.id] > 1) next[node.id]--;
  else delete next[node.id];
  return isValid(state.tree, next, state.points) ? null : 'Talents below depend on this one.';
}

function nodeName(node) {
  if (!node) return '?';
  if (node.id) return findTalent(node.id)?.name ?? node.id;
  return node.choice.map((o) => findTalent(o)?.name ?? o).join(' / ');
}

/** The talents a dive starts with: this character's tree plus every weapon's tree (active once carried). */
export function loadoutFor(progress, heroId) {
  const weapons = {};
  for (const id of Object.keys(WEAPON_TREES)) weapons[id] = { ...treeState(progress, 'weapon', id).alloc };
  return { character: { ...treeState(progress, 'character', heroId).alloc }, weapons };
}

/**
 * End of a dive: the character gains every bit of XP collected, each weapon the XP collected
 * while it was carried. Returns what levelled up, for the game-over / cleared screens.
 */
export function bankDive(progress, heroId, characterXp, weaponXp) {
  const results = [];
  const gain = (kind, id, xp) => {
    if (!(xp > 0) || !treeOf(kind, id)) return;
    const rec = record(progress, kind, id);
    const before = levelInfo(kind, id, rec.xp).level;
    rec.xp += Math.round(xp);
    const after = levelInfo(kind, id, rec.xp);
    results.push({ kind, id, xp: Math.round(xp), from: before, to: after.level, maxLevel: after.maxLevel });
  };
  gain('character', heroId, characterXp);
  for (const [id, xp] of Object.entries(weaponXp)) gain('weapon', id, xp);
  return results;
}
