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
    this.timer = 0; // general-purpose cooldown timer
    this.state = {}; // per-weapon scratch data (orbit angle, hit cooldowns, ...)
    this.trinket = null; // id of the trinket in its slot (data/trinkets.js), if any
    this.trinketState = {}; // the trinket's own data (e.g. Conductor Coil's charge)
    this.def.create?.(this);
  }

  /** Stats for the current level. */
  get stats() {
    return this.def.levels[this.level - 1];
  }

  get maxLevel() {
    return this.def.levels.length;
  }

  get isMaxed() {
    return this.level >= this.maxLevel;
  }

  update(dt, game) {
    this.def.update(this, dt, game);
  }

  draw(ctx, game) {
    this.def.draw?.(this, ctx, game);
  }

  /** Optional second layer below the enemies (e.g. the Pistol Shrimp Claw's boiling water). */
  drawUnder(ctx, game) {
    this.def.drawUnder?.(this, ctx, game);
  }
}
