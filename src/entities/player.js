import { CONFIG } from '../config.js';
import { TAU } from '../core/math.js';
import { HEROES } from '../data/heroes.js';
import { PASSIVES } from '../data/passives.js';
import { findTalent } from '../data/talents.js';
import { trinketSource } from '../data/trinkets.js';
import { drawDiver } from '../render/sprites.js';
import { Weapon } from './weapon.js';

export class Player {
  constructor(x, y, heroId) {
    this.heroId = heroId;
    this.hero = HEROES[heroId];
    if (!this.hero) throw new Error(`Unknown character "${heroId}"`);

    // x/y = simulation position, px/py = previous tick, rx/ry = interpolated render position
    this.x = this.px = this.rx = x;
    this.y = this.py = this.ry = y;
    this.radius = CONFIG.player.radius;
    this.facingX = 1;
    this.facingY = 0;
    this.moving = false;

    this.weapons = [];
    this.passives = new Map(); // passive id -> level
    this.talents = new Map(); // talent id -> rank
    this.buffs = new Map(); // buff id -> seconds left
    this.counters = {}; // per-dive memory for talents (e.g. "second wind used")
    this.droneCount = 0; // kept up to date by the game

    this.level = 1;
    this.xp = 0;
    this.xpToNext = CONFIG.xpToNext(1);

    this.invuln = 0;
    this.hurtFlash = 0;
    this.bubbleTimer = 0;
    this.dead = false;
    this.god = false; // debug invincibility

    this.dirty = false;
    this.stats = null;
    this.hp = 0;
    this.recalcStats();
    this.hp = this.stats.maxHp;
  }

  get weaponSlots() {
    return CONFIG.slots.weapons + (this.flags.juryRig ? 1 : 0);
  }

  /** Everything that changes stats or reacts to events, in a fixed order. */
  collectSources() {
    const list = [
      { apply: this.hero.stats, rank: 1 },
      { ...this.hero.trait, rank: 1 },
    ];
    // Some weapons can carry a built-in passive while you own them (`apply` on the weapon).
    for (const w of this.weapons) if (w.def.apply) list.push({ apply: w.def.apply, rank: w.level });
    for (const [id, level] of this.passives) list.push({ apply: PASSIVES[id].apply, rank: level });
    for (const [id, rank] of this.talents) list.push({ ...findTalent(id), rank });
    for (const w of this.weapons) if (w.trinket) list.push(trinketSource(w));
    return list;
  }

