import { CONFIG } from '../config.js';
import { TAU } from '../core/math.js';
import { HEROES } from '../data/heroes.js';
import { PASSIVES } from '../data/passives.js';
import { findTalent } from '../data/talents.js';
import { trinketSources } from '../data/trinkets.js';
import { gearSources } from '../systems/gear.js';
import { drawDiver } from '../render/sprites.js';
import { Weapon } from './weapon.js';

export class Player {
  /**
   * `loadout`: the talents taken in this character's and every weapon's tree (systems/progression.js),
   * and `gear`, what the diver has on (systems/gear.js equippedGear).
   */
  constructor(x, y, heroId, loadout = { character: {}, weapons: {} }) {
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
    // Passive id -> how many levels its cards were worth. Only differs from the level for the
    // Hollow Diver, whose cards are stronger; stats use this.
    this.passivePower = new Map();
    this.eaten = []; // weapons the Hollow Diver ate (Hollow Out): their talents and trinkets stay
    this.shrine = null; // the trinket in the Hollow Diver's suit (Inner Shrine)
    this.everCarried = 1; // most weapons carried at once this dive (the Hollow Diver's unlock)
    this.loadout = loadout;
    this.talents = new Map(); // talent id -> rank: the character's tree plus the trees of the weapons you carry
    this.diveXp = 0; // XP collected this dive (banked into the character's level when it ends)
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
    // Jury-Rig: one more slot. Specialist (the Captain): one more slot, wielded by the crewmate.
    return CONFIG.slots.weapons + (this.flags.juryRig ? 1 : 0) + (this.flags.crewSpecialist ? 1 : 0);
  }

  /** Everything that changes stats or reacts to events, in a fixed order. */
  collectSources() {
    const list = [
      { apply: this.hero.stats, rank: 1 },
      { ...this.hero.trait, rank: 1 },
      // gear: each item's stats, and the bonuses of sets with 2 or more pieces on
      ...gearSources(this.loadout.gear ?? []),
    ];
    // Some weapons can carry a built-in passive while you own them (`apply` on the weapon).
    for (const w of this.weapons) if (w.def.apply) list.push({ apply: w.def.apply, rank: w.level });
    for (const [id, level] of this.passives) list.push({ apply: PASSIVES[id].apply, rank: this.passivePower.get(id) ?? level });
    // Talents: the character's tree, plus the trees of the weapons you carry (and have eaten).
    const talents = new Map(Object.entries(this.loadout.character ?? {}));
    for (const w of [...this.weapons, ...this.eaten]) for (const [id, rank] of Object.entries(this.loadout.weapons?.[w.id] ?? {})) talents.set(id, rank);
    this.talents = talents;
    for (const [id, rank] of talents) {
      const t = findTalent(id);
      if (t && rank > 0) list.push({ ...t, rank });
    }
    // The trinket in the Hollow Diver's suit works on every weapon you carry.
    for (const w of this.weapons) w.shrine = this.shrine?.trinket ?? null;
    for (const w of [...this.weapons, ...this.eaten]) list.push(...trinketSources(w));
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
      healthPct: 0, // +% max health (gear)
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
      maxHp: Math.max(1, Math.round(b.maxHp * Math.max(0.2, 1 + b.healthPct))),
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

  addBuff(id, seconds) {
    this.buffs.set(id, Math.max(this.buffs.get(id) ?? 0, seconds));
  }

  hasBuff(id) {
    return (this.buffs.get(id) ?? 0) > 0;
  }

  /** Take passive `id` at `level`; `strength` is how many levels that card is worth (stronger cards). */
  setPassive(id, level, strength = 1) {
    const before = this.passivePower.get(id) ?? this.passives.get(id) ?? 0;
    this.passives.set(id, level);
    this.passivePower.set(id, before + strength);
    this.recalcStats();
  }

  /** Hollow Out: eat the weapon in slot `index`. Its slot frees up; its talents and trinkets stay. */
  eatWeapon(index) {
    const [w] = this.weapons.splice(index, 1);
    if (!w) return null;
    w.shrine = null;
    this.eaten.push(w);
    this.recalcStats();
    return w;
  }

  /** Pour Out: drop passive `id` and pour everything it was worth into your other passives. */
  pourPassive(id) {
    const power = this.passivePower.get(id) ?? this.passives.get(id) ?? 0;
    this.passives.delete(id);
    this.passivePower.delete(id);
    const rest = [...this.passives.keys()];
    for (const other of rest) this.passivePower.set(other, (this.passivePower.get(other) ?? this.passives.get(other)) + power / rest.length);
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

    // Air bubbles from the helmet (visual only). The Hollow Diver doesn't breathe: dark wisps
    // leak from its seams instead.
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) {
      const wisps = this.hero.palette.wisps;
      this.bubbleTimer = wisps ? 0.12 + Math.random() * 0.2 : 0.35 + Math.random() * 0.5;
      if (wisps) game.effects.wisp(this.x + (Math.random() - 0.5) * 18, this.y + (Math.random() - 0.5) * 18);
      else game.effects.bubble(this.x - this.facingX * 6, this.y - this.facingY * 6 - 6);
    }

    // Overclock (talent) makes every weapon work twice as fast for a while.
    const weaponDt = this.hasBuff('overclock') ? dt * 2 : dt;
    // With the Captain's Specialist, the weapon in the last slot belongs to the crewmate, who fires it.
    const crewSlot = this.flags.crewSpecialist ? this.weaponSlots - 1 : -1;
    this.weapons.forEach((w, i) => {
      w.crew = i === crewSlot;
      if (!w.crew) w.update(weaponDt, game);
    });
    this.trigger('tick', game, dt);
  }

