import { drawDiver } from '../render/sprites.js';
import { Weapon } from './weapon.js';

export const CREW_DAMAGE = 0.35; // a crewmate's copies hit for 35% (Veteran Crew raises it)
const FOLLOW = 34; // how far behind you a crewmate swims...
const SIDE = 26; // ...and off to the side (the second mate takes the other side)
const CREW_HERO = {
  palette: { suit: '#dfe5ea', helmet: '#f08a3c', trim: '#7a3412', fins: '#2d3f52', gear: 'crew' },
};

/**
 * The Captain's crewmate: a smaller diver who swims at your side and fights with your weapons.
 *
 *   copying (default)  it fires its own copies of every weapon you carry, at reduced damage
 *   specialist         (talent) it stops copying and wields the weapon in your extra crew slot
 *                      at full strength (the weapon marked `w.crew`, see Player.update)
 *
 * How it fires your weapons: weapons aim from and scale by `game.player`, so while the
 * crewmate's weapons update, `game.player` is briefly a stand-in for you that sits where the
 * crewmate is, with damage scaled down. The stand-in shares your talents and flags, but its
 * attacks don't count as yours for trinkets (no weaponFire or shot events).
 */
export class Crewmate {
  constructor(game, slot = 0) {
    const p = game.player;
    this.kind = 'crew';
    this.slot = slot; // 0 = first mate, 1 = second mate
    this.x = this.px = this.rx = p.x - 30;
    this.y = this.py = this.ry = p.y + (slot === 0 ? 20 : -20);
    this.radius = 11;
    this.facingX = 1;
    this.facingY = 0;
    this.moving = false;
    this.hurtFlash = 0;
    this.hero = CREW_HERO;
    this.copies = new Map(); // weapon id -> its own copy of that weapon
    this.counters = {}; // the stand-in's own scratch space (so it doesn't use up your talents' state)
    this.downUntil = -1; // Lifeline: knocked out until this time
    this.dead = false;
  }

  /** Damage of its copies right now (Veteran Crew, All Hands on Deck). */
  copyDamage(game) {
    const p = game.player;
    if ((p.counters.allHandsUntil ?? -1) > game.time) return 1;
    return p.flags.crewDamage ?? CREW_DAMAGE;
  }

  /** The weapons it fires: copies of yours, or (specialist) the weapon in your crew slot. */
  weapons(game) {
    const p = game.player;
    if (p.flags.crewSpecialist) return this.slot === 0 ? p.weapons.filter((w) => w.crew) : [];
    const list = [];
    for (const w of p.weapons) {
      let copy = this.copies.get(w.id);
      if (!copy) {
        copy = new Weapon(w.id);
        this.copies.set(w.id, copy);
      }
      copy.level = w.level; // keep pace with your upgrades
      copy.crewScale = this.copyDamage(game); // for drones, which work out their damage later
      list.push(copy);
    }
    return list;
  }

  /** A stand-in for you at the crewmate's position, with its damage scale. */
  standIn(p, scale) {
    const s = Object.create(p);
    s.x = this.x;
    s.y = this.y;
    s.px = this.px;
    s.py = this.py;
    s.rx = this.rx;
    s.ry = this.ry;
    s.facingX = this.facingX;
    s.facingY = this.facingY;
    s.moving = this.moving;
    s.radius = this.radius;
    s.counters = this.counters;
    s.stats = scale === 1 ? p.stats : { ...p.stats, might: p.stats.might * scale };
    s.trigger = (event, game, payload) => (event === 'weaponFire' || event === 'shot' ? false : p.trigger(event, game, payload));
    return s;
  }

  /** Run `fn` with `game.player` standing in at the crewmate. */
  asCrew(game, scale, fn) {
    const p = game.player;
    game.player = this.standIn(p, scale);
    try {
      fn();
    } finally {
      game.player = p;
    }
  }

  update(dt, game) {
    const p = game.player;
    this.px = this.x;
    this.py = this.y;
    // Swim to its spot just behind you, off to one side.
    const side = this.slot === 0 ? 1 : -1;
    const tx = p.x - p.facingX * FOLLOW - p.facingY * SIDE * side;
    const ty = p.y - p.facingY * FOLLOW + p.facingX * SIDE * side;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    this.moving = d > 4;
    if (d > 0.5) {
      const step = Math.min(d, Math.min(d * 6, 380) * dt);
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    this.facingX = p.facingX;
    this.facingY = p.facingY;
    if (this.downUntil > game.time) return; // knocked out (Lifeline)

    const list = this.weapons(game);
    if (list.length === 0) return;
    const scale = p.flags.crewSpecialist ? 1 : this.copyDamage(game);
    // All Hands on Deck with a specialist: its weapon works twice as fast instead.
    const crewDt = p.flags.crewSpecialist && (p.counters.allHandsUntil ?? -1) > game.time ? dt * 2 : dt;
    this.asCrew(game, scale, () => {
      for (const w of list) w.update(crewDt, game);
    });
  }

  /** Reload every weapon it fires (Covering Fire). */
  reload(game) {
    for (const w of this.weapons(game)) w.timer = 0;
  }

  draw(ctx, game) {
    const down = this.downUntil > game.time;
    if (down) ctx.globalAlpha = 0.4;
    drawDiver(ctx, this, game.time);
    ctx.globalAlpha = 1;
    if (down) return;
    const list = this.weapons(game);
    this.asCrew(game, 1, () => {
      for (const w of list) {
        w.drawUnder(ctx, game);
        w.draw(ctx, game);
      }
    });
  }
}
