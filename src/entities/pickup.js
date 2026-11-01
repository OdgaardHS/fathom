import { TAU } from '../core/math.js';

// Pearls (XP) change color and size as their value grows.
const PEARL_TIERS = [
  { max: 4, color: '#f4efe2', glow: 'rgba(255, 250, 235, 0.25)', size: 4.5 },
  { max: 19, color: '#8ff0ff', glow: 'rgba(143, 240, 255, 0.3)', size: 6 },
  { max: Infinity, color: '#ff9ecf', glow: 'rgba(255, 158, 207, 0.35)', size: 8 },
];

/** Things lying on the sea floor. kind: 'xp' | 'heal' | 'magnet' | 'chest'. */
export class Pickup {
  constructor(kind, x, y, value = 0) {
    this.kind = kind;
    this.x = this.px = this.rx = x;
    this.y = this.py = this.ry = y;
    this.value = value;
    this.radius = kind === 'xp' ? 6 : 11;
    this.trinket = false; // chests: also holds a trinket (dropped by elites)
    this.magnetized = false; // flying toward the player
    this.speed = 0;
    this.dead = false;
  }

  update(dt, game) {
    this.px = this.x;
    this.py = this.y;

    const p = game.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    let d = Math.hypot(dx, dy);

    // Only pearls are pulled in by the pickup radius; other pickups must be swum over.
    if (!this.magnetized && this.kind === 'xp' && d < p.stats.magnet) {
      this.magnetized = true;
      this.speed = 150;
    }

    if (this.magnetized && d > 0) {
      this.speed = Math.min(this.speed + 1600 * dt, 1100);
      const step = Math.min(d, this.speed * dt);
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      d -= step;
    }

    if (d < p.radius + this.radius) game.collectPickup(this);
  }

  draw(ctx, game) {
    const x = this.rx;
    const y = this.ry;

    switch (this.kind) {
      case 'xp': {
        const tier = PEARL_TIERS.find((t) => this.value <= t.max);
        const s = tier.size;
        ctx.fillStyle = tier.glow;
        ctx.beginPath();
        ctx.arc(x, y, s * 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = tier.color;
        ctx.strokeStyle = 'rgba(0, 40, 50, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(x - s * 0.35, y - s * 0.35, s * 0.3, 0, TAU);
        ctx.fill();
        break;
      }

      case 'heal':
        ctx.fillStyle = '#e5484d';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1.75, y - 5, 3.5, 10);
        ctx.fillRect(x - 5, y - 1.75, 10, 3.5);
        break;

      case 'magnet':
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#e5484d';
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 7);
        ctx.lineTo(x - 6, y);
        ctx.arc(x, y, 6, Math.PI, 0, true);
        ctx.lineTo(x + 6, y - 7);
        ctx.stroke();
        ctx.strokeStyle = '#dfe3ee';
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 8);
        ctx.lineTo(x - 6, y - 4);
        ctx.moveTo(x + 6, y - 8);
        ctx.lineTo(x + 6, y - 4);
        ctx.stroke();
        break;

      case 'chest': {
        if (this.supply) {
          // The Captain's supply crate: a slatted wooden crate on a little float
          ctx.fillStyle = 'rgba(255, 209, 102, 0.18)';
          ctx.beginPath();
          ctx.arc(x, y, 22, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#9a6b34';
          ctx.strokeStyle = '#4a3014';
          ctx.lineWidth = 2;
          ctx.fillRect(x - 11, y - 11, 22, 22);
          ctx.strokeRect(x - 11, y - 11, 22, 22);
          ctx.beginPath();
          ctx.moveTo(x - 11, y - 11);
          ctx.lineTo(x + 11, y + 11);
          ctx.moveTo(x + 11, y - 11);
          ctx.lineTo(x - 11, y + 11);
          ctx.stroke();
          ctx.fillStyle = '#ff6b4a';
          ctx.beginPath();
          ctx.arc(x, y - 15, 4, 0, TAU);
          ctx.fill();
          break;
        }
        // Trinket chests glow sea-glass blue and carry a gem on the lid.
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
        const glow = this.trinket ? '127, 200, 255' : '255, 209, 102';
        ctx.fillStyle = `rgba(${glow}, ${0.12 + 0.15 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, this.trinket ? 26 : 22, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#8a5a24';
        ctx.fillRect(x - 12, y - 8, 24, 17);
        ctx.fillStyle = this.trinket ? '#9fd8ff' : '#ffd166';
        ctx.fillRect(x - 12, y - 8, 24, 6);
        ctx.fillStyle = '#3f2a10';
        ctx.fillRect(x - 2, y - 3, 4, 6);
        if (this.trinket) {
          ctx.fillStyle = '#e8f7ff';
          ctx.beginPath();
          ctx.moveTo(x, y - 15);
          ctx.lineTo(x + 4, y - 10);
          ctx.lineTo(x, y - 6);
          ctx.lineTo(x - 4, y - 10);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
    }
  }
}
