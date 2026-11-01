import { TAU } from '../core/math.js';
import { ELITE } from '../data/enemies.js';
import { SOURCES, sourceKind } from './projectile.js';
import { SPRITES } from '../render/sprites.js';
import { BEHAVIORS } from './behaviors.js';

let nextId = 1;

/** Start numbering enemies from 1 again. Behaviours use the id for variety, so seeded dives must reset it. */
export function resetEnemyIds() {
  nextId = 1;
}

export class Enemy {
  constructor(type, x, y, hpMult = 1, elite = false) {
    this.id = nextId++;
    this.type = type;
    this.elite = elite;
    this.boss = Boolean(type.boss);
    this.final = false; // killing it clears the depth (set by the spawner)

    this.x = this.px = this.rx = x;
    this.y = this.py = this.ry = y;
    this.radius = type.radius * (elite ? ELITE.size : 1);
    this.mass = this.radius * this.radius; // bigger enemies shove smaller ones aside

    this.speed = type.speed;
    this.damage = type.damage * (elite ? ELITE.damage : 1);
    this.maxHp = this.hp = type.hp * hpMult;
    this.xp = type.xp * (elite ? ELITE.xp : 1);
    this.color = type.color;
    this.knockbackResist = type.knockbackResist ?? 0;

    this.dirX = 0; // facing, set by behaviors
    this.dirY = 1;
    this.kbx = 0; // knockback velocity
    this.kby = 0;
    this.flash = 0;
    this.rooted = 0; // seconds left pinned in place
    this.markedUntil = -1; // game time a mark wears off
    this.markedBy = null; // which weapon marked it (other weapons get the bonus)
    this.poisonStacks = 0;
    this.poisonTime = 0;
    this.poisonDps = 0;
    this.poisonTick = 0.5;
    this.poisonPending = 0;
    this.slowLeft = 0; // seconds left slowed (ink, bubbles, stings)
    this.slowFactor = 1; // how fast it moves and acts while slowed (0.6 = 40% slower)
    this.inkedUntil = -1; // game time it leaves an ink cloud (Murky Water)
    this.gazedUntil = -1; // game time the Watching Eye looked away (Evil Eye)
    this.trapUntil = -1; // game time its bubble pops (Bubble Net)
    this.dead = false;
    this.state = {}; // scratch space for behaviors
  }

  get name() {
    return this.elite ? `Elite ${this.type.name}` : this.type.name;
  }

  update(dt, game) {
    this.px = this.x;
    this.py = this.y;

    // Slowed enemies move and act at a fraction of the speed.
    let moveDt = dt;
    if (this.slowLeft > 0) {
      moveDt *= this.slowFactor;
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) this.slowFactor = 1;
    }
    if (this.rooted > 0) this.rooted -= dt;
    else BEHAVIORS[this.type.behavior](this, moveDt, game);

