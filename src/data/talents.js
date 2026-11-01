import { isHarpoon, sourceKind } from '../entities/projectile.js';

/**
 * Talents. Every 5th level you pick one of three, drawn from one pool:
 * your character's talents + the talents of every weapon you're carrying.
 * So a character + weapon pair gives a different pool, and picking up a
 * second weapon during a dive adds its talents to the mix.
 *
 * The rule: a talent never hands out stats and never changes what a stat means.
 * It changes how something works, so the shared stats (haste, duration, attack
 * speed, amount, size, damage, pickup range, pearl value) pay off in new ways.
 *
 *   tags      the shared stats this talent plays off ("Plays off" on the card).
 *             Offers lean toward talents whose stats you're already building.
 *   tier      1 = from level 5, 2 = from level 10, 3 = build-defining, from level 20.
 *             Only one tier-3 talent per dive.
 *   apply(b, rank, player, flags)   usually just sets a flag the game checks
 *   derive(b, rank, player, flags)  runs after every apply (for overrides like Mothership's cap)
 *   hooks   { kill, hit, pickup, hurt, lethal, levelUp, droneLaunch, droneExpire, weaponFire, shot, tick, draw }
 *           each (game, payload, rank). A `lethal` hook returning true prevents death.
 *           `hit` and `kill` payloads say which weapon did it: sourceKind(payload.projectile / .source).
 */

export const TIER_COLORS = { 1: '#ffd166', 2: '#ff9f5a', 3: '#e599f7' };

export const TAG_LABELS = {
  damage: 'Damage',
  cooldown: 'Haste',
  duration: 'Duration',
  attackSpeed: 'Attack speed',
  amount: 'Amount',
  area: 'Size',
  magnet: 'Pickup range',
  growth: 'Pearl value',
  regen: 'Regen',
  armor: 'Armor',
  speed: 'Speed',
  health: 'Health',
};

const flag = (name) => (b, r, p, f) => {
  f[name] = true;
};

/** Bring every weapon you carry closer to firing (or fire it right away with Infinity). */
function reloadAll(player, seconds) {
  for (const w of player.weapons) w.timer = seconds === Infinity ? 0 : w.timer - seconds;
}

// =================================================================== characters

const MARA = [
  {
    id: 'treasureHooks',
    name: 'Treasure Hooks',
    icon: 'TH',
    tier: 1,
    tags: ['area', 'growth'],
    text: 'Every shot you fire snags the pearls it flies past and sends them to you.',
    apply: flag('treasureHooks'),
  },
  {
    id: 'salvageHaul',
    name: 'Salvage Haul',
    icon: 'SH',
    tier: 1,
    tags: ['growth'],
    text: 'Every 120 XP you collect drops a treasure chest nearby.',
    hooks: {
      pickup(game, pk) {
        if (pk.kind !== 'xp') return;
        const p = game.player;
        p.counters.haul = (p.counters.haul ?? 0) + pk.value * p.stats.growth;
        while (p.counters.haul >= 120) {
          p.counters.haul -= 120;
          game.spawnPickup('chest', p.x + game.rng.range(-90, 90), p.y + game.rng.range(-90, 90));
        }
      },
    },
  },
  {
    id: 'luckyFind',
    name: 'Lucky Find',
    icon: 'LF',
    tier: 1,
    tags: ['growth'],
    text: 'Treasure chests give one extra upgrade.',
    apply: (b, r, p, f) => {
      f.chestBonus = (f.chestBonus ?? 0) + 1;
    },
  },
  {
    id: 'magneticSurge',
    name: 'Magnetic Surge',
    icon: 'Mg',
    tier: 1,
    tags: ['growth', 'magnet'],
    text: 'Every level-up pulls every pearl in sight to you.',
    hooks: {
      levelUp(game) {
        const p = game.player;
        game.magnetizePearls(p.x, p.y, 1200);
      },
    },
  },
  {
    id: 'secondWind',
    name: 'Second Wind',
    icon: 'SW',
    tier: 2,
    tags: ['duration'],
    text: 'Once per dive, a fatal hit leaves you at 1 health and invulnerable for 2 seconds (longer with duration).',
    hooks: {
      lethal(game) {
        const p = game.player;
        if (p.counters.secondWindUsed) return false;
        p.counters.secondWindUsed = true;
        p.hp = 1;
        p.invuln = 2 * p.stats.duration;
        game.announce('Second wind!', 1.5);
        return true;
      },
    },
  },
  {
    id: 'greed',
    name: 'Greed',
    icon: 'Gr',
    tier: 3,
    tags: ['growth', 'cooldown'],
    text: 'Every level-up instantly reloads all your weapons and heals 15% of your health. Chests give one extra upgrade.',
    apply: (b, r, p, f) => {
      f.chestBonus = (f.chestBonus ?? 0) + 1;
    },
    hooks: {
      levelUp(game) {
        const p = game.player;
        reloadAll(p, Infinity);
        p.heal(p.stats.maxHp * 0.15);
      },
    },
  },
];

