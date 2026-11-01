import { CONFIG } from '../config.js';
import { TAU } from '../core/math.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Purely visual effects: particles, rings, laser beams and floating numbers. Uses Math.random (not the seeded RNG). */
export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.beams = [];
    this.bolts = [];
  }

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this.bolts.length = 0;
  }

  /** A jagged lightning arc that flickers out in a sixth of a second (Eel Lance). */
  lightning(x1, y1, x2, y2, color = '#bff6ff', width = 2) {
    if (this.bolts.length >= 200) return;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const n = Math.max(2, Math.round(len / 14));
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const jag = Math.min(11, len * 0.12);
    const pts = [x1, y1];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const off = (Math.random() * 2 - 1) * jag;
      pts.push(x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off);
    }
    pts.push(x2, y2);
    this.bolts.push({ pts, color, width, life: 0.16, maxLife: 0.16 });
    this.burst(x2, y2, color, 3, 90);
  }

  /** A laser beam that flashes and fades in a tenth of a second, with a small spark where it hits. */
  beam(x1, y1, x2, y2, color = '#7ff9ff', width = 1.5) {
    if (this.beams.length < 300) this.beams.push({ x1, y1, x2, y2, color, width, life: 0.1, maxLife: 0.1 });
    this.burst(x2, y2, color, 2, 70);
  }

  /** An expanding shockwave ring, e.g. for explosions. */
  ring(x, y, radius, color = '#ffb347') {
    if (this.rings.length < 60) this.rings.push({ x, y, radius, color, life: 0.35, maxLife: 0.35 });
  }

  burst(x, y, color, count = 8, speed = 140) {
    for (let i = 0; i < count && this.particles.length < CONFIG.effects.maxParticles; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 0.3 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  /** An air bubble that wobbles upward and fades. */
  bubble(x, y, size = 1.5 + Math.random() * 2.5) {
    if (this.particles.length >= CONFIG.effects.maxParticles) return;
    const life = 0.9 + Math.random() * 0.8;
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 12,
      vy: -22 - Math.random() * 20,
      life,
      maxLife: life,
      size,
      bubble: true,
      wobble: Math.random() * TAU,
    });
  }

  /** Floating text, e.g. damage numbers. */
  text(x, y, value, color = '#ffffff', size = 14) {
    if (!CONFIG.effects.damageNumbers || this.texts.length >= CONFIG.effects.maxTexts) return;
    this.texts.push({ x: x + (Math.random() - 0.5) * 10, y, text: String(value), color, size, life: 0.7, maxLife: 0.7 });
  }

  update(dt) {
    const drag = Math.exp(-4 * dt);
    for (const p of this.particles) {
      if (p.bubble) {
        p.x += (p.vx + Math.sin(p.life * 7 + p.wobble) * 10) * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= drag;
        p.vy *= drag;
      }
      p.life -= dt;
    }
    for (const t of this.texts) {
      t.y -= 32 * dt;
      t.life -= dt;
    }
    for (const r of this.rings) r.life -= dt;
    for (const b of this.beams) b.life -= dt;
    for (const b of this.bolts) b.life -= dt;
    removeExpired(this.particles);
    removeExpired(this.texts);
    removeExpired(this.rings);
    removeExpired(this.beams);
    removeExpired(this.bolts);
  }

  draw(ctx) {
    // Laser beams: a soft colored glow with a bright core
    ctx.lineCap = 'round';
    for (const b of this.beams) {
      const k = b.life / b.maxLife; // 1 → 0
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.globalAlpha = 0.4 * k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * 4;
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#f2ffff';
      ctx.lineWidth = b.width;
      ctx.stroke();
    }
    // Lightning: same glow-and-core look, along a jagged line
    ctx.lineJoin = 'round';
    for (const b of this.bolts) {
      const k = b.life / b.maxLife;
      ctx.beginPath();
      ctx.moveTo(b.pts[0], b.pts[1]);
      for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
      // a wide glow, a colored body and a white-hot core, so it reads on light sand and dark water alike
      ctx.globalAlpha = 0.4 * k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * 4.5;
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.lineWidth = b.width * 2;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.width * 0.8;
      ctx.stroke();
    }
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;

    for (const r of this.rings) {
      const k = r.life / r.maxLife; // 1 → 0
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 0.18 * k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.7 + 0.3 * (1 - k)), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2 + 4 * k;
      ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgb(225, 250, 255)';
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      if (p.bubble) {
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 2.5);
      ctx.font = `700 ${t.size}px ${FONT}`;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

function removeExpired(list) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (list[i].life > 0) list[w++] = list[i];
  list.length = w;
}
