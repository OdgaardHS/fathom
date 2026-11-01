import { TAU } from '../core/math.js';

/**
 * Enemy movement "brains". Each one is `(enemy, dt, game) => void`.
 * Enemies pick one by name via `behavior` in src/data/enemies.js.
 * Use `enemy.state` for anything a behavior needs to remember between ticks,
 * and set enemy.dirX/dirY to where the sprite should face.
 */

function face(e, angle) {
  e.dirX = Math.cos(angle);
  e.dirY = Math.sin(angle);
}

function swim(e, angle, speed, dt) {
  e.x += Math.cos(angle) * speed * dt;
  e.y += Math.sin(angle) * speed * dt;
}

const angleToPlayer = (e, game) => Math.atan2(game.player.y - e.y, game.player.x - e.x);
const distToPlayer = (e, game) => Math.hypot(game.player.x - e.x, game.player.y - e.y);

export const BEHAVIORS = {
  /** Swim straight at the player. */
  chase(e, dt, game) {
    const a = angleToPlayer(e, game);
    face(e, a);
    swim(e, a, e.speed, dt);
  },

  /** Chase with a fish-like side-to-side wiggle. */
  school(e, dt, game) {
    const a = angleToPlayer(e, game) + Math.sin(game.time * 5 + e.id) * 0.35;
    face(e, a);
    swim(e, a, e.speed, dt);
  },

  /** Crab walk: faces the player but zig-zags toward them. */
  scuttle(e, dt, game) {
    const toward = angleToPlayer(e, game);
    face(e, toward);
    swim(e, toward + Math.sin(game.time * 3 + e.id * 1.7) * 0.9, e.speed, dt);
  },

  /** Jellyfish: drifts toward the player in pulses. */
  drift(e, dt, game) {
    const s = e.state;
    s.pulse = (s.pulse ?? e.id) + dt * 2.4;
    const push = Math.max(0, Math.sin(s.pulse));
    const a = angleToPlayer(e, game);
    face(e, a);
    swim(e, a, e.speed * (0.25 + 1.6 * push * push), dt);
  },

  /** Pufferfish: swims close, puffs up as a warning, then fires a ring of spines. */
  puffer(e, dt, game) {
    const s = e.state;
    const t = e.type;
    if (!s.phase) {
      s.phase = 'swim';
      s.cooldown = 1.5;
      s.inflate = 0;
    }

    if (s.phase === 'swim') {
      const a = angleToPlayer(e, game);
      face(e, a);
      swim(e, a, e.speed, dt);
      s.inflate = Math.max(0, s.inflate - dt * 2);
      s.cooldown -= dt;
      if (s.cooldown <= 0 && distToPlayer(e, game) < t.fireRange) {
        s.phase = 'inflate';
        s.timer = t.inflateTime;
      }
    } else if (s.phase === 'inflate') {
      s.timer -= dt;
      s.inflate = 1 - Math.max(0, s.timer) / t.inflateTime;
      if (s.timer <= 0) {
        const offset = game.rng.range(0, TAU);
        for (let i = 0; i < t.spines; i++) {
          game.spawnEnemyShot({
            x: e.x,
            y: e.y,
            angle: offset + (i / t.spines) * TAU,
            speed: t.spineSpeed,
            damage: t.spineDamage,
            radius: 5,
            life: 1.8,
            color: '#fff3b0',
            shape: 'spine',
          });
        }
        s.phase = 'swim';
        s.cooldown = t.cooldown;
      }
    }
  },

  /** Approach, stop and telegraph, then dash in a straight line. */
  charge(e, dt, game) {
    const s = e.state;
    const t = e.type;
    if (!s.phase) {
      s.phase = 'walk';
      s.cooldown = 1;
    }

    if (s.phase === 'walk') {
      const a = angleToPlayer(e, game);
      face(e, a);
      swim(e, a, e.speed, dt);
      s.cooldown -= dt;
      if (s.cooldown <= 0 && distToPlayer(e, game) < t.dashRange) {
        // Direction is locked in now, so the telegraph shows exactly where it will go.
        s.phase = 'windup';
        s.timer = t.windup;
      }
    } else if (s.phase === 'windup') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'dash';
        s.timer = t.dashTime;
      }
    } else if (s.phase === 'dash') {
      e.x += e.dirX * t.dashSpeed * dt;
      e.y += e.dirY * t.dashSpeed * dt;
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'walk';
        s.cooldown = t.dashCooldown;
      }
    }
  },

  /**
   * The Bleached Matriarch. Walks toward you, then alternates between
   * slamming her claws down (telegraphed circles) and calling her brood.
   * Below half health she gets faster and more aggressive.
   */
  matriarch(e, dt, game) {
    const s = e.state;
    const t = e.type;
    const enraged = e.hp < e.maxHp * 0.5;
    if (!s.phase) {
      s.phase = 'walk';
      s.timer = 3;
      s.step = 0;
    }

    if (s.phase === 'walk') {
      const a = angleToPlayer(e, game);
      // Surge to catch up when the player gets far away
      const gap = distToPlayer(e, game);
      const catchUp = gap > 280 ? Math.min(3.2, 1 + (gap - 280) / 120) : 1;
      face(e, a);
      swim(e, a, e.speed * (enraged ? 1.3 : 1) * catchUp, dt);
      s.timer -= dt;
      if (s.timer <= 0) {
        const pattern = ['slam', 'slam', 'brood'];
        s.attack = pattern[s.step++ % pattern.length];
        s.phase = 'windup';
        s.timer = 0.6;
      }
    } else if (s.phase === 'windup') {
      face(e, angleToPlayer(e, game));
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.attack === 'slam') matriarchSlam(e, game, enraged ? 5 : 3);
        else matriarchBrood(e, game, t.broodCount + (enraged ? 2 : 0));
        s.phase = 'recover';
        s.timer = 1;
      }
    } else if (s.phase === 'recover') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'walk';
        s.timer = enraged ? 2.5 : 4;
      }
    }
  },

  /** Shark: closes in, circles you for a while, then strikes in a telegraphed straight line. */
  stalk(e, dt, game) {
    const s = e.state;
    const t = e.type;
    if (!s.phase) {
      s.phase = 'approach';
      s.dir = e.id % 2 ? 1 : -1; // which way it circles
    }
    const toward = angleToPlayer(e, game);
    const d = distToPlayer(e, game);

    if (s.phase === 'approach') {
      face(e, toward);
      swim(e, toward, e.speed, dt);
      if (d < t.circleRadius + 30) {
        s.phase = 'circle';
        s.timer = t.circleTime;
      }
    } else if (s.phase === 'circle') {
      // Swim sideways around you, bending in or out to hold the circle's radius.
      const bend = Math.max(-0.7, Math.min(0.9, (d - t.circleRadius) / 80));
      const a = toward + s.dir * (Math.PI / 2 - bend);
      face(e, a);
      swim(e, a, e.speed * 1.1, dt);
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'windup';
        s.timer = t.windup;
        face(e, toward); // locked in: the telegraph shows exactly where it will go
      }
    } else if (s.phase === 'windup') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'dash';
        s.timer = t.dashTime;
      }
    } else if (s.phase === 'dash') {
      e.x += e.dirX * t.dashSpeed * dt;
      e.y += e.dirY * t.dashSpeed * dt;
      s.timer -= dt;
      if (s.timer <= 0) s.phase = 'approach';
    }
  },

  /** Squid: keeps its distance, drifts sideways, and spits slow ink blobs at you. */
  kite(e, dt, game) {
    const s = e.state;
    const t = e.type;
    if (s.cooldown === undefined) s.cooldown = 1 + (e.id % 10) * 0.15;
    const toward = angleToPlayer(e, game);
    const d = distToPlayer(e, game);
    let a;
    if (d > t.keepAway + 60) a = toward;
    else if (d < t.keepAway - 40) a = toward + Math.PI;
    else a = toward + (Math.PI / 2) * (e.id % 2 ? 1 : -1);
    swim(e, a, e.speed, dt);
    face(e, toward);

    s.cooldown -= dt;
    if (s.cooldown <= 0 && d < t.fireRange) {
      s.cooldown = t.cooldown;
      s.squirt = 0.25; // a quick squeeze, for the sprite
      game.spawnEnemyShot({
        x: e.x,
        y: e.y,
        angle: toward,
        speed: t.inkSpeed,
        damage: t.inkDamage,
        radius: 7,
        life: 2.4,
        color: t.palette.ink,
        shape: 'ink',
      });
    }
    s.squirt = Math.max(0, (s.squirt ?? 0) - dt);
  },

  /**
   * The Omen: a giant oarfish. Its whole long body hurts to touch. It weaves toward
   * you, then either lunges in a telegraphed line or calls in a school of mackerel.
   */
  serpent(e, dt, game) {
    const s = e.state;
    const t = e.type;
    const enraged = e.hp < e.maxHp * 0.5;
    if (!s.phase) {
      s.phase = 'swim';
      s.timer = 4;
      s.step = 0;
      s.wave = 0;
      s.trail = [];
      s.body = [];
    }

    if (s.phase === 'swim') {
      s.wave += dt * 3;
      const gap = distToPlayer(e, game);
      const catchUp = gap > 280 ? Math.min(3.2, 1 + (gap - 280) / 120) : 1;
      const a = angleToPlayer(e, game) + Math.sin(s.wave) * 0.6;
      face(e, a);
      swim(e, a, e.speed * (enraged ? 1.25 : 1) * catchUp, dt);
      s.timer -= dt;
      if (s.timer <= 0) {
        s.attack = ['lunge', 'lunge', 'school'][s.step++ % 3];
        if (s.attack === 'lunge') {
          s.phase = 'windup';
          s.timer = t.windup;
          face(e, angleToPlayer(e, game));
        } else {
          s.phase = 'call';
          s.timer = 0.8;
        }
      }
    } else if (s.phase === 'windup') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'dash';
        s.timer = t.dashTime;
      }
    } else if (s.phase === 'dash') {
      e.x += e.dirX * t.dashSpeed * dt;
      e.y += e.dirY * t.dashSpeed * dt;
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = 'swim';
        s.timer = enraged ? 2.5 : 4;
      }
    } else if (s.phase === 'call') {
      s.timer -= dt;
      if (s.timer <= 0) {
        serpentSchool(e, game, t.schoolSize + (enraged ? 4 : 0));
        s.phase = 'swim';
        s.timer = enraged ? 3 : 4.5;
      }
    }

    updateSerpentBody(e);
    serpentBodyContact(e, game);
  },
};

