import { TAU } from '../core/math.js';
import { drawDrone } from '../render/sprites.js';

const RANGE = 230; // how far a drone sees and shoots (× size stat)
const LASER_KNOCKBACK = 25;
const REFRACT_REACH = 140; // Refraction: how far a laser bounces on (× size stat)
const SHIP_SPEED = 260; // Mothership: how fast it flies to the newest landing spot
const BANK_MAX = 5; // Capacitor Bank: most shots a drone can save up
const HIVE_REACH = 160; // Hive: drones this close to each other count as neighbours
const HIVE_STEP = 0.08; // Hive: +8% attack rate per neighbour...
const HIVE_MAX = 3; // ...up to 3× as fast

/**
 * An attack drone. The Drone Launcher flings one pod per launch into the water around you;
 * where it lands, a drone deploys and holds that spot, firing instant lasers at any enemy that
 * comes in range until its charge runs out. Drones don't follow you. There's no limit on how
 * many can be out.
 *
 * Shared stats keep their normal meaning:
 *   life × duration, fire rate × attack speed, damage × might, range × size,
 *   launches per second × haste, and amount: every laser also hits that many other enemies.
 * Talents (player.flags) change how drones behave, not those meanings.
 *
 * Mothership (talent): one big drone holds the launched drones as `charges` instead. Each
 * charge runs out on its own, and the ship's damage is the sum of the charges inside it.
 */
export class Drone {
  constructor(x, y, weapon, game, { power = 1, size = 1 } = {}) {
    const p = game.player;
    this.kind = 'drone';
    this.x = this.px = this.rx = x;
    this.y = this.py = this.ry = y;
    this.homeX = x; // the spot it holds
    this.homeY = y;
    this.weapon = weapon;
    this.born = game.time;
    this.size = size;
    this.radius = 9 * size;
    this.maxLife = weapon.stats.droneLife * p.stats.duration;
    this.life = this.maxLife;
    this.power = power; // damage multiplier (Conductor Coil overcharges drones to 3)
    this.fireTimer = 0.25;
    this.bank = 0; // Capacitor Bank: shots saved up while nothing is in range
    this.neighbours = 0; // Hive: other drones close by
    this.hiveTimer = 0;
    this.charges = null; // Mothership: [{ until, power }]
    this.bob = Math.random() * TAU; // visual only
    this.target = null;
    this.retarget = 0;
    const away = Math.atan2(y - p.y, x - p.x); // face outward from where it was flung
    this.dirX = Math.cos(away);
    this.dirY = Math.sin(away);
    this.dead = false;
  }

  /** Mothership: take in a newly launched drone and fly to where its pod landed. */
  absorb(x, y, game, power = 1) {
    this.charges ??= [];
    this.maxLife = this.weapon.stats.droneLife * game.player.stats.duration;
    this.charges.push({ until: game.time + this.maxLife, power });
    this.homeX = x;
    this.homeY = y;
    this.syncCharges(game);
  }

  /** Mothership: drop charges that ran out, and work out power and remaining life. */
  syncCharges(game) {
    const left = [];
    for (const c of this.charges) {
      if (c.until > game.time) left.push(c);
      else game.chargeExpired(this, c.power); // each charge runs out like a drone would
    }
    this.charges = left;
    this.power = left.reduce((sum, c) => sum + c.power, 0);
    this.life = left.reduce((most, c) => Math.max(most, c.until - game.time), 0);
    this.size = Math.min(3.2, 1.6 + 0.12 * left.length); // grows with every drone inside
    this.radius = 9 * this.size;
  }

  /** Damage per shot right now. */
  damage(game) {
    // crewScale: a crewmate's copy of the Drone Launcher launches weaker drones
    return this.weapon.stats.droneDamage * game.player.stats.might * this.power * (this.weapon.crewScale ?? 1);
  }

