import { CONFIG } from '../config.js';
import { TAU } from '../core/math.js';

/**
 * Decides when, where and what enemies appear, following the level's timeline and events. Most
 * arrive in packs (a school of one kind from one side, every few seconds); the rest trickle in.
 */
export class Spawner {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.timeline = level.timeline;
    this.events = level.events ?? [];
    this.budget = 0; // fractional enemies owed to the trickle; one spawns each time this passes 1
    this.packBudget = 0; // enemies owed to the next pack
    this.packTimer = 2; // the first pack comes early
    this.nextEvent = 0;
    this.poolCache = new Map();
  }

  phase() {
    let current = this.timeline[0];
    for (const p of this.timeline) if (this.game.time >= p.at) current = p;
    return current;
  }

  /** Enemies per second right now. Keeps rising after the last scripted phase. */
  currentRate() {
    const last = this.timeline[this.timeline.length - 1];
    const overtime = Math.max(0, this.game.time - last.at);
    return this.phase().rate * (1 + overtime / 120);
  }

  /** Health multiplier for enemies spawned now. `base` false leaves out CONFIG.enemies.hpBase (final bosses). */
  hpMultiplier(base = true) {
    const { hpBase, hpScalePerMinute } = CONFIG.enemies;
    return (base ? hpBase : 1) * (1 + (this.game.time / 60) * hpScalePerMinute) * (this.level.enemyHp ?? 1);
  }

  update(dt) {
    const g = this.game;
    const rate = this.currentRate();
    const { packShare, packEvery } = CONFIG.enemies;
    this.budget += rate * dt * (1 - packShare);
    this.packBudget += rate * dt * packShare;

    this.packTimer -= dt;
    if (this.packTimer <= 0) {
      this.packTimer = g.rng.range(packEvery[0], packEvery[1]);
      const n = Math.floor(this.packBudget);
      this.packBudget -= n;
      if (n > 0) this.spawnPack(n);
    }

    if (this.budget >= 1) {
      const pool = this.poolEntries(this.phase());
      while (this.budget >= 1) {
        this.budget -= 1;
        const { id } = g.rng.weighted(pool);
        const pos = this.edgePosition();
        g.spawnEnemy(id, pos.x, pos.y, { hpMult: this.hpMultiplier() });
      }
    }

    while (this.nextEvent < this.events.length && g.time >= this.events[this.nextEvent].at) {
      this.runEvent(this.events[this.nextEvent++]);
    }
  }

  /** A school of `n` enemies of one kind (picked from this phase's pool), from one side of the screen. */
  spawnPack(n) {
    const g = this.game;
    const { id } = g.rng.weighted(this.poolEntries(this.phase()));
    const c = this.edgePosition(undefined, 50);
    const spread = 36 + Math.sqrt(n) * 14;
    const hpMult = this.hpMultiplier();
    for (let i = 0; i < n; i++) g.spawnEnemy(id, c.x + g.rng.range(-spread, spread), c.y + g.rng.range(-spread, spread), { hpMult });
  }

  poolEntries(phase) {
    let entries = this.poolCache.get(phase);
    if (!entries) {
      entries = Object.entries(phase.pool).map(([id, weight]) => ({ id, weight }));
      this.poolCache.set(phase, entries);
    }
    return entries;
  }

  /** A point just outside the visible area, in direction `angle` from the player. */
  edgePosition(angle = this.game.rng.range(0, TAU), extra = 0) {
    const { player, camera } = this.game;
    const margin = CONFIG.enemies.spawnMargin + extra;
    const halfW = camera.viewW / 2 + margin;
    const halfH = camera.viewH / 2 + margin;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Stretch the direction until it hits the rectangle around the screen.
    const t = Math.min(halfW / Math.max(Math.abs(cos), 1e-6), halfH / Math.max(Math.abs(sin), 1e-6));
    return { x: player.x + cos * t, y: player.y + sin * t };
  }

  runEvent(ev) {
    const g = this.game;
    // a depth's final boss has its own listed health, without CONFIG.enemies.hpBase
    const hpMult = this.hpMultiplier(!ev.final) * (ev.hpMult ?? 1);

    switch (ev.type) {
      case 'ring': {
        const r = Math.hypot(g.camera.viewW, g.camera.viewH) / 2 + CONFIG.enemies.spawnMargin;
        for (let i = 0; i < ev.count; i++) {
          const a = (i / ev.count) * TAU;
          g.spawnEnemy(ev.enemy, g.player.x + Math.cos(a) * r, g.player.y + Math.sin(a) * r, { hpMult, force: true });
        }
        g.audio.play('warning');
        break;
      }
      case 'swarm': {
        const c = this.edgePosition(undefined, 80);
        for (let i = 0; i < ev.count; i++) {
          g.spawnEnemy(ev.enemy, c.x + g.rng.range(-70, 70), c.y + g.rng.range(-70, 70), { hpMult, force: true });
        }
        g.audio.play('warning');
        break;
      }
      case 'boss': {
        const pos = this.edgePosition(undefined, 40);
        const e = g.spawnEnemy(ev.enemy, pos.x, pos.y, { hpMult, elite: Boolean(ev.elite), force: true });
        if (ev.final) {
          e.final = true;
          g.audio.setIntensity('boss');
        }
        g.audio.play(ev.final ? 'bossArrive' : 'eliteArrive');
        break;
      }
      case 'omen':
        g.theme.omen(ev.omen, g);
        g.audio.play('omen', { close: ev.omen.endsWith('Close') });
        break;
      case 'message':
        break; // the message below is the whole event
      default:
        console.warn(`Unknown level event type "${ev.type}"`);
    }

    if (ev.message) g.announce(ev.message);
  }
}