/** Remember where the head has been, then place body segments along that path. */
function updateSerpentBody(e) {
  const s = e.state;
  const t = e.type;
  const trail = s.trail;
  trail.unshift({ x: e.x, y: e.y });
  const needed = (t.segments + 1) * t.spacing;
  let total = 0;
  for (let i = 1; i < trail.length; i++) {
    total += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
    if (total > needed) {
      trail.length = i + 1;
      break;
    }
  }

  s.body = [];
  let walked = 0;
  let next = t.spacing;
  for (let i = 1; i < trail.length && s.body.length < t.segments; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    while (len > 0 && walked + len >= next && s.body.length < t.segments) {
      const u = (next - walked) / len;
      s.body.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      next += t.spacing;
    }
    walked += len;
  }
}

/** Radius of body segment i: thick at the neck, thin at the tail. */
export function serpentSegmentRadius(e, i) {
  const f = (i + 1) / (e.type.segments + 1);
  return e.radius * (0.85 - 0.6 * f);
}

function serpentBodyContact(e, game) {
  const p = game.player;
  const body = e.state.body;
  for (let i = 1; i < body.length; i++) {
    const r = serpentSegmentRadius(e, i) + p.radius;
    if ((body[i].x - p.x) ** 2 + (body[i].y - p.y) ** 2 < r * r) {
      p.takeDamage(e.damage * 0.6, game);
      return;
    }
  }
}

function serpentSchool(e, game, count) {
  const hpMult = game.spawner.hpMultiplier();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const d = e.radius + 20;
    game.spawnEnemy('mackerel', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, { hpMult, force: true });
  }
  game.effects.ring(e.x, e.y, 120, '#e5484d');
}

function matriarchSlam(e, game, count) {
  const { radius, delay, damage } = e.type.slam;
  const p = game.player;
  // First slam lands where you stand; the rest scatter around you.
  game.spawnHazard({ x: p.x, y: p.y, radius, delay, damage });
  for (let i = 1; i < count; i++) {
    const a = game.rng.range(0, TAU);
    const d = game.rng.range(90, 160);
    game.spawnHazard({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, radius, delay, damage });
  }
}

function matriarchBrood(e, game, count) {
  const hpMult = game.spawner.hpMultiplier();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const d = e.radius + 16;
    game.spawnEnemy('brood', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, { hpMult, force: true });
  }
}