const OTTO = [
  {
    id: 'scrapRecycler',
    name: 'Scrap Recycler',
    icon: 'SR',
    tier: 1,
    tags: ['cooldown', 'damage'],
    text: 'Every kill brings all your weapons 0.04 seconds closer to firing.',
    hooks: {
      kill(game) {
        reloadAll(game.player, 0.04);
      },
    },
  },
  {
    id: 'spotterUplink',
    name: 'Spotter Uplink',
    icon: 'SU',
    tier: 1,
    tags: ['duration', 'amount'],
    text: 'Hits mark enemies for 1 second (longer with duration). Marked enemies take 20% more damage from your other weapons.',
    hooks: {
      hit(game, { enemy, projectile }) {
        const kind = sourceKind(projectile);
        if (kind) enemy.mark(game.time + game.player.stats.duration, kind);
      },
    },
  },
  {
    id: 'emergencyVenting',
    name: 'Emergency Venting',
    icon: 'EV',
    tier: 1,
    tags: ['area', 'duration'],
    text: 'When you get hit, your suit vents a blast that throws nearby enemies back and pins them for 0.5 seconds.',
    hooks: {
      hurt(game) {
        const p = game.player;
        const reach = 140 * p.stats.area;
        const near = game
          .enemiesNear(p.x, p.y, reach)
          .filter((e) => !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach);
        for (const e of near) {
          e.knock(420, p.x, p.y);
          e.root(0.5 * p.stats.duration);
        }
        game.effects.ring(p.x, p.y, reach, '#7fe7ff');
      },
    },
  },
  {
    id: 'cascade',
    name: 'Cascade',
    icon: 'Cs',
    tier: 2,
    tags: ['duration', 'damage'],
    text: 'When a weapon kills, your other weapons deal 30% more damage for 1 second (longer with duration).',
    hooks: {
      kill(game, { source }) {
        const kind = sourceKind(source);
        if (!kind) return;
        const c = game.player.counters;
        c.cascadeFrom = kind;
        c.cascadeUntil = game.time + game.player.stats.duration;
      },
    },
  },
  {
    id: 'juryRig',
    name: 'Jury-Rig',
    icon: 'JR',
    tier: 3,
    tags: ['amount'],
    text: 'One extra weapon slot, and every new weapon you pick up starts at level 2.',
    apply: flag('juryRig'),
  },
  {
    id: 'overclock',
    name: 'Overclock',
    icon: 'OC',
    tier: 3,
    tags: ['duration', 'cooldown'],
    text: 'Every level-up makes all your weapons and drones work twice as fast for 5 seconds (longer with duration).',
    hooks: {
      levelUp(game) {
        const p = game.player;
        p.addBuff('overclock', 5 * p.stats.duration);
      },
    },
  },
];

// =================================================================== weapons

const HARPOON = [
  {
    id: 'longThrow',
    name: 'Long Throw',
    icon: 'LT',
    tier: 1,
    tags: ['duration', 'damage'],
    text: 'Harpoons hit harder the further they have flown: up to +50% at the end of their range.',
    apply: flag('longThrow'),
  },
  {
    id: 'splittingBarbs',
    name: 'Splitting Barbs',
    icon: 'SB',
    tier: 1,
    tags: ['amount', 'damage'],
    text: 'When a harpoon stops in an enemy, it splits into two half-strength harpoons that fly on.',
    apply: flag('splittingBarbs'),
  },
  {
    id: 'reelingLine',
    name: 'Reeling Line',
    icon: 'RL',
    tier: 1,
    tags: ['cooldown', 'amount'],
    text: 'Every harpoon that hits brings your next volley 0.1 seconds closer.',
    hooks: {
      hit(game, { projectile }) {
        if (!isHarpoon(projectile)) return;
        const harpoon = game.player.getWeapon('harpoon');
        if (harpoon) harpoon.timer -= 0.1;
      },
    },
  },
  {
    id: 'anchorLine',
    name: 'Anchor Line',
    icon: 'AL',
    tier: 2,
    tags: ['duration', 'cooldown'],
    text: 'Harpoon hits pin enemies in place for 0.5 seconds (longer with duration). Bosses can’t be pinned.',
    hooks: {
      hit(game, { enemy, projectile }) {
        if (isHarpoon(projectile)) enemy.root(0.5 * game.player.stats.duration);
      },
    },
  },
  {
    id: 'tidalHarpoons',
    name: 'Tidal Harpoons',
    icon: 'Td',
    tier: 2,
    tags: ['duration', 'amount'],
    text: 'Harpoons turn around at the end of their range and fly back through you, hitting again.',
    apply: flag('tidal'),
  },
  {
    id: 'chainHarpoon',
    name: 'Chain Harpoon',
    icon: 'CH',
    tier: 2,
    tags: ['damage', 'amount'],
    text: 'Every enemy a harpoon kills fires a new harpoon from where it died at the nearest enemy (up to two links).',
    hooks: {
      kill(game, { enemy, source }) {
        if (sourceKind(source) !== 'harpoon' || (source.generation ?? 0) >= 2) return;
        const next = game.nearestEnemy(enemy.x, enemy.y, 320);
        if (!next) return;
        const p = game.player;
        game.spawnProjectile({
          x: enemy.x,
          y: enemy.y,
          angle: Math.atan2(next.y - enemy.y, next.x - enemy.x),
          speed: 460,
          damage: source.damage,
          radius: 6 * p.stats.area,
          life: 0.8 * p.stats.duration,
          knockback: 120,
          color: '#eef3f7',
          shape: 'harpoon',
          generation: (source.generation ?? 0) + 1,
        });
      },
    },
  },
  {
    id: 'ringVolley',
    name: 'Ring Volley',
    icon: 'RV',
    tier: 2,
    tags: ['cooldown', 'amount'],
    text: 'Every third volley also fires 8 harpoons in every direction (2 more per extra projectile).',
    apply: flag('ringVolley'),
  },
  {
    id: 'skewer',
    name: 'Skewer',
    icon: 'Sk',
    tier: 3,
    tags: ['duration', 'area'],
    text: 'Harpoons pierce everything in their path, losing 10% damage per enemy they’ve passed through (down to 30%).',
    apply: flag('skewer'),
  },
];