  takeDamage(amount, game) {
    if (this.dead || this.god || this.invuln > 0 || game.clearing > 0) return;
    if (this.trigger('shield', game, amount)) return; // e.g. Nacre's pearl shell takes the hit
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
    const gained = amount * this.stats.growth;
    this.xp += gained;
    // Between dives, the character levels up from everything collected, and each weapon from
    // what was collected while it was carried.
    this.diveXp += gained;
    for (const w of this.weapons) w.diveXp += gained;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = CONFIG.xpToNext(this.level);
      game.queueLevelUp('normal');
      this.trigger('levelUp', game);
    }
  }

  /**
   * Put trinket `trinketId` in weapon `weaponId`'s slot (or its second socket, with Twin Sockets).
   * `weaponId` 'suit' is the Hollow Diver's own socket (Inner Shrine). It stays there for the
   * rest of the dive.
   */
  attachTrinket(weaponId, trinketId) {
    if (weaponId === 'suit') {
      if (!this.flags.innerShrine || this.shrine) return;
      this.shrine = { trinket: trinketId };
      this.recalcStats();
      return;
    }
    const w = this.getWeapon(weaponId);
    if (!w) return;
    if (!w.trinket) {
      w.trinket = trinketId;
      w.trinketState = {};
    } else if (this.flags.twinSockets && !w.trinket2) {
      w.trinket2 = trinketId;
      w.trinketState2 = {};
    } else return;
    this.recalcStats(); // its hooks join the others
  }

  /** How many more trinkets weapon `w` can take (1 normally, 2 with Twin Sockets). */
  freeSockets(w) {
    return (w.trinket ? 0 : 1) + (this.flags.twinSockets && !w.trinket2 ? 1 : 0);
  }

  /** Ids of every trinket found this dive: in your weapons, in the suit, and in weapons you ate. */
  get trinkets() {
    const ids = [];
    for (const w of [...this.weapons, ...this.eaten]) ids.push(...[w.trinket, w.trinket2].filter(Boolean));
    if (this.shrine) ids.push(this.shrine.trinket);
    return ids;
  }

  getWeapon(id) {
    return this.weapons.find((w) => w.id === id);
  }

  /** `strength`: how many levels the card that brought it was worth (stronger cards). */
  addWeapon(id, level = 1, strength = 1) {
    const weapon = new Weapon(id);
    weapon.level = Math.min(level, weapon.maxLevel);
    if (strength !== 1) weapon.power = weapon.level - 1 + strength;
    this.weapons.push(weapon);
    this.everCarried = Math.max(this.everCarried, this.weapons.length);
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
