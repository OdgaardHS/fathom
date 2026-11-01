import { CONFIG } from '../config.js';
import { damp } from './math.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.viewW = CONFIG.view.minWidth; // visible world size
    this.viewH = CONFIG.view.minHeight;
    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeStrength = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /** Zoom so at least CONFIG.view.minWidth × minHeight world units are always visible. */
  resize(screenW, screenH) {
    this.zoom = Math.min(screenW / CONFIG.view.minWidth, screenH / CONFIG.view.minHeight);
    this.viewW = screenW / this.zoom;
    this.viewH = screenH / this.zoom;
  }

  snapTo(x, y) {
    this.x = x;
    this.y = y;
  }

  follow(x, y, dt) {
    this.x = damp(this.x, x, 10, dt);
    this.y = damp(this.y, y, 10, dt);
  }

  shake(strength, duration = 0.2) {
    if (!CONFIG.effects.screenShake) return;
    this.shakeStrength = Math.max(this.shakeTime > 0 ? this.shakeStrength : 0, strength);
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeDuration = this.shakeTime;
  }

  /** Visual-only update, runs every rendered frame. */
  update(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const k = this.shakeStrength * (this.shakeTime / this.shakeDuration);
      this.offsetX = (Math.random() * 2 - 1) * k;
      this.offsetY = (Math.random() * 2 - 1) * k;
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  /** Switch the context into world space. Pair with end(). */
  begin(ctx, screenW, screenH) {
    ctx.save();
    ctx.translate(screenW / 2, screenH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x + this.offsetX, -this.y + this.offsetY);
  }

  end(ctx) {
    ctx.restore();
  }

  isVisible(x, y, margin = 0) {
    return Math.abs(x - this.x) < this.viewW / 2 + margin && Math.abs(y - this.y) < this.viewH / 2 + margin;
  }
}