const DRONES = [
  {
    id: 'recycledCores',
    name: 'Recycled Cores',
    icon: 'RC',
    tier: 1,
    tags: ['duration', 'cooldown'],
    text: 'When a drone runs out of charge, your next launch comes 1 second sooner (but never sooner than half the usual wait).',
    hooks: {
      droneExpire(game, d) {
        if (d.expireReason === 'expired') game.hastenLaunch(1);
      },
    },
  },
  {
    id: 'veteranDrones',
    name: 'Veteran Drones',
    icon: 'VD',
    tier: 1,
    tags: ['duration', 'attackSpeed'],
    text: 'A drone attacks 5% faster for every second it has been alive.',
    apply: flag('veteran'),
  },
  {
    id: 'burnout',
    name: 'Burnout',
    icon: 'Bo',
    tier: 1,
    tags: ['duration', 'attackSpeed'],
    text: 'Drones attack twice as fast during their last 3 seconds of charge.',
    apply: flag('burnout'),
  },
  {
    id: 'laserFence',
    name: 'Laser Fence',
    icon: 'Fe',
    tier: 1,
    tags: ['duration', 'area', 'attackSpeed'],
    text: 'Each drone links to its nearest drone with a laser. Enemies crossing a link take 60% of a laser hit about three times a second (faster with attack speed). Links reach further with size.',
    apply: flag('laserFence'),
  },
  {
    id: 'spotterDrones',
    name: 'Spotter Drones',
    icon: 'Sp',
    tier: 1,
    tags: ['attackSpeed', 'duration'],
    text: 'Enemies hit by a drone are marked for 2 seconds (longer with duration). Marked enemies take 20% more damage from all your other weapons.',
    hooks: {
      hit(game, { enemy, projectile }) {
        if (sourceKind(projectile) === 'drone') enemy.mark(game.time + 2 * game.player.stats.duration, 'drone');
      },
    },
  },
  {
    id: 'linkedFire',
    name: 'Linked Fire',
    icon: 'Lk',
    tier: 2,
    tags: ['cooldown', 'amount'],
    text: 'Drones stop firing on their own. Each time you launch, every drone fires a burst of 4 lasers.',
    apply: flag('linkedFire'),
  },
  {
    id: 'scrapDetonation',
    name: 'Scrap Detonation',
    icon: 'SD',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Drones explode when they run out of charge, dealing 3× their damage around them.',
    hooks: {
      droneExpire(game, d) {
        game.explode(d.x, d.y, 60 * game.player.stats.area, d.damage(game) * 3, '#ffb347');
      },
    },
  },
  {
    id: 'refraction',
    name: 'Refraction',
    icon: 'Rf',
    tier: 2,
    tags: ['area', 'attackSpeed'],
    text: 'Drone lasers bounce on to one more enemy nearby at 70% damage. Bounce reach grows with size.',
    apply: flag('refraction'),
  },
  {
    id: 'capacitorBank',
    name: 'Capacitor Bank',
    icon: 'CB',
    tier: 2,
    tags: ['attackSpeed', 'duration'],
    text: 'While a drone has nothing in range, it saves up its lasers (up to 5). When an enemy comes in range, it fires them all at once.',
    apply: flag('capacitor'),
  },
  {
    id: 'mothership',
    name: 'Mothership',
    icon: 'MS',
    tier: 3,
    tags: ['duration', 'cooldown', 'amount'],
    text: 'Your drones join one huge drone instead of deploying. It flies to where each pod lands, sees further, and fires one big laser with the damage of every drone inside, punching through to the enemy behind. Each drone inside still runs out on its own.',
    apply: flag('mothership'),
  },
  {
    id: 'hive',
    name: 'Hive',
    icon: 'Hv',
    tier: 3,
    tags: ['amount', 'cooldown', 'duration'],
    text: 'Pods land half as far from you, and drones attack 8% faster for every other drone close to them, up to 3× as fast.',
    apply: flag('hive'),
  },
  {
    id: 'kamikaze',
    name: 'Kamikaze',
    icon: 'Kz',
    tier: 3,
    tags: ['attackSpeed', 'area', 'cooldown'],
    text: 'Drones become mines: they wait where they land, then dive into the first enemy that comes in range and explode for 4× damage. Attack speed makes them dive faster. Every blast brings your next launch 0.5 seconds closer (never sooner than half the usual wait).',
    apply: flag('kamikaze'),
  },
];

