import { WEAPONS } from '../data/weapons.js';

/**
 * A weapon the player owns. Its behaviour and per-level stats come from its
 * definition in src/data/weapons.js; this class just holds the runtime state.
 */
export class Weapon {
  constructor(id) {
    this.id = id;
    this.def = WEAPONS[id];
    if (!this.def) throw new Error(`Unknown weapon "${id}"`);
    this.level = 1;
    // How many levels its cards were worth in total. Normally the same as `level`; the Hollow
    // Diver's cards are stronger (a level-up worth 1.25 levels), and its stats follow this.
    this.power = null;
    this.timer = 0; // general-purpose cooldown timer
    this.cooldownFull = 0; // what `timer` was set to when it last fired (the HUD's cooldown sweep)
    this.diveXp = 0; // XP collected while carrying it this dive (its mastery level, between dives)
    this.state = {}; // per-weapon scratch data (orbit angle, hit cooldowns, ...)
    this.trinket = null; // id of the trinket in its slot (data/trinkets.js), if any
    this.trinketState = {}; // the trinket's own data (e.g. Conductor Coil's charge)
    this.trinket2 = null; // a second trinket (the Hollow Diver's Twin Sockets)
    this.trinketState2 = {};
    this.shrine = null; // the trinket in the Hollow Diver's suit, which works on every weapon
    this.shrineState = {};
    this.def.create?.(this);
  }

  /** Stats for the current level (or, with stronger cards, for its `power`). */
  get stats() {
    const row = this.def.levels[this.level - 1];
    if (this.power === null || this.power <= this.level + 1e-9) return row;
    const key = `${this.level}:${this.power}`;
    if (this.scaledKey !== key) {
      this.scaledKey = key;
      this.scaled = scaledStats(this.def.levels, this.level, this.power);
    }
    return this.scaled;
  }

  get maxLevel() {
    return this.def.levels.length;
  }

  get isMaxed() {
    return this.level >= this.maxLevel;
  }

  update(dt, game) {
    const before = this.timer;
    this.def.update(this, dt, game);
    // It just fired and started recharging: remember the full wait for the cooldown sweep.
    // (Pilot Fish and talents only ever shorten a wait, so they never trip this.)
    if (this.timer > before + 1e-6) this.cooldownFull = this.timer;
  }

  draw(ctx, game) {
    this.def.draw?.(this, ctx, game);
  }

  /** Optional second layer below the enemies (e.g. the Pistol Shrimp Claw's boiling water). */
  drawUnder(ctx, game) {
    this.def.drawUnder?.(this, ctx, game);
  }
}

/**
 * A weapon's stats when its `level - 1` level-ups were worth `power - 1` levels in all: everything
 * it gained since level 1 grows in proportion. Level-ups worth 1.25 levels each make every
 * improvement 25% bigger (+4 damage becomes +5). Numbers that are always whole (counts, pierce)
 * round to the nearest whole number. Anything else (text, flags) comes from the real level.
 */
function scaledStats(levels, level, power) {
  const row = levels[level - 1];
  if (level <= 1) return row; // nothing gained yet: a stronger first card shows up in later level-ups
  const out = { ...row };
  const k = (power - 1) / (level - 1);
  for (const key of Object.keys(row)) {
    const values = levels.map((l) => l[key]);
    if (!values.every((v) => typeof v === 'number')) continue;
    let v = values[0] + (row[key] - values[0]) * k;
    // Something that shrinks as it levels (a cooldown) never drops below half its smallest value.
    const smallest = Math.min(...values);
    if (smallest > 0) v = Math.max(v, smallest * 0.5);
    out[key] = values.every(Number.isInteger) ? Math.round(v) : v;
  }
  return out;
}