    if (this.kbx !== 0 || this.kby !== 0) {
      this.x += this.kbx * dt;
      this.y += this.kby * dt;
      const decay = Math.exp(-12 * dt);
      this.kbx *= decay;
      this.kby *= decay;
      if (Math.abs(this.kbx) + Math.abs(this.kby) < 2) this.kbx = this.kby = 0;
    }
    this.flash = Math.max(0, this.flash - dt);
    if (this.poisonTime > 0) this.updatePoison(dt, game);
  }

  /** Poison deals its damage in small ticks, twice a second. */
  updatePoison(dt, game) {
    this.poisonTime -= dt;
    this.poisonPending += this.poisonDps * this.poisonStacks * dt;
    this.poisonTick -= dt;
    if (this.poisonTick <= 0 || this.poisonTime <= 0) {
      this.poisonTick = 0.5;
      const dmg = this.poisonPending;
      this.poisonPending = 0;
      if (dmg > 0) this.hit(dmg, game, 0, this.x, this.y, SOURCES.poison);
    }
    if (this.poisonTime <= 0) this.poisonStacks = 0;
  }

  /** Move instantly (no interpolation streak). */
  teleport(x, y) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.kbx = this.kby = 0;
    if (this.state.trail) this.state.trail.length = 0; // long-bodied enemies regrow their body
  }

  /**
   * Damage this enemy. Knockback pushes it away from (fromX, fromY).
   * `source` (optional) is whatever dealt the hit, e.g. a drone, for kill hooks.
   */
  hit(damage, game, knockback = 0, fromX = this.x, fromY = this.y, source = null) {
    if (this.dead) return;
    damage *= game.damageBonus(this, source); // marks, Cascade
    this.hp -= damage;
    this.flash = 0.08;
    const poisoned = sourceKind(source) === 'poison';
    game.effects.text(this.x, this.y - this.radius, Math.round(damage), poisoned ? '#9be15d' : undefined);
    if (!poisoned) game.audio.play(this.boss || this.elite ? 'bigHit' : 'hit', { size: this.radius });
    this.knock(knockback, fromX, fromY);
    if (this.hp <= 0) game.killEnemy(this, source);
  }

  /** Push away from (fromX, fromY). Heavy enemies resist. */
  knock(strength, fromX, fromY) {
    if (strength <= 0 || this.knockbackResist >= 1) return;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy);
    if (d === 0) return;
    const k = strength * (1 - this.knockbackResist);
    this.kbx = clampMagnitude(this.kbx + (dx / d) * k, 500);
    this.kby = clampMagnitude(this.kby + (dy / d) * k, 500);
  }

  /** Hold in place (bosses can't be pinned). */
  root(seconds) {
    if (!this.boss) this.rooted = Math.max(this.rooted, seconds);
  }

  /**
   * Slow to `factor` of normal speed (0.6 = 40% slower) for `seconds`. The strongest slow wins.
   * Bosses and elites shrug off half of it.
   */
  slow(factor, seconds) {
    if (this.boss || this.elite) factor = 1 - (1 - factor) * 0.5;
    this.slowFactor = this.slowLeft > 0 ? Math.min(this.slowFactor, factor) : factor;
    this.slowLeft = Math.max(this.slowLeft, seconds);
  }

  /** Marked enemies take extra damage from your other weapons (not the one that marked them). */
  mark(until, by) {
    if (until > this.markedUntil) {
      this.markedUntil = until;
      this.markedBy = by;
    }
  }

  /** Stacks up to 5; each new dose refreshes the timer. */
  poison(dps, seconds) {
    this.poisonStacks = Math.min(5, (this.poisonTime > 0 ? this.poisonStacks : 0) + 1);
    this.poisonDps = dps;
    this.poisonTime = Math.max(this.poisonTime, seconds);
  }

  /** `shadows` is false in open water, where there's no seabed to cast them on. */
  draw(ctx, time, shadows = true) {
    const x = this.rx;
    const y = this.ry;
    const r = this.radius;

    // Soft shadow on the sea floor (light comes from above)
    if (shadows) {
      ctx.fillStyle = 'rgba(0, 25, 35, 0.22)';
      ctx.beginPath();
      ctx.ellipse(x + r * 0.3, y + r * 0.9, r * 0.95, r * 0.38, 0, 0, TAU);
      ctx.fill();
    }

    // Lunge tell: show the dash path while winding up
    if (this.state.phase === 'windup' && this.type.dashSpeed) {
      const len = this.type.dashSpeed * this.type.dashTime;
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.25)';
      ctx.lineWidth = r * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + this.dirX * len, y + this.dirY * len);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    if (this.elite) {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.14)';
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.45, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    SPRITES[this.type.sprite](ctx, this, time);

    // Status markers: pinned (pale dashed ring), marked (cyan brackets), poisoned (green dots)
    if (this.poisonTime > 0) {
      ctx.fillStyle = 'rgba(155, 225, 93, 0.85)';
      for (let i = 0; i < this.poisonStacks; i++) {
        const a = time * 2 + (i / this.poisonStacks) * TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15, 2.2, 0, TAU);
        ctx.fill();
      }
    }
    if (this.slowLeft > 0 && this.slowFactor < 0.95) {
      // slowed: a pale blue arc underneath
      ctx.strokeStyle = 'rgba(150, 185, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.2, 0.35, Math.PI - 0.35);
      ctx.stroke();
    }
    if (this.rooted > 0) {
      ctx.strokeStyle = 'rgba(225, 235, 240, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.markedUntil > time) {
      ctx.strokeStyle = 'rgba(127, 249, 255, 0.85)';
      ctx.lineWidth = 2;
      const m = r * 1.35;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(x + sx * m, y + sy * m * 0.5);
        ctx.lineTo(x + sx * m, y + sy * m);
        ctx.lineTo(x + sx * m * 0.5, y + sy * m);
      }
      ctx.stroke();
    }
  }
}

function clampMagnitude(v, max) {
  return v > max ? max : v < -max ? -max : v;
}