const DARTS = [
  {
    id: 'venom',
    name: 'Venom',
    icon: 'Vn',
    tier: 1,
    tags: ['duration', 'amount'],
    text: 'Darts poison what they hit: 3 damage per second for 3 seconds, stacking up to 5 times (longer with duration).',
    hooks: {
      hit(game, { enemy, projectile }) {
        if (sourceKind(projectile) === 'dart') enemy.poison(3 * game.player.stats.might, 3 * game.player.stats.duration);
      },
    },
  },
  {
    id: 'rapidReload',
    name: 'Rapid Reload',
    icon: 'RR',
    tier: 1,
    tags: ['damage', 'cooldown'],
    text: 'Every dart kill brings your next volley 0.3 seconds closer.',
    hooks: {
      kill(game, { source }) {
        if (sourceKind(source) !== 'dart') return;
        const darts = game.player.getWeapon('darts');
        if (darts) darts.timer -= 0.3;
      },
    },
  },
  {
    id: 'wideFan',
    name: 'Wide Fan',
    icon: 'WF',
    tier: 1,
    tags: ['amount'],
    text: 'Darts spread out in a fan instead of flying side by side. Every extra dart widens it.',
    apply: flag('wideFan'),
  },
  {
    id: 'ricochetDarts',
    name: 'Ricochet Darts',
    icon: 'RD',
    tier: 2,
    tags: ['area', 'amount'],
    text: 'A dart that runs out of pierce bounces once more to a nearby enemy at 70% damage. Bounce reach grows with size.',
    apply: flag('ricochetDarts'),
  },
  {
    id: 'rearGuard',
    name: 'Rear Guard',
    icon: 'RG',
    tier: 2,
    tags: ['amount', 'cooldown'],
    text: 'Every volley also throws half as many darts behind you.',
    apply: flag('rearGuard'),
  },
  {
    id: 'needleCyclone',
    name: 'Needle Cyclone',
    icon: 'NC',
    tier: 3,
    tags: ['amount', 'cooldown'],
    text: 'Darts fly out in a full circle around you, twice as many per volley, but they no longer pierce.',
    apply: flag('cyclone'),
  },
  {
    id: 'sniper',
    name: 'Sniper',
    icon: 'Sn',
    tier: 3,
    tags: ['amount', 'damage'],
    text: 'Each volley is one huge dart that pierces everything, dealing the damage of all the darts it replaces (+20%).',
    apply: flag('sniper'),
  },
];

