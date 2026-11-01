import { TAU, dist2 } from '../core/math.js';
import { SOURCES } from '../entities/projectile.js';
import { drawStarfish } from '../render/sprites.js';
import { WEAPON_TALENTS } from './talents.js';
import { UNDERTOW_RETURN } from './trinkets.js';
import { bubbles } from './weapons/bubbles.js';
import { eel } from './weapons/eel.js';
import { eye } from './weapons/eye.js';
import { ink } from './weapons/ink.js';
import { lure } from './weapons/lure.js';
import { shrimp } from './weapons/shrimp.js';
import { tendrils } from './weapons/tendrils.js';
import { trident } from './weapons/trident.js';

/**
 * Weapon definitions. Any character can start with any unlocked weapon, and
 * more weapons can be picked up during a dive. Each weapon has:
 *   name, icon, color, description
 *   tags        shared stats it leans on (steers talent offers toward fitting talents)
 *   scaling     { stat: how } for every shared stat its attack uses, keyed like passive
 *               tags (damage, cooldown, area, duration, amount, attackSpeed). Passive cards
 *               show the icons of the carried weapons a passive affects, with `how` on hover.
 *   talents     its share of the talent pool while you carry it (data/talents.js)
 *   levels      stats per level (index 0 = level 1). `text` describes what that level adds.
 *   apply(b, rank, player, flags)  optional built-in passive while you carry it
 *   passiveText optional, describes that passive on the weapon select screen
 *   hud(game)   optional extra HUD line (e.g. drone count)
 *   layer       'under' draws below enemies (auras); default draws on top
 *   create(w)   optional, set up w.state when the weapon is gained
 *   update(w, dt, game)  every tick: count down w.timer, fire, deal damage.
 *                        Call game.weaponFired(w) once per regular attack (volley,
 *                        launch, pulse) and scale it by what it returns, so trinkets
 *                        like Pilot Fish and Conductor Coil work with the weapon.
 *   draw(w, ctx, game)   optional, for weapons that are visible on their own
 *   drawUnder(w, ctx, game)  optional extra layer below the enemies
 *   foundFrom   optional depth id: only offered on level-ups from that depth down, and
 *               only a starting weapon once you've taken it on a dive (foundText says so)
 *   onPilot(w, seconds, game)  optional: what Pilot Fish's "sooner" means for a weapon
 *                              without a cooldown
 *
 * The five original weapons live in this file; newer ones each have a file in ./weapons/.
 *
 * `w` is the Weapon instance: w.stats (current level), w.timer, w.state, w.def.
 * Always scale by the player's shared stats so passives work everywhere:
 *   damage × might, size × area, cooldown × cooldown, count + amount,
 *   shot travel time × duration, repeated-attack rate × attackSpeed.
 * Talents switch on behaviour through player.flags (see each weapon's update).
 */
