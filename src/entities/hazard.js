import { TAU } from '../core/math.js';

const AFTERMATH = 0.35; // seconds the impact ring stays visible

/**
 * A telegraphed area attack: a warning circle fills up over `delay` seconds,
 * then everything inside gets hit once. Used by bosses; reusable for things
 * like erupting vents later.
 */
export class Hazard {
  constructor({ x, y, radius, delay, damage, color = '255, 90, 90' }) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.delay = delay;
    this.timer = delay;
    this.damage = damage;
    this.color = color; // "r, g, b"
    this.fired = false;
    this.after = AFTERMATH;
    this.dead = false;
  }

  update(dt, game) {
    if (!this.fired) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fired = true;
        const p = game.player;
        const reach = this.radius + p.radius;
        if ((p.x - this.x) ** 2 + (p.y - this.y) ** 2 < reach * reach) p.takeDamage(this.damage, game);
        game.camera.shake(4, 0.15);
        game.audio.play('slam');
        game.effects.burst(this.x, this.y, '#e8e2d6', 10, 160);
      }
    } else {
      this.after -= dt;
      if (this.after <= 0) this.dead = true;
    }
  }

  draw(ctx) {
    if (!this.fired) {
      const k = 1 - this.timer / this.delay; // 0 → 1 as it charges
      ctx.fillStyle = `rgba(${this.color}, ${0.08 + 0.12 * k})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${this.color}, 0.85)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `rgba(${this.color}, 0.25)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * k, 0, TAU);
      ctx.fill();
    } else {
      const k = this.after / AFTERMATH; // 1 → 0
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * k})`;
      ctx.lineWidth = 6 * k + 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * (1.15 - 0.15 * k), 0, TAU);
      ctx.stroke();
    }
  }
}