const STARFISH = [
  {
    id: 'stingingArms',
    name: 'Stinging Arms',
    icon: 'SA',
    tier: 1,
    tags: ['attackSpeed', 'duration'],
    text: 'Starfish poison what they cut: 3 damage per second for 3 seconds, stacking up to 5 times (longer with duration).',
    hooks: {
      hit(game, { enemy, projectile }) {
        if (sourceKind(projectile) === 'starfish') enemy.poison(3 * game.player.stats.might, 3 * game.player.stats.duration);
      },
    },
  },
  {
    id: 'thrownStars',
    name: 'Thrown Stars',
    icon: 'TS',
    tier: 1,
    tags: ['cooldown', 'damage'],
    text: 'Every 4 seconds (faster with haste), a spare starfish is thrown at the nearest enemy, cutting through two.',
    apply: flag('thrownStars'),
  },
  {
    id: 'counterSpin',
    name: 'Counter-Spin',
    icon: 'CS',
    tier: 1,
    tags: ['amount', 'attackSpeed'],
    text: 'Every other starfish circles the opposite way, so they cross paths and cut more.',
    apply: flag('counterSpin'),
  },
  {
    id: 'regrowth',
    name: 'Regrowth',
    icon: 'Rg',
    tier: 2,
    tags: ['damage', 'area'],
    text: 'Every kill by a starfish makes your starfish 1% bigger for the rest of the dive (up to +50%).',
    hooks: {
      kill(game, { source }) {
        if (sourceKind(source) !== 'starfish') return;
        const w = game.player.getWeapon('starfish');
        if (w) w.state.growth = Math.min(0.5, (w.state.growth ?? 0) + 0.01);
      },
    },
  },
  {
    id: 'tidalPull',
    name: 'Tidal Pull',
    icon: 'Pl',
    tier: 2,
    tags: ['area', 'attackSpeed'],
    text: 'Starfish drag the enemies they cut in toward you instead of knocking them away.',
    apply: flag('tidalPull'),
  },
  {
    id: 'starShield',
    name: 'Star Shield',
    icon: 'SS',
    tier: 3,
    tags: ['amount', 'attackSpeed'],
    text: 'Starfish circle closer and destroy enemy shots they touch. Each blocked shot makes them spin 50% faster for 2 seconds.',
    apply: flag('starShield'),
  },
  {
    id: 'supernova',
    name: 'Supernova',
    icon: 'SN',
    tier: 3,
    tags: ['cooldown', 'duration', 'area'],
    text: 'Every 8 seconds (faster with haste), your starfish fly out to three times their distance and back (longer with duration).',
    apply: flag('supernova'),
  },
];

const SONAR = [
  {
    id: 'echo',
    name: 'Echo',
    icon: 'Ec',
    tier: 1,
    tags: ['cooldown', 'area'],
    text: 'Every pulse repeats once, 0.4 seconds later, at half damage.',
    apply: flag('echo'),
  },
  {
    id: 'concussive',
    name: 'Concussive',
    icon: 'Cn',
    tier: 1,
    tags: ['area', 'cooldown'],
    text: 'Pulses shove enemies away hard, keeping a clear ring around you.',
    apply: flag('concussive'),
  },
  {
    id: 'resonance',
    name: 'Resonance',
    icon: 'Rs',
    tier: 1,
    tags: ['cooldown', 'area'],
    text: 'An enemy hit by pulses in a row takes 20% more from each one (up to 5 in a row).',
    apply: flag('resonance'),
  },
  {
    id: 'sonarMark',
    name: 'Sonar Mark',
    icon: 'SM',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Pulses mark enemies for 1.5 seconds (longer with duration). Marked enemies take 20% more damage from your other weapons.',
    hooks: {
      hit(game, { enemy, projectile }) {
        if (sourceKind(projectile) === 'sonar') enemy.mark(game.time + 1.5 * game.player.stats.duration, 'sonar');
      },
    },
  },
  {
    id: 'depthCharge',
    name: 'Depth Charge',
    icon: 'DC',
    tier: 2,
    tags: ['damage', 'area'],
    text: 'Enemies killed by a pulse burst, damaging everything around them.',
    hooks: {
      kill(game, { enemy, source }) {
        if (sourceKind(source) !== 'sonar') return;
        const p = game.player;
        game.explode(enemy.x, enemy.y, 50 * p.stats.area, 10 * p.stats.might, '#7fe7ff');
      },
    },
  },
  {
    id: 'stunPulse',
    name: 'Stun Pulse',
    icon: 'St',
    tier: 2,
    tags: ['cooldown', 'duration'],
    text: 'Every third pulse pins everything it hits for 0.6 seconds (longer with duration).',
    apply: flag('stunPulse'),
  },
  {
    id: 'shockwave',
    name: 'Shockwave',
    icon: 'Sw',
    tier: 3,
    tags: ['area', 'cooldown'],
    text: 'Pulses become waves that roll outward to three times their size, hitting everything once as they pass.',
    apply: flag('shockwave'),
  },
];