  /**
   * Rebuilds stats from the character, weapons and passives. Everything adds into shared
   * "buckets" (so bonuses to the same stat add up), then buckets become final
   * multipliers. Every stat means the same thing for every character. Talents mostly set
   * flags that change how skills work rather than adding stats; `derive` exists for
   * the rare override that needs the final bucket values (e.g. Mothership's cap).
   */
  recalcStats() {
    const base = CONFIG.player;
    const b = {
      maxHp: base.maxHp,
      regen: 0, // health per second
      armor: 0, // flat damage reduction
      speed: 0, // +% move speed
      magnet: 0, // +% pickup range
      might: 0, // +% damage
      area: 0, // +% size of weapons, shots and blasts
      haste: 0, // +% recharge speed of weapons, launches and abilities
      duration: 0, // +% length of effects, drone life and shot range
      attackSpeed: 0, // +% attack rate of drones and orbiting weapons
      growth: 0, // +% pearl (XP) value
      amount: 0, // extra projectiles / drones / orbiters
    };
    const flags = {};
    const sources = this.collectSources();
    for (const s of sources) s.apply?.(b, s.rank, this, flags);
    for (const s of sources) s.derive?.(b, s.rank, this, flags);
    this.sources = sources;
    this.bonus = b;
    this.flags = flags;
    this.dirty = false;

    const oldMax = this.stats ? this.stats.maxHp : null;
    this.stats = {
      maxHp: Math.max(1, Math.round(b.maxHp)),
      regen: b.regen,
      armor: b.armor,
      moveSpeed: base.moveSpeed * Math.max(0.3, 1 + b.speed),
      magnet: base.magnet * Math.max(0.2, 1 + b.magnet),
      might: Math.max(0.1, 1 + b.might),
      area: Math.max(0.3, 1 + b.area),
      cooldown: 1 / (1 + Math.max(-0.5, b.haste)), // haste 50% -> cooldowns × 0.67
      duration: Math.max(0.2, 1 + b.duration),
      attackSpeed: Math.max(0.2, 1 + b.attackSpeed),
      growth: Math.max(0, 1 + b.growth),
      amount: Math.max(0, Math.round(b.amount)),
    };
    if (oldMax !== null && this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  /** Run every trait/talent hook for `event`. Returns true if any hook returned true. */
  trigger(event, game, payload) {
    let handled = false;
    for (const s of this.sources) {
      const fn = s.hooks?.[event];
      if (fn && fn(game, payload, s.rank) === true) handled = true;
    }
    return handled;
  }

  /** Tags of everything you own, used to steer talent offers toward your build. */
  tagSet() {
    const tags = new Set();
    for (const w of this.weapons) for (const t of w.def.tags ?? []) tags.add(t);
    for (const id of this.passives.keys()) for (const t of PASSIVES[id].tags ?? []) tags.add(t);
    for (const id of this.talents.keys()) for (const t of findTalent(id)?.tags ?? []) tags.add(t);
    return tags;
  }

  addBuff(id, seconds) {
    this.buffs.set(id, Math.max(this.buffs.get(id) ?? 0, seconds));
  }

  hasBuff(id) {
    return (this.buffs.get(id) ?? 0) > 0;
  }

  addTalent(id) {
    this.talents.set(id, (this.talents.get(id) ?? 0) + 1);
    this.recalcStats();
  }

  setPassive(id, level) {
    this.passives.set(id, level);
    this.recalcStats();
  }

  update(dt, game) {
    if (this.dirty) this.recalcStats();
    this.px = this.x;
    this.py = this.y;

    const move = game.input.moveAxis();
    this.moving = move.x !== 0 || move.y !== 0;
    if (this.moving) {
      this.facingX = move.x;
      this.facingY = move.y;
    }
    this.x += move.x * this.stats.moveSpeed * dt;
    this.y += move.y * this.stats.moveSpeed * dt;

    if (this.stats.regen > 0) this.heal(this.stats.regen * dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    for (const [id, left] of this.buffs) {
      if (left - dt <= 0) this.buffs.delete(id);
      else this.buffs.set(id, left - dt);
    }

    // Air bubbles from the helmet (visual only)
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) {
      this.bubbleTimer = 0.35 + Math.random() * 0.5;
      game.effects.bubble(this.x - this.facingX * 6, this.y - this.facingY * 6 - 6);
    }

    // Overclock (talent) makes every weapon work twice as fast for a while.
    const weaponDt = this.hasBuff('overclock') ? dt * 2 : dt;
    for (const w of this.weapons) w.update(weaponDt, game);
    this.trigger('tick', game, dt);
  }

  takeDamage(amount, game) {
    if (this.dead || this.god || this.invuln > 0 || game.clearing > 0) return;
    const dmg = Math.max(1, amount - this.stats.armor);
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = CONFIG.player.invulnTime;
    this.hurtFlash = 0.15;
    game.audio.play('hurt');
    game.camera.shake(5, 0.2);
    game.effects.text(this.x, this.y - this.radius - 8, Math.round(dmg), '#ff5d5d', 18);
    this.trigger('hurt', game, dmg);
    if (this.hp <= 0 && !this.trigger('lethal', game)) game.onPlayerDied();
  }

  heal(amount) {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  gainXp(amount, game) {
    this.xp += amount * this.stats.growth;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = CONFIG.xpToNext(this.level);
      game.queueLevelUp(this.level % CONFIG.talents.every === 0 ? 'talent' : 'normal');
      this.trigger('levelUp', game);
    }
  }

  /** Put trinket `trinketId` in weapon `weaponId`'s slot. It stays there for the rest of the dive. */
  attachTrinket(weaponId, trinketId) {
    const w = this.getWeapon(weaponId);
    if (!w || w.trinket) return;
    w.trinket = trinketId;
    w.trinketState = {};
    this.recalcStats(); // its hooks join the others
  }

  /** Ids of the trinkets you carry (one per weapon at most). */
  get trinkets() {
    return this.weapons.filter((w) => w.trinket).map((w) => w.trinket);
  }

  getWeapon(id) {
    return this.weapons.find((w) => w.id === id);
  }

  addWeapon(id, level = 1) {
    const weapon = new Weapon(id);
    weapon.level = Math.min(level, weapon.maxLevel);
    this.weapons.push(weapon);
    this.dirty = true;
    return weapon;
  }

  draw(ctx, game) {
    if (this.dead) return;
    const r = this.radius;

    // Blink while invulnerable
    if (this.invuln > 0 && Math.floor(game.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;

    if (game.theme.shadows !== false) {
      ctx.fillStyle = 'rgba(0, 25, 35, 0.3)';
      ctx.beginPath();
      ctx.ellipse(this.rx + r * 0.3, this.ry + r * 0.95, r, r * 0.4, 0, 0, TAU);
      ctx.fill();
    }
    drawDiver(ctx, this, game.time);
    ctx.globalAlpha = 1;
    this.trigger('draw', game, ctx); // talents that show something around the diver

    // Health bar
    const w = 34;
    const h = 5;
    const bx = this.rx - w / 2;
    const by = this.ry + r + 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(bx, by, w * (this.hp / this.stats.maxHp), h);
  }
}