export const WEAPONS = {
  harpoon: {
    name: 'Harpoon',
    icon: 'Hp',
    color: '#eef3f7',
    description: 'Fires harpoons at the nearest enemy. Steady, long range.',
    tags: ['amount', 'cooldown', 'damage'],
    scaling: {
      damage: 'more damage',
      cooldown: 'fires more often',
      area: 'bigger harpoons',
      duration: 'harpoons fly further',
      amount: 'more harpoons per volley',
    },
    talents: WEAPON_TALENTS.harpoon,
    range: 650,
    levels: [
      { damage: 10, cooldown: 0.8, count: 1, pierce: 0, speed: 420 },
      { damage: 10, cooldown: 0.8, count: 2, pierce: 0, speed: 420, text: '+1 harpoon' },
      { damage: 14, cooldown: 0.7, count: 2, pierce: 0, speed: 450, text: '+4 damage, fires faster' },
      { damage: 14, cooldown: 0.7, count: 3, pierce: 1, speed: 450, text: '+1 harpoon, pierces 1 enemy' },
      { damage: 19, cooldown: 0.6, count: 3, pierce: 1, speed: 480, text: '+5 damage, fires faster' },
      { damage: 24, cooldown: 0.5, count: 4, pierce: 2, speed: 500, text: '+1 harpoon, +5 damage, +1 pierce' },
    ],
    update(w, dt, game) {
      w.timer -= dt;
      if (w.timer > 0) return;
      const p = game.player;
      const target = game.nearestEnemy(p.x, p.y, w.def.range);
      if (!target) return; // hold fire until something is in range

      const s = w.stats;
      w.timer = s.cooldown * p.stats.cooldown;
      w.state.volleys = (w.state.volleys ?? 0) + 1;
      const power = game.weaponFired(w);
      const shoot = (angle) =>
        game.spawnProjectile({
          x: p.x,
          y: p.y,
          angle,
          speed: s.speed,
          damage: s.damage * p.stats.might * power.damage,
          pierce: s.pierce,
          radius: 6 * p.stats.area * power.size,
          life: 1.8 * p.stats.duration,
          knockback: 150,
          color: power.color ?? w.def.color,
          shape: 'harpoon',
        });

      const count = s.count + p.stats.amount;
      const aim = Math.atan2(target.y - p.y, target.x - p.x);
      for (let i = 0; i < count; i++) shoot(aim + (i - (count - 1) / 2) * 0.15);

      // Ring Volley: every third volley also goes out in every direction.
      if (p.flags.ringVolley && w.state.volleys % 3 === 0) {
        const n = 8 + p.stats.amount * 2;
        const offset = game.rng.range(0, TAU);
        for (let i = 0; i < n; i++) shoot(offset + (i / n) * TAU);
      }
    },
  },

  drones: {
    name: 'Drone Launcher',
    icon: 'Dr',
    color: '#ffc43d',
    description: 'Flings a drone pod into the water around you. It deploys an attack drone that holds that spot and fires instant lasers at anything that comes close. No limit on how many drones are out.',
    tags: ['duration', 'attackSpeed', 'cooldown', 'amount'],
    scaling: {
      damage: 'more damage',
      cooldown: 'launches more often',
      area: 'drones see and shoot further',
      duration: 'drones last longer',
      amount: 'each laser also hits one more enemy',
      attackSpeed: 'drones fire faster',
    },
    talents: WEAPON_TALENTS.drones,
    range: 600, // launches only while an enemy is this close
    fling: [110, 200], // how far from you pods land
    hud(game) {
      return `${game.player.droneCount} drones`;
    },
    // One drone per launch, always. Levels make drones hit harder, fire faster, last longer
    // and launch more often instead.
    levels: [
      { cooldown: 2.4, droneDamage: 5, droneLife: 8, fireRate: 1.4 },
      { cooldown: 2.4, droneDamage: 5, droneLife: 10, fireRate: 1.4, text: 'Drones last 2 seconds longer' },
      { cooldown: 2.0, droneDamage: 6, droneLife: 10, fireRate: 1.4, text: 'Launches faster, +1 drone damage' },
      { cooldown: 2.0, droneDamage: 7, droneLife: 10, fireRate: 1.6, text: '+1 drone damage, drones fire faster' },
      { cooldown: 1.6, droneDamage: 8, droneLife: 10, fireRate: 1.6, text: 'Launches faster, +1 drone damage' },
      { cooldown: 1.35, droneDamage: 10, droneLife: 12, fireRate: 1.8, text: '+2 drone damage, launches faster, drones last longer' },
    ],
    update(w, dt, game) {
      w.timer -= dt;
      if (w.timer > 0) return;
      const p = game.player;
      const target = game.nearestEnemy(p.x, p.y, w.def.range);
      if (!target) return; // hold until something is in range

      const s = w.stats;
      w.timer = s.cooldown * p.stats.cooldown;
      w.state.launches = (w.state.launches ?? 0) + 1;
      w.state.lastLaunch = game.time;
      const power = game.weaponFired(w);
      // Linked Fire: drones only shoot when you launch, all at once.
      if (p.flags.linkedFire) game.droneVolley(p.hasBuff('overclock') ? 8 : 4);

      // Fling one pod out into the water. The direction turns by the golden angle every
      // launch, so drones from launch after launch spread evenly around you.
      w.state.spin = ((w.state.spin ?? game.rng.range(0, TAU)) + GOLDEN_ANGLE) % TAU;
      const [near, far] = w.def.fling;
      const reach = p.flags.hive ? 0.5 : 1; // Hive: pods land closer, so drones crowd together
      const dist = game.rng.range(near, far) * reach;
      game.spawnProjectile({
        x: p.x,
        y: p.y,
        angle: w.state.spin + game.rng.range(-0.25, 0.25),
        speed: POD_SPEED,
        damage: 0,
        hits: false, // the pod flies over enemies; only the drone fights
        radius: 7 * power.size,
        life: dist / POD_SPEED,
        color: power.color ?? w.def.color,
        shape: 'pod',
        onEnd: (pod) => game.launchDrone(pod.x, pod.y, w, power.charged),
      });
    },
  },

  darts: {
    name: 'Needle Darts',
    icon: 'Nd',
    color: '#c8f3ff',
    description: 'Fires fast, piercing darts the way you are swimming, snapping onto enemies ahead. Stop swimming and they aim at the nearest enemy.',
    tags: ['amount', 'cooldown'],
    scaling: {
      damage: 'more damage',
      cooldown: 'fires more often',
      area: 'bigger darts',
      duration: 'darts fly further',
      amount: 'more darts per volley',
    },
    talents: WEAPON_TALENTS.darts,
    range: 450, // how far the darts' aim assist looks for enemies
    levels: [
      { damage: 9, cooldown: 0.5, count: 1, pierce: 1, speed: 640 },
      { damage: 9, cooldown: 0.5, count: 2, pierce: 1, speed: 640, text: '+1 dart' },
      { damage: 11, cooldown: 0.45, count: 2, pierce: 2, speed: 680, text: '+2 damage, +1 pierce, fires faster' },
      { damage: 11, cooldown: 0.4, count: 3, pierce: 2, speed: 680, text: '+1 dart, fires faster' },
      { damage: 14, cooldown: 0.36, count: 4, pierce: 3, speed: 720, text: '+1 dart, +3 damage, +1 pierce' },
    ],
    update(w, dt, game) {
      w.timer -= dt;
      if (w.timer > 0) return;
      const p = game.player;
      const f = p.flags;
      const s = w.stats;
      w.timer = s.cooldown * p.stats.cooldown;
      const power = game.weaponFired(w);

      const count = s.count + p.stats.amount;
      const aim = dartAim(w, game);
      const dart = (x, y, angle, extra) => {
        const options = {
          x,
          y,
          angle,
          speed: s.speed,
          damage: s.damage * p.stats.might,
          pierce: s.pierce,
          radius: 5 * p.stats.area,
          life: 0.8 * p.stats.duration,
          knockback: 80,
          color: power.color ?? w.def.color,
          shape: 'dart',
          ...extra,
        };
        options.damage *= power.damage;
        options.radius *= power.size;
        return game.spawnProjectile(options);
      };

      // Sniper: one huge dart carrying the whole volley's damage.
      if (f.sniper) {
        dart(p.x, p.y, aim, {
          damage: s.damage * p.stats.might * count * 1.2,
          pierce: 999,
          radius: 9 * p.stats.area,
          speed: s.speed * 1.25,
          life: 1.0 * p.stats.duration,
          knockback: 200,
        });
        return;
      }
      // Needle Cyclone: a full circle of darts, twice as many, no pierce.
      if (f.cyclone) {
        const n = count * 2;
        w.state.spin = ((w.state.spin ?? 0) + 0.4) % TAU;
        for (let i = 0; i < n; i++) dart(p.x, p.y, w.state.spin + (i / n) * TAU, { pierce: 0 });
        return;
      }

      const volley = (dir, n) => {
        const sideX = -Math.sin(dir);
        const sideY = Math.cos(dir);
        for (let i = 0; i < n; i++) {
          const k = i - (n - 1) / 2;
          if (f.wideFan) dart(p.x, p.y, dir + k * 0.22); // Wide Fan: spread out
          else dart(p.x + sideX * k * 12, p.y + sideY * k * 12, dir); // side by side
        }
      };
      volley(aim, count);
      if (f.rearGuard) volley(aim + Math.PI, Math.ceil(count / 2));
    },
  },

  starfish: {
    name: 'Razor Starfish',
    icon: 'Sf',
    color: '#ff9f5a',
    description: 'Razor-edged starfish circle you, cutting through anything that gets close.',
    tags: ['attackSpeed', 'area', 'amount'],
    scaling: {
      damage: 'more damage',
      area: 'wider orbit, bigger starfish',
      amount: 'more starfish',
      attackSpeed: 'spin faster and cut more often',
    },
    talents: WEAPON_TALENTS.starfish,
    hitInterval: 0.45, // seconds before a starfish can hit the same enemy again
    levels: [
      { damage: 10, count: 3, radius: 74, spin: 3.0, size: 12 },
      { damage: 13, count: 3, radius: 80, spin: 3.2, size: 12, text: '+3 damage, wider orbit' },
      { damage: 13, count: 4, radius: 84, spin: 3.5, size: 12, text: '+1 starfish, spins faster' },
      { damage: 16, count: 4, radius: 90, spin: 3.7, size: 13, text: '+3 damage, wider orbit' },
      { damage: 18, count: 5, radius: 96, spin: 3.9, size: 13, text: '+1 starfish, +2 damage, spins faster' },
    ],
    create(w) {
      w.state.angle = 0;
      w.state.nextHit = new Map(); // enemy id -> game time it can be hit again
    },
    update(w, dt, game) {
      const s = w.stats;
      const p = game.player;
      const f = p.flags;
      const st = w.state;
      const shielded = f.starShield && (st.shieldUntil ?? 0) > game.time;
      st.angle = (st.angle + s.spin * p.stats.attackSpeed * (shielded ? 1.5 : 1) * dt) % TAU;

      // Supernova: every so often the orbit flares out and back.
      if (f.supernova) {
        st.novaTimer = (st.novaTimer ?? 8) - dt;
        if (st.novaTimer <= 0) {
          st.novaTimer = 8 * p.stats.cooldown;
          st.novaStart = game.time;
        }
      }

      const { orbit, size, angles } = starfishLayout(w, game);
      const damage = s.damage * p.stats.might;
      for (const a of angles) {
        const bx = p.x + Math.cos(a) * orbit;
        const by = p.y + Math.sin(a) * orbit;
        const hits = game
          .enemiesNear(bx, by, size)
          .filter((e) => !e.dead && dist2(bx, by, e.x, e.y) <= (e.radius + size) ** 2 && (st.nextHit.get(e.id) ?? 0) <= game.time);
        for (const e of hits) {
          st.nextHit.set(e.id, game.time + w.def.hitInterval / p.stats.attackSpeed);
          if (f.tidalPull) {
            // Knock "away from" a point behind the enemy = toward the player.
            e.hit(damage, game, 0, p.x, p.y, SOURCES.starfish);
            e.knock(220, e.x + (e.x - p.x), e.y + (e.y - p.y));
          } else {
            e.hit(damage, game, 250, p.x, p.y, SOURCES.starfish);
          }
          p.trigger('hit', game, { enemy: e, projectile: SOURCES.starfish });
          game.audio.play('starfish');
        }
        // Star Shield: starfish swat enemy shots out of the water.
        if (f.starShield) {
          for (const shot of game.enemyShots) {
            if (shot.dead || dist2(bx, by, shot.x, shot.y) > (size + shot.radius) ** 2) continue;
            shot.dead = true;
            st.shieldUntil = game.time + 2;
            game.effects.burst(shot.x, shot.y, w.def.color, 4, 80);
          }
        }
      }

      // Thrown Stars: a spare starfish gets thrown at the nearest enemy now and then.
      if (f.thrownStars) {
        st.throwTimer = (st.throwTimer ?? 4) - dt;
        const target = st.throwTimer <= 0 ? game.nearestEnemy(p.x, p.y, 500) : null;
        if (target) {
          st.throwTimer = 4 * p.stats.cooldown;
          game.spawnProjectile({
            x: p.x,
            y: p.y,
            angle: Math.atan2(target.y - p.y, target.x - p.x),
            speed: 380,
            damage: damage * 1.5,
            pierce: 2,
            radius: size,
            life: 1.2 * p.stats.duration,
            knockback: 150,
            color: w.def.color,
            shape: 'star',
            kind: 'starfish',
          });
        }
      }

      // Forget expired entries so the map doesn't grow forever.
      if (st.nextHit.size > 300) {
        for (const [id, t] of st.nextHit) if (t <= game.time) st.nextHit.delete(id);
      }
    },
    draw(w, ctx, game) {
      const p = game.player;
      const { orbit, size, angles } = starfishLayout(w, game);
      for (const a of angles) {
        const x = p.rx + Math.cos(a) * orbit;
        const y = p.ry + Math.sin(a) * orbit;
        drawStarfish(ctx, x, y, size, a * 2, w.def.color);
      }
    },
  },

  sonar: {
    name: 'Sonar Pulse',
    icon: 'So',
    color: '#7fe7ff',
    description: 'Sends out pulses that hurt every enemy close to you.',
    tags: ['area', 'cooldown'],
    scaling: {
      damage: 'more damage',
      cooldown: 'pulses more often',
      area: 'bigger pulse',
    },
    talents: WEAPON_TALENTS.sonar,
    layer: 'under',
    pulseTime: 0.35, // length of the visual pulse
    waveTime: 0.6, // how long a Shockwave takes to roll out
    returnTime: 0.4, // how long an Undertow Stone pulse takes to roll back in
    levels: [
      { damage: 8, radius: 92, interval: 0.7 },
      { damage: 10, radius: 100, interval: 0.7, text: '+2 damage, larger' },
      { damage: 10, radius: 108, interval: 0.6, text: 'Larger, pulses faster' },
      { damage: 13, radius: 116, interval: 0.55, text: '+3 damage, larger' },
      { damage: 16, radius: 126, interval: 0.5, text: '+3 damage, larger, pulses faster' },
    ],
    create(w) {
      w.state.pulse = 0;
      w.state.pulses = 0;
      w.state.waves = [];
      w.state.resonance = new Map(); // enemy id -> { n: pulses in a row, last: pulse number }
    },
    update(w, dt, game) {
      const s = w.stats;
      const p = game.player;
      const f = p.flags;
      const st = w.state;
      st.pulse = Math.max(0, st.pulse - dt);
      updateWaves(w, game);

      // Echo: a half-strength repeat shortly after each pulse.
      if (st.echoAt !== undefined && game.time >= st.echoAt) {
        st.echoAt = undefined;
        sonarPulse(w, game, 0.5, false);
      }

      w.timer -= dt;
      if (w.timer > 0) return;
      w.timer = s.interval * p.stats.cooldown;
      st.pulses++;
      const power = game.weaponFired(w);
      // A bigger pulse grows in area, not radius: "double size" doubles the area it covers.
      const size = Math.sqrt(power.size);
      const stun = f.stunPulse && st.pulses % 3 === 0;
      const undertow = w.trinket === 'undertowStone';
      const radius = s.radius * p.stats.area * size;
      if (f.shockwave) {
        // With Undertow Stone the wave rolls back in once it reaches full size (see updateWaves).
        st.waves.push({ start: game.time, hit: new Set(), stun, front: 0, mult: power.damage, size, undertow });
        st.pulse = w.def.pulseTime;
      } else {
        sonarPulse(w, game, power.damage, true, stun, size);
        if (undertow) st.waves.push(inwardWave(game.time + w.def.pulseTime * 0.5, radius, power.damage));
      }
      if (power.charged) game.effects.ring(p.x, p.y, radius * (f.shockwave ? 3 : 1), power.color);
      if (f.echo) st.echoAt = game.time + 0.4;

      if (st.resonance.size > 400) {
        for (const [id, r] of st.resonance) if (r.last < st.pulses - 1) st.resonance.delete(id);
      }
    },
    draw(w, ctx, game) {
      const p = game.player;
      const radius = w.stats.radius * p.stats.area;
      const t = w.state.pulse / w.def.pulseTime; // 1 right after a pulse, fading to 0

      ctx.fillStyle = 'rgba(127, 231, 255, 0.06)';
      ctx.strokeStyle = 'rgba(127, 231, 255, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.rx, p.ry, radius, 0, TAU);
      ctx.fill();
      ctx.stroke();

      for (const wave of w.state.waves) {
        if (game.time < wave.start) continue;
        if (wave.inward) ctx.strokeStyle = 'rgba(110, 160, 235, 0.8)';
        else ctx.strokeStyle = wave.stun ? 'rgba(255, 255, 255, 0.8)' : 'rgba(160, 240, 255, 0.75)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.rx, p.ry, Math.max(1, wave.front), 0, TAU);
        ctx.stroke();
      }
      if (t > 0 && !p.flags.shockwave) {
        // Two rings racing outward
        for (const lag of [0, 0.35]) {
          const k = Math.min(1, 1 - t + lag * t);
          ctx.strokeStyle = `rgba(160, 240, 255, ${0.7 * t})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.rx, p.ry, radius * (0.2 + 0.8 * k), 0, TAU);
          ctx.stroke();
        }
      }
    },
  },

  eel,
  ink,
  trident,
  bubbles,
  lure,
  shrimp,
  tendrils,
  eye,
};

/**
 * Weapons whose attack uses any of these stats (passive tags), with how each one uses them.
 * `only` (optional): weapon ids to limit the list to, e.g. the weapons you're carrying.
 */
export function weaponsUsing(tags = [], only = null) {
  const list = [];
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (only && !only.includes(id)) continue;
    const how = tags.map((t) => w.scaling?.[t]).filter(Boolean);
    if (how.length === 0) continue;
    list.push({ id, name: w.name, icon: w.icon, color: w.color, how: how.join(', ') });
  }
  return list;
}

// ------------------------------------------------------------ drone helpers

const POD_SPEED = 430;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees: spreads launches evenly

// ------------------------------------------------------------ dart helpers

const DART_ASSIST = 0.6; // radians either side of your heading that darts will snap to an enemy

/**
 * Darts fly the way you swim, nudged onto the nearest enemy roughly ahead of you.
 * Standing still, they aim at the nearest enemy in any direction.
 */
function dartAim(w, game) {
  const p = game.player;
  const heading = Math.atan2(p.facingY, p.facingX);
  let best = null;
  let bestD2 = w.def.range * w.def.range;
  for (const e of game.enemiesNear(p.x, p.y, w.def.range)) {
    if (e.dead) continue;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 >= bestD2) continue;
    if (p.moving) {
      let off = Math.atan2(e.y - p.y, e.x - p.x) - heading;
      off = Math.atan2(Math.sin(off), Math.cos(off)); // wrap to -PI..PI
      if (Math.abs(off) > DART_ASSIST) continue;
    }
    best = e;
    bestD2 = d2;
  }
  return best ? Math.atan2(best.y - p.y, best.x - p.x) : heading;
}

// ------------------------------------------------------------ starfish helpers

/** Where the starfish are right now (shared by update and draw so they always agree). */
function starfishLayout(w, game) {
  const s = w.stats;
  const p = game.player;
  const f = p.flags;
  const st = w.state;
  const count = s.count + p.stats.amount;
  let orbit = s.radius * p.stats.area * (f.starShield ? 0.8 : 1);
  if (f.supernova && st.novaStart !== undefined) {
    const k = (game.time - st.novaStart) / (1.2 * p.stats.duration);
    if (k >= 0 && k < 1) orbit *= 1 + 2 * Math.sin(k * Math.PI);
  }
  const size = s.size * p.stats.area * (1 + (st.growth ?? 0));
  const angles = [];
  for (let i = 0; i < count; i++) {
    const dir = f.counterSpin && i % 2 === 1 ? -1 : 1; // Counter-Spin: every other one goes the other way
    angles.push(dir * st.angle + (i / count) * TAU);
  }
  return { orbit, size, angles };
}

// ------------------------------------------------------------ sonar helpers

function sonarPulse(w, game, mult, main, stun = false, size = 1) {
  const s = w.stats;
  const p = game.player;
  w.state.pulse = w.def.pulseTime;
  const radius = s.radius * p.stats.area * size;
  const hits = game
    .enemiesNear(p.x, p.y, radius)
    .filter((e) => !e.dead && dist2(p.x, p.y, e.x, e.y) <= (radius + e.radius) ** 2);
  for (const e of hits) sonarHit(w, game, e, s.damage * p.stats.might * mult, stun, main);
  if (stun) game.effects.ring(p.x, p.y, radius, '#ffffff');
}

function sonarHit(w, game, e, damage, stun, main) {
  const p = game.player;
  const f = p.flags;
  const st = w.state;
  // Resonance: hit by pulses in a row = more damage each time.
  if (f.resonance && main) {
    const r = st.resonance.get(e.id);
    const n = r && r.last === st.pulses - 1 ? Math.min(5, r.n + 1) : 1;
    st.resonance.set(e.id, { n, last: st.pulses });
    damage *= 1 + 0.2 * (n - 1);
  }
  e.hit(damage, game, f.concussive ? 300 : 100, p.x, p.y, SOURCES.sonar);
  if (stun) e.root(0.6 * p.stats.duration);
  p.trigger('hit', game, { enemy: e, projectile: SOURCES.sonar });
}

/** Undertow Stone: a ring that rolls from radius `from` back in to you, at reduced damage. */
function inwardWave(start, from, mult) {
  return { start, hit: new Set(), stun: false, front: from, inward: true, from, mult: mult * UNDERTOW_RETURN };
}

/**
 * Rings that sweep across the water, hitting each enemy once: Shockwave rings roll
 * outward to 3x the pulse size, Undertow Stone rings roll back in to you.
 */
function updateWaves(w, game) {
  const st = w.state;
  if (st.waves.length === 0) return;
  const p = game.player;
  const damage = w.stats.damage * p.stats.might;
  const band = 24;
  const keep = [];
  for (const wave of st.waves) {
    const t = game.time - wave.start;
    if (t < 0) {
      keep.push(wave); // hasn't started yet
      continue;
    }
    const reach = wave.inward ? wave.from : w.stats.radius * p.stats.area * 3 * wave.size;
    const speed = reach / (wave.inward ? w.def.returnTime : w.def.waveTime);
    wave.front = wave.inward ? reach - t * speed : t * speed;
    const hits = game.enemiesNear(p.x, p.y, Math.max(0, wave.front) + band).filter((e) => {
      if (e.dead || wave.hit.has(e.id)) return false;
      const d = Math.sqrt(dist2(p.x, p.y, e.x, e.y));
      return d <= wave.front + e.radius && d >= wave.front - band - e.radius;
    });
    for (const e of hits) {
      wave.hit.add(e.id);
      sonarHit(w, game, e, damage * wave.mult, wave.stun, !wave.inward);
    }
    const done = wave.inward ? wave.front <= 0 : wave.front >= reach;
    if (!done) keep.push(wave);
    else if (wave.undertow) keep.push(inwardWave(game.time, reach, wave.mult));
  }
  st.waves = keep;
}