const EEL = [
  {
    id: 'stunningArc',
    name: 'Stunning Arc',
    icon: 'SA',
    tier: 1,
    tags: ['duration', 'amount'],
    text: 'The last enemy each zap reaches is pinned for 0.6 seconds (longer with duration). Bosses can’t be pinned.',
    apply: flag('stunningArc'),
  },
  {
    id: 'buildingCharge',
    name: 'Building Charge',
    icon: 'BC',
    tier: 1,
    tags: ['amount', 'damage'],
    text: 'Arcs grow stronger as they jump instead of weaker: each jump hits 10% harder than the one before.',
    apply: flag('buildingCharge'),
  },
  {
    id: 'feedback',
    name: 'Feedback',
    icon: 'Fb',
    tier: 1,
    tags: ['cooldown', 'damage'],
    text: 'Every enemy a zap kills brings the next zap 0.12 seconds closer.',
    hooks: {
      kill(game, { source }) {
        if (sourceKind(source) !== 'eel') return;
        const eel = game.player.getWeapon('eel');
        if (eel) eel.timer -= 0.12;
      },
    },
  },
  {
    id: 'groundLoop',
    name: 'Ground Loop',
    icon: 'GL',
    tier: 2,
    tags: ['amount', 'area'],
    text: 'Arcs can jump back to an enemy they already hit (just not the one they’re leaving), so a zap uses all its jumps whenever two enemies are in reach. Each enemy is hit at most twice per zap.',
    apply: flag('groundLoop'),
  },
  {
    id: 'storedCharge',
    name: 'Stored Charge',
    icon: 'SC',
    tier: 2,
    tags: ['amount', 'cooldown'],
    text: 'Jumps a zap can’t use, because nothing is in reach, are saved and added to the next zap (up to 6).',
    apply: flag('storedCharge'),
  },
  {
    id: 'livingStorm',
    name: 'Living Storm',
    icon: 'LS',
    tier: 3,
    tags: ['amount', 'area', 'damage'],
    text: 'Zaps don’t stop after their last jump: they keep arcing until nothing is left in reach, losing 20% damage per extra jump.',
    apply: flag('livingStorm'),
  },
];

const INK = [
  {
    id: 'smokescreen',
    name: 'Smokescreen',
    icon: 'Sm',
    tier: 1,
    tags: ['area', 'duration'],
    text: 'Enemy shots that drift into one of your clouds dissolve.',
    apply: flag('smokescreen'),
  },
  {
    id: 'murkyWater',
    name: 'Murky Water',
    icon: 'MW',
    tier: 1,
    tags: ['duration', 'damage'],
    text: 'Enemies inside a cloud take 20% more damage from your other weapons.',
    apply: flag('murkyWater'),
  },
  {
    id: 'jetSquirt',
    name: 'Jet Squirt',
    icon: 'JS',
    tier: 1,
    tags: ['cooldown', 'speed'],
    text: 'Every squirt jets you forward a short way, like a squid fleeing.',
    apply: flag('jetSquirt'),
  },
  {
    id: 'inkBomb',
    name: 'Ink Bomb',
    icon: 'IB',
    tier: 2,
    tags: ['damage', 'area'],
    text: 'When a cloud fades, it bursts, hitting everything still inside for three hits’ worth of damage at once.',
    apply: flag('inkBomb'),
  },
  {
    id: 'huntingInk',
    name: 'Hunting Ink',
    icon: 'HI',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Clouds creep slowly toward the nearest enemy instead of hanging still.',
    apply: flag('huntingInk'),
  },
  {
    id: 'krakenWake',
    name: 'Kraken’s Wake',
    icon: 'KW',
    tier: 3,
    tags: ['cooldown', 'amount', 'duration'],
    text: 'You stop squirting. Instead, ink pours out of you as you swim: a smaller cloud every few steps (closer together with haste), and a wider trail with every extra amount.',
    apply: flag('krakenWake'),
  },
];

const TRIDENT = [
  {
    id: 'riptide',
    name: 'Riptide',
    icon: 'Rp',
    tier: 1,
    tags: ['area', 'cooldown'],
    text: 'Thrusts drag enemies in toward the trident’s tip instead of knocking them away, bunching them up for the next thrust.',
    apply: flag('riptide'),
  },
  {
    id: 'riposte',
    name: 'Riposte',
    icon: 'Ri',
    tier: 1,
    tags: ['cooldown', 'damage'],
    text: 'When you get hit, the trident strikes back at once: a full attack at double damage toward the crowd. At most once every 2 seconds.',
    apply: flag('riposte'),
    hooks: {
      hurt(game) {
        game.player.counters.riposteAt = game.time; // the trident answers on its next tick
      },
    },
  },
  {
    id: 'lunge',
    name: 'Lunge',
    icon: 'Lu',
    tier: 1,
    tags: ['cooldown', 'speed'],
    text: 'Every attack carries you a short dash toward the crowd you’re sweeping.',
    apply: flag('lunge'),
  },
  {
    id: 'impale',
    name: 'Impale',
    icon: 'Im',
    tier: 2,
    tags: ['duration', 'damage'],
    text: 'The last thrust of each attack pins everything it hits for 0.6 seconds (longer with duration). Bosses can’t be pinned.',
    apply: flag('impale'),
  },
  {
    id: 'brineWave',
    name: 'Brine Wave',
    icon: 'BW',
    tier: 2,
    tags: ['area', 'damage'],
    text: 'The last thrust of each attack sends a wave rolling on past the tip, out to twice the trident’s reach, hitting everything in its path at half damage.',
    apply: flag('brineWave'),
  },
  {
    id: 'whirlpool',
    name: 'Whirlpool',
    icon: 'Wp',
    tier: 3,
    tags: ['amount', 'area', 'cooldown'],
    text: 'Attacks spin all the way around you instead of sweeping one crowd: 8 thrusts in a circle (2 more per extra amount), each at 70% damage.',
    apply: flag('whirlpool'),
  },
];

