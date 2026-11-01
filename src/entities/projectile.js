import { TAU } from '../core/math.js';
import { drawStarfish } from '../render/sprites.js';

const OUTLINE = 'rgba(10, 30, 40, 0.6)';

/** Harpoon projectiles; several Harpoon talents care about these. */
export const isHarpoon = (pr) => pr?.kind === 'harpoon';

/**
 * Damage that doesn't come from a projectile still says where it came from, so
 * talents can tell weapons apart (e.g. "your other weapons deal more damage").
 */
export const SOURCES = {
  starfish: { kind: 'starfish' },
  sonar: { kind: 'sonar' },
  poison: { kind: 'poison' },
  eel: { kind: 'eel' },
  inkcloud: { kind: 'inkcloud' }, // not 'ink': the glass squid's ink shots already use that shape name
  trident: { kind: 'trident' },
  bubble: { kind: 'bubble' },
  lure: { kind: 'lure' },
  snap: { kind: 'snap' },
  tendril: { kind: 'tendril' },
  eye: { kind: 'eye' },
};

/** Which weapon a hit came from: 'harpoon', 'dart', 'drone', 'pod', 'starfish', 'sonar', ... */
export const sourceKind = (source) => source?.owner?.kind ?? source?.kind ?? null;

/** Projectile or source kind -> the id of the weapon it belongs to (trinkets care about this). */
const KIND_WEAPON = {
  harpoon: 'harpoon',
  dart: 'darts',
  pod: 'drones',
  drone: 'drones', // drone lasers come from the drone itself
  starfish: 'starfish',
  sonar: 'sonar',
  eel: 'eel',
  inkcloud: 'ink',
  trident: 'trident',
  bubble: 'bubbles',
  lure: 'lure',
  snap: 'shrimp',
  tendril: 'tendrils',
  eye: 'eye',
};

/** The weapon id ('harpoon', 'drones', ...) a hit or projectile came from, or null (poison, enemies). */
export function weaponOf(source) {
  const id = source?.weapon; // projectiles store the id (a drone's `weapon` is its launcher instead)
  return typeof id === 'string' ? id : (KIND_WEAPON[sourceKind(source)] ?? null);
}

/** Something flying through the water. Used for the player's shots and enemy shots alike. */
export class Projectile {
  constructor({
    x,
    y,
    angle,
    speed,
    damage,
    pierce = 0, // how many extra enemies it can pass through
    radius = 6,
    life = 2, // seconds before it disappears
    knockback = 0,
    color = '#ffffff',
    shape = 'orb', // how it looks: 'harpoon' | 'dart' | 'star' | 'spine' | 'ink' | 'pod' | 'bubble' | 'cavitation' | 'orb'
    kind = shape, // what it is, for talents: 'harpoon' | 'dart' | 'pod' | 'starfish' | ...
    owner = null, // who fired it (e.g. a drone); passed to hit/kill hooks instead of the projectile
    onEnd = null, // called once when it hits its last enemy or runs out
    hits = true, // false: flies through enemies without touching them (drone pods)
    generation = 0, // how many times it has chained/split from another projectile
    ignore = null, // an enemy it should never hit (the one it split or bounced off)
    onHit = null, // (projectile, enemy, game): does the hit itself instead of dealing `damage` (Bubble Net traps)
    selfTrinkets = false, // its weapon applies Undertow Stone and Split Coral its own way (Pistol Shrimp Claw)
  }) {
    this.x = this.px = this.rx = x;
    this.y = this.py = this.ry = y;
    this.angle = angle;
    this.speed = speed;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.pierce = pierce;
    this.radius = radius;
    this.life = life;
    this.maxLife = life;
    this.age = 0;
    this.knockback = knockback;
    this.color = color;
    this.shape = shape;
    this.kind = kind;
    this.owner = owner;
    this.onEnd = onEnd;
    this.hits = hits;
    this.generation = generation;
    this.onHit = onHit;
    this.selfTrinkets = selfTrinkets;
    this.returned = false;
    this.returning = null; // Undertow Stone: who it's flying back to
    this.weapon = KIND_WEAPON[kind] ?? null; // which of the player's weapons fired it
    this.hitList = new Set(); // enemies already hit, so piercing shots don't hit twice
    if (ignore) this.hitList.add(ignore);
    this.dead = false;
  }