  /** Shots per second right now. */
  fireRate(game) {
    const p = game.player;
    const f = p.flags;
    let rate = this.weapon.stats.fireRate * p.stats.attackSpeed;
    if (p.hasBuff('overclock')) rate *= 2;
    if (f.veteran) rate *= 1 + 0.05 * (game.time - this.born); // Veteran Drones
    if (f.burnout && this.life < 3) rate *= 2; // Burnout
    if (f.hive) rate *= Math.min(HIVE_MAX, 1 + HIVE_STEP * this.neighbours); // Hive
    return rate;
  }

  range(game) {
    return RANGE * game.player.stats.area * (this.charges ? 1.25 : 1);
  }

  update(dt, game) {
    this.px = this.x;
    this.py = this.y;
    const p = game.player;
    const f = p.flags;

    if (this.charges) {
      this.syncCharges(game);
      if (this.charges.length === 0) {
        game.expireDrone(this, 'expired');
        return;
      }
    } else {
      this.life -= dt;
      if (this.life <= 0) {
        game.expireDrone(this, 'expired');
        return;
      }
    }

    // Hold position. A Mothership flies over to its newest landing spot.
    if (this.charges) {
      const dx = this.homeX - this.x;
      const dy = this.homeY - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const step = Math.min(d, SHIP_SPEED * dt);
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
    }

    if (f.hive) {
      this.hiveTimer -= dt;
      if (this.hiveTimer <= 0) {
        this.hiveTimer = 0.25;
        this.neighbours = game.dronesNear(this.x, this.y, HIVE_REACH) - 1;
      }
    }

    const range = this.range(game);
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || this.target.dead || !this.inRange(this.target, range)) {
      this.retarget = 0.2;
      this.target = this.findTarget(game, range);
    }
    const t = this.target;
    if (t) {
      const a = Math.atan2(t.y - this.y, t.x - this.x);
      this.dirX = Math.cos(a);
      this.dirY = Math.sin(a);
    }

    if (f.kamikaze) {
      this.updateMine(dt, game, t);
      return;
    }
    if (f.linkedFire) return; // fires only in bursts, when you launch