const BUBBLES = [
  {
    id: 'softTarget',
    name: 'Soft Target',
    icon: 'ST',
    tier: 1,
    tags: ['duration', 'damage'],
    text: 'Trapped enemies take 30% more damage from your other weapons.',
    apply: flag('softTarget'),
  },
  {
    id: 'burstSpray',
    name: 'Burst Spray',
    icon: 'BS',
    tier: 1,
    tags: ['area', 'damage'],
    text: 'A popping bubble splashes everything close to it for half its damage. The splash grows with size.',
    apply: flag('burstSpray'),
  },
  {
    id: 'pressure',
    name: 'Pressure',
    icon: 'Pr',
    tier: 2,
    tags: ['duration', 'damage'],
    text: 'The longer an enemy is trapped, the harder its bubble pops: +25% damage for every second it was held.',
    apply: flag('pressure'),
  },
  {
    id: 'netting',
    name: 'Netting',
    icon: 'Nt',
    tier: 2,
    tags: ['area', 'duration'],
    text: 'Bubbles keep drifting after they catch something, and can catch three times before they’re spent.',
    apply: flag('netting'),
  },
  {
    id: 'humpbackNet',
    name: 'Humpback’s Net',
    icon: 'HN',
    tier: 3,
    tags: ['amount', 'area', 'duration'],
    text: 'Like a humpback whale hunting: every third volley also blows a ring of 8 bubbles out around you (2 more per extra amount).',
    apply: flag('humpbackNet'),
  },
];

const LURE = [
  {
    id: 'secondBite',
    name: 'Second Bite',
    icon: '2B',
    tier: 1,
    tags: ['cooldown', 'damage'],
    text: 'The jaws snap twice: a second bite at half damage 0.3 seconds after the first.',
    apply: flag('secondBite'),
  },
  {
    id: 'deepHunger',
    name: 'Deep Hunger',
    icon: 'DH',
    tier: 1,
    tags: ['damage', 'area'],
    text: 'Every enemy a bite kills makes your next bite 10% stronger (up to +100%). A bite that kills nothing goes hungry again.',
    apply: flag('deepHunger'),
  },
  {
    id: 'brightLure',
    name: 'Bright Lure',
    icon: 'BL',
    tier: 2,
    tags: ['area', 'duration'],
    text: 'Enemy shots near a glowing lure curve toward it and are swallowed when they reach it.',
    apply: flag('brightLure'),
  },
  {
    id: 'swallowWhole',
    name: 'Swallow Whole',
    icon: 'SW',
    tier: 2,
    tags: ['damage', 'area'],
    text: 'Bites swallow regular enemies below 30% health whole. Elites and bosses are only bitten.',
    apply: flag('swallowWhole'),
  },
  {
    id: 'lanternHunt',
    name: 'Lantern Hunt',
    icon: 'LH',
    tier: 3,
    tags: ['duration', 'area', 'cooldown'],
    text: 'Lures don’t hang still: while they glow they swim after the crowd around them, dragging it along.',
    apply: flag('lanternHunt'),
  },
];

const SHRIMP = [
  {
    id: 'sonicBoom',
    name: 'Sonic Boom',
    icon: 'SB',
    tier: 1,
    tags: ['damage', 'area'],
    text: 'The shock of each snap also tears along the bubble’s path, hitting everything between you and the blast for 30% damage.',
    apply: flag('sonicBoom'),
  },
  {
    id: 'bigCatch',
    name: 'Big Catch',
    icon: 'BC',
    tier: 1,
    tags: ['area', 'cooldown'],
    text: 'A blast that catches 5 or more enemies brings the next snap half a cooldown closer.',
    apply: flag('bigCatch'),
  },
  {
    id: 'stunningSnap',
    name: 'Stunning Snap',
    icon: 'SS',
    tier: 2,
    tags: ['duration', 'damage'],
    text: 'Blasts pin everything they catch for 0.5 seconds (longer with duration), and pinned enemies take 30% more from blasts.',
    apply: flag('stunningSnap'),
  },
  {
    id: 'boilingWater',
    name: 'Boiling Water',
    icon: 'BW',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Where a blast goes off, the water boils for 1.5 seconds (longer with duration), hurting everything in it for 20% of the blast per second.',
    apply: flag('boilingWater'),
  },
  {
    id: 'cavitationLance',
    name: 'Cavitation Lance',
    icon: 'CL',
    tier: 3,
    tags: ['duration', 'damage', 'area'],
    text: 'Bubbles no longer stop at the first enemy: they tear on to the end of their range, popping a small blast (40% damage, half size) on every enemy they pass, then burst in full.',
    apply: flag('cavitationLance'),
  },
];