  update(dt) {
    this.px = this.x;
    this.py = this.y;
    if (this.returning) {
      // Reeled back: steer toward the target and stop on reaching it.
      const t = this.returning;
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= t.radius + this.speed * dt) {
        this.reeledIn = true;
        this.dead = true;
        return;
      }
      this.angle = Math.atan2(dy, dx);
      this.vx = (dx / d) * this.speed;
      this.vy = (dy / d) * this.speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  /** Turn around toward (x, y) with a fresh life and can hit everything again (Tidal Ring). */
  turnBack(x, y) {
    this.angle = Math.atan2(y - this.y, x - this.x);
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.life = this.maxLife;
    this.age = 0;
    this.returned = true;
    this.dead = false;
    this.hitList.clear();
  }

  /**
   * Undertow Stone: fly back to `target` (the player) once, at `damageMult` damage, passing
   * through every enemy on the way except `keep` (the enemy it just stopped in, so it doesn't
   * hit that one twice in a row).
   */
  reelBack(target, damageMult, keep = null) {
    this.returning = target;
    this.returned = true;
    this.dead = false;
    this.damage *= damageMult;
    this.pierce = 999; // nothing stops the pull
    this.life = 4; // safety limit; it normally reaches you long before this
    this.hitList.clear();
    if (keep) this.hitList.add(keep);
  }

  draw(ctx) {
    if (this.shape === 'harpoon') {
      drawHarpoon(ctx, this.rx, this.ry, this.angle, this.radius / 6, this.color);
      return;
    }
    if (this.shape === 'star') {
      drawStarfish(ctx, this.rx, this.ry, this.radius, this.age * 12, this.color);
      return;
    }

    // Shapes are drawn for a radius of 6 and scaled to the real size.
    const s = this.radius / 6;
    ctx.save();
    ctx.translate(this.rx, this.ry);
    ctx.rotate(this.angle);
    ctx.scale(s, s);

    switch (this.shape) {
      case 'dart':
        ctx.fillStyle = this.color;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-6, -3.5);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-6, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'pod':
        ctx.fillStyle = this.color;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-8, -4.5, 15, 9, 4.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#7ff9ff';
        ctx.beginPath();
        ctx.arc(4, 0, 2, 0, TAU);
        ctx.fill();
        break;

      case 'ink':
        // A wobbling blob of squid ink with a smeared trail
        ctx.fillStyle = 'rgba(70, 40, 110, 0.35)';
        ctx.beginPath();
        ctx.arc(-7, 0, 4, 0, TAU);
        ctx.moveTo(-9.5, 0);
        ctx.arc(-12, 0, 2.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(150, 110, 210, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 6 + Math.sin(this.age * 20) * 0.6, 0, TAU);
        ctx.fill();
        ctx.stroke();
        break;

      case 'bubble': {
        // A big wobbling air bubble with a bright highlight
        const wob = Math.sin(this.age * 9) * 0.5;
        ctx.rotate(-this.angle); // highlights stay on top whatever way it flies
        ctx.fillStyle = 'rgba(190, 240, 255, 0.18)';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6 + wob, 6 - wob, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.ellipse(-2.4, -2.6, 1.6, 0.9, -0.7, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2.6, 2.2, 0.6, 0, TAU);
        ctx.fill();
        break;
      }

      case 'cavitation':
        // A streaking, flickering cavitation bubble
        ctx.fillStyle = 'rgba(200, 245, 255, 0.25)';
        ctx.beginPath();
        ctx.ellipse(-8, 0, 9, 3.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 4.2 + Math.sin(this.age * 60) * 0.6, 0, TAU);
        ctx.fill();
        ctx.stroke();
        break;

      case 'spine':
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(60, 40, 10, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-6, -3);
        ctx.lineTo(-3.5, 0);
        ctx.lineTo(-6, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      default:
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
  }
}

/** A harpoon pointing along `angle`. Also used for Maelstrom's circling harpoons. */
export function drawHarpoon(ctx, x, y, angle, scale = 1, color = '#eef3f7') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#cfc8b4';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(6, 0);
  ctx.stroke();
  ctx.strokeStyle = '#e46b5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-22, -4);
  ctx.moveTo(-18, 0);
  ctx.lineTo(-22, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(4, -5);
  ctx.lineTo(6.5, 0);
  ctx.lineTo(4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