    if (!t && !f.capacitor) return; // wait, ready to fire, until something comes in range
    this.fireTimer -= dt * this.fireRate(game);
    if (this.fireTimer > 0) return;
    this.fireTimer = 1;
    if (!t) {
      this.bank = Math.min(BANK_MAX, this.bank + 1); // Capacitor Bank: save the shot for later
      return;
    }
    const pulses = 1 + this.bank; // Capacitor Bank: saved shots all go at once
    this.bank = 0;
    this.fire(game, t, pulses);
  }

  /** Kamikaze: wait where it landed, then dive into the first enemy in range and explode. */
  updateMine(dt, game, t) {
    if (!t) return;
    const p = game.player;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    const reach = t.radius + this.radius;
    if (d <= reach) {
      game.explode(this.x, this.y, 55 * p.stats.area * Math.sqrt(this.size), this.damage(game) * 4, '#ffb347', this);
      game.hastenLaunch(0.5); // each blast brings the next launch closer
      game.expireDrone(this, 'exploded');
      return;
    }
    const step = Math.min(d, 330 * p.stats.attackSpeed * dt); // attack speed = how fast they dive
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  /**
   * Fire `pulses` lasers at `target`. Each pulse also hits (amount stat) other enemies in
   * range, never the same one twice, so amount helps against crowds rather than bosses.
   */
  fire(game, target, pulses = 1) {
    const range = this.range(game);
    for (let i = 0; i < pulses; i++) {
      let t = target;
      if (t.dead) t = this.findTarget(game, range); // it died to an earlier pulse
      if (!t) break;
      const others = this.nearestOthers(game, range, t, game.player.stats.amount);
      this.laser(game, t);
      for (const o of others) this.laser(game, o);
    }
    game.audio.play('droneShot');
  }

  /** One instant laser hit on `e`, drawn as a short-lived beam. */
  laser(game, e) {
    if (e.dead) return;
    const p = game.player;
    const ship = Boolean(this.charges);
    const damage = this.damage(game);
    const color = this.power > 1 && !ship ? '#ffe066' : '#7ff9ff';
    const width = (ship ? 2.6 : 1.5) * Math.min(this.size, 2.2);
    const hits = [e];
    let endX = e.x;
    let endY = e.y;
    if (ship) {
      // A Mothership's laser punches through to the next enemy behind its target.
      const behind = this.nextAlongBeam(game, e, width);
      if (behind) {
        hits.push(behind);
        endX = behind.x;
        endY = behind.y;
      }
    }
    game.effects.beam(this.x, this.y, endX, endY, color, width);
    for (const t of hits) this.laserHit(game, t, damage);

    // Refraction: the laser bounces on to one more enemy nearby at 70% damage.
    if (p.flags.refraction) {
      const reach = REFRACT_REACH * p.stats.area;
      let next = null;
      let best = reach * reach;
      for (const o of game.enemiesNear(e.x, e.y, reach)) {
        if (o.dead || hits.includes(o)) continue;
        const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d2 < best) {
          best = d2;
          next = o;
        }
      }
      if (next) {
        game.effects.beam(e.x, e.y, next.x, next.y, color, width * 0.7);
        this.laserHit(game, next, damage * 0.7);
      }
    }
  }

  laserHit(game, e, damage) {
    if (e.dead) return;
    e.hit(damage, game, LASER_KNOCKBACK, this.x, this.y, this);
    game.player.trigger('hit', game, { enemy: e, projectile: this });
  }

  /** Mothership: the nearest enemy behind `e` on the line from the ship through `e`. */
  nextAlongBeam(game, e, width) {
    const dx = e.x - this.x;
    const dy = e.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const reach = this.range(game) * 0.6;
    let best = null;
    let bestT = Infinity;
    for (const o of game.enemiesNear(e.x + ux * reach * 0.5, e.y + uy * reach * 0.5, reach * 0.5)) {
      if (o === e || o.dead) continue;
      const t = (o.x - e.x) * ux + (o.y - e.y) * uy; // distance past e along the beam
      if (t <= 0 || t > reach) continue;
      const side = Math.abs((o.x - e.x) * uy - (o.y - e.y) * ux); // distance from the beam
      if (side <= o.radius + width * 2 && t < bestT) {
        bestT = t;
        best = o;
      }
    }
    return best;
  }

  /** The `count` nearest enemies in range other than `exclude`, nearest first. */
  nearestOthers(game, range, exclude, count) {
    if (count <= 0) return [];
    return game
      .enemiesNear(this.x, this.y, range)
      .filter((o) => !o.dead && o !== exclude && this.inRange(o, range))
      .sort((a, b) => (a.x - this.x) ** 2 + (a.y - this.y) ** 2 - ((b.x - this.x) ** 2 + (b.y - this.y) ** 2))
      .slice(0, count);
  }

  /** Linked Fire: a burst of `count` lasers at whatever is in range. */
  volley(game, count) {
    if (this.dead) return;
    const t = this.target && !this.target.dead ? this.target : this.findTarget(game, this.range(game));
    if (t) this.fire(game, t, count);
  }

  inRange(e, range) {
    const reach = range + e.radius;
    return (e.x - this.x) ** 2 + (e.y - this.y) ** 2 <= reach * reach;
  }

  /** Nearest enemy in range of this drone. Bosses and elites count as closer, so drones focus them. */
  findTarget(game, range) {
    let best = null;
    let bestD2 = Infinity;
    for (const e of game.enemiesNear(this.x, this.y, range)) {
      if (e.dead || !this.inRange(e, range)) continue;
      let d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
      if (e.boss || e.elite) d2 *= 0.15;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  draw(ctx, game) {
    // Hover gently in place
    const bob = Math.sin(game.time * 2.2 + this.bob) * 1.5;
    this.ry += bob;
    drawDrone(ctx, this, game.time, game.player.hasBuff('overclock'), false);
    this.ry -= bob;
    if (this.bank > 0) {
      // Capacitor Bank: one pip per saved shot
      for (let i = 0; i < this.bank; i++) {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(this.rx - (this.bank - 1) * 3 + i * 6, this.ry - this.radius - 7, 2, 0, TAU);
        ctx.fill();
      }
    }
  }
}