const TENDRILS = [
  {
    id: 'numbingSting',
    name: 'Numbing Sting',
    icon: 'NS',
    tier: 1,
    tags: ['attackSpeed', 'duration'],
    text: 'Stung enemies are numbed: 35% slower for 1 second (longer with duration).',
    apply: flag('numbingSting'),
  },
  {
    id: 'coilingDrift',
    name: 'Coiling Drift',
    icon: 'CD',
    tier: 1,
    tags: ['amount', 'area'],
    text: 'When you stop swimming, your tendrils curl up into a ring around you. Swim again and they trail behind you as usual.',
    apply: flag('coilingDrift'),
  },
  {
    id: 'entangle',
    name: 'Entangle',
    icon: 'En',
    tier: 2,
    tags: ['attackSpeed', 'duration'],
    text: 'Every third sting on the same enemy tangles it up, pinning it for 0.6 seconds (longer with duration). Bosses can’t be pinned.',
    apply: flag('entangle'),
  },
  {
    id: 'dragNet',
    name: 'Drag Net',
    icon: 'DN',
    tier: 2,
    tags: ['area', 'attackSpeed'],
    text: 'While you swim, stings tug enemies along the way you’re going, so they trail through more of your tendrils.',
    apply: flag('dragNet'),
  },
  {
    id: 'shedTendrils',
    name: 'Shed Tendrils',
    icon: 'Sh',
    tier: 3,
    tags: ['duration', 'cooldown', 'amount'],
    text: 'Every 3 seconds (faster with haste), the tips of your tendrils break off and stay where they fell, stinging for 4 seconds (longer with duration).',
    apply: flag('shedTendrils'),
  },
];

const EYE = [
  {
    id: 'lingeringGaze',
    name: 'Lingering Gaze',
    icon: 'LG',
    tier: 1,
    tags: ['duration', 'cooldown'],
    text: 'When the eye loses its target, it keeps 40% of its heat for the next one (more with duration, up to 90%).',
    apply: flag('lingeringGaze'),
  },
  {
    id: 'evilEye',
    name: 'Evil Eye',
    icon: 'EE',
    tier: 1,
    tags: ['damage', 'duration'],
    text: 'Enemies under the eye’s gaze take 25% more damage from your other weapons.',
    apply: flag('evilEye'),
  },
  {
    id: 'glare',
    name: 'Glare',
    icon: 'Gl',
    tier: 2,
    tags: ['cooldown', 'duration'],
    text: 'At full heat, the gaze holds its target in place. Bosses are slowed instead.',
    apply: flag('glare'),
  },
  {
    id: 'searingDeath',
    name: 'Searing Death',
    icon: 'SD',
    tier: 2,
    tags: ['area', 'damage'],
    text: 'An enemy burned to death at full heat bursts into flame, hitting everything around it for 2 seconds’ worth of gaze damage.',
    apply: flag('searingDeath'),
  },
  {
    id: 'eyeOpens',
    name: 'The Eye Opens',
    icon: 'EO',
    tier: 3,
    tags: ['area', 'cooldown', 'damage'],
    text: 'At full heat the gaze spills over: every enemy near the target burns too, at half the target’s damage. The spill grows with size.',
    apply: flag('eyeOpens'),
  },
];

// =================================================================== lookup

export const CHARACTER_TALENTS = { mara: MARA, otto: OTTO };
export const WEAPON_TALENTS = {
  harpoon: HARPOON,
  drones: DRONES,
  darts: DARTS,
  starfish: STARFISH,
  sonar: SONAR,
  eel: EEL,
  ink: INK,
  trident: TRIDENT,
  bubbles: BUBBLES,
  lure: LURE,
  shrimp: SHRIMP,
  tendrils: TENDRILS,
  eye: EYE,
};

/** Offered when everything else has been taken. */
export const FALLBACK_TALENT = {
  id: 'grit',
  name: 'Grit',
  icon: '+',
  tier: 1,
  ranks: 99,
  tags: [],
  text: 'Heal 30 health.',
  onPick(game) {
    game.player.heal(30);
  },
};

// Every talent by id, plus who it belongs to (shown on the card).
const BY_ID = new Map([[FALLBACK_TALENT.id, FALLBACK_TALENT]]);
for (const [owner, list] of [...Object.entries(CHARACTER_TALENTS), ...Object.entries(WEAPON_TALENTS)]) {
  for (const t of list) {
    if (BY_ID.has(t.id)) throw new Error(`Duplicate talent id "${t.id}"`);
    t.owner = owner;
    BY_ID.set(t.id, t);
  }
}

export function findTalent(id) {
  return BY_ID.get(id);
}

