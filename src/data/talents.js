import { CONFIG } from '../config.js';
import { isHarpoon, sourceKind, weaponOf } from '../entities/projectile.js';
import { crowdCenter } from './weapons/common.js';

/**
 * Talents. Each character and each weapon has a talent tree (layouts in data/trees.js) that
 * you build up between dives with points from levelling that character or weapon. Every
 * talent you've taken is active from the start of a dive; a weapon's talents switch on when
 * you pick that weapon up.
 *
 * The rule: a talent never hands out stats and never changes what a stat means.
 * It changes how something works, so the shared stats (haste, duration, attack
 * speed, amount, size, damage, pickup range, pearl value) pay off in new ways.
 *
 *   tags      the shared stats this talent plays off ("Plays off" in the tree)
 *   tier      1 = early in its tree, 2 = deeper, 3 = a capstone (sets the node's color)
 *   ranks     how many points it can take (default 1). `text` can be a function of the rank.
 *   apply(b, rank, player, flags)   usually just sets a flag the game checks
 *   derive(b, rank, player, flags)  runs after every apply (for overrides that need final values)
 *   hooks   { kill, hit, pickup, hurt, shield, lethal, levelUp, droneLaunch, droneExpire, weaponFire,
 *             shot, tick, draw }, each (game, payload, rank). A `lethal` hook returning true
 *           prevents death; a `shield` hook returning true blocks a hit completely.
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
export function reloadAll(player, seconds) {
  for (const w of player.weapons) w.timer = seconds === Infinity ? 0 : w.timer - seconds;
}

// =================================================================== characters

// ------------------------------------------------------------ Captain Isolde Crane

export const SHIP = { kind: 'ship' }; // the Captain's ship: call-ins aren't one of your weapons
const crewmates = (game) => game.allies.filter((a) => a.kind === 'crew' && !a.dead);
/** Damage of the ship's call-ins: grows with your level, like Otto's Laser Sweep. */
export const shipDamage = (p) => (10 + 2 * p.level) * p.stats.might;

/** Drop `count` depth charges around (x, y). They sink for a moment, then blow. */
function dropCharges(game, x, y, count, spread, damage, delay = 0.8) {
  const p = game.player;
  for (let i = 0; i < count; i++) {
    const a = game.rng.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : game.rng.range(spread * 0.4, spread);
    game.callIn({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, delay: delay + i * 0.08, radius: 60 * p.stats.area, damage, source: SHIP, color: '#ffb347' });
  }
}

const CAPTAIN = [
  {
    id: 'veteranCrew',
    name: 'Veteran Crew',
    icon: 'VC',
    tier: 1,
    ranks: 2,
    tags: ['damage'],
    text: (r) => `Your crew’s copies of your weapons hit for ${r === 1 ? 50 : 65}% instead of 35%.`,
    apply: (b, r, p, f) => {
      f.crewDamage = 0.35 + 0.15 * r;
    },
  },
  {
    id: 'depthCharges',
    name: 'Depth Charges',
    icon: 'DC',
    tier: 1,
    ranks: 2,
    tags: ['cooldown', 'area', 'amount'],
    text: (r) => `Every 8 seconds (faster with haste), the ship drops ${r === 1 ? 3 : 5} depth charges on the biggest crowd near you (one more per amount). Their damage grows with your level.`,
    hooks: {
      tick(game, dt, rank) {
        const p = game.player;
        const c = p.counters;
        c.charges = (c.charges ?? 3) - dt;
        if (c.charges > 0) return;
        const spot = crowdCenter(game, p.x, p.y, 420, 90);
        if (!spot) return;
        c.charges = 8 * p.stats.cooldown;
        const count = (rank === 1 ? 3 : 5) + p.stats.amount;
        dropCharges(game, spot.x, spot.y, count, 70, shipDamage(p));
        // Bracketing Fire: a second wave right after, a little weaker.
        if (p.flags.bracketing) dropCharges(game, spot.x, spot.y, count, 90, shipDamage(p) * 0.6, 1.5);
      },
    },
  },
  {
    id: 'coveringFire',
    name: 'Covering Fire',
    icon: 'CF',
    tier: 1,
    tags: ['cooldown'],
    text: 'When you get hit, your crew reloads every weapon they fire at once.',
    hooks: {
      hurt(game) {
        for (const c of crewmates(game)) c.reload(game);
      },
    },
  },
  {
    id: 'supplyDrop',
    name: 'Supply Drop',
    icon: 'SD',
    tier: 1,
    tags: ['cooldown', 'growth'],
    text: 'Every 45 seconds (faster with haste), the ship drops a supply crate near you. Open it for an upgrade, like a treasure chest.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.supply = (c.supply ?? 30) - dt;
        if (c.supply > 0) return;
        c.supply = 45 * p.stats.cooldown;
        const a = game.rng.range(0, Math.PI * 2);
        const crate = game.spawnPickup('chest', p.x + Math.cos(a) * 110, p.y + Math.sin(a) * 110);
        crate.supply = true;
        game.announce('Supply drop!', 1.2);
      },
    },
  },
  {
    id: 'spotterRounds',
    name: 'Spotter Rounds',
    icon: 'SR',
    tier: 1,
    tags: ['duration', 'damage'],
    text: 'Everything the ship’s call-ins hit is marked for 3 seconds (longer with duration). Marked enemies take 20% more damage from your weapons.',
    apply: flag('spotterRounds'),
  },
  {
    id: 'fieldMedic',
    name: 'Field Medic',
    icon: 'FM',
    tier: 1,
    tags: ['cooldown', 'regen'],
    text: 'Every 10 seconds (faster with haste), your crewmate patches you up for 6% of your health.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.medic = (c.medic ?? 10) - dt;
        if (c.medic > 0 || crewmates(game).length === 0) return;
        c.medic = 10 * p.stats.cooldown;
        if (p.hp >= p.stats.maxHp) return;
        p.heal(p.stats.maxHp * 0.06);
        game.effects.text(p.x, p.y - p.radius - 8, '+', '#6bd968', 16);
      },
    },
  },
  {
    id: 'bracketingFire',
    name: 'Bracketing Fire',
    icon: 'BF',
    tier: 2,
    tags: ['area', 'damage'],
    text: 'Depth charges come in two waves: a second, wider wave lands right after the first at 60% damage.',
    apply: flag('bracketing'),
  },
  {
    id: 'crewSpecialist',
    name: 'Specialist',
    icon: 'Sp',
    tier: 2,
    tags: ['amount'],
    text: 'Your crewmate stops copying your weapons. Instead you get an extra weapon slot, and the crewmate wields the weapon in it at full strength.',
    apply: flag('crewSpecialist'),
  },
  {
    id: 'secondMate',
    name: 'Second Mate',
    icon: '2M',
    tier: 2,
    tags: ['amount', 'damage'],
    text: 'A second crewmate joins you, also firing copies of all your weapons.',
    apply: flag('secondMate'),
  },
  {
    id: 'ammoCrate',
    name: 'Ammo Crate',
    icon: 'AC',
    tier: 2,
    tags: ['cooldown', 'duration'],
    text: 'Opening any chest or crate reloads all your weapons and makes them work twice as fast for 3 seconds (longer with duration).',
    hooks: {
      pickup(game, pk) {
        if (pk.kind !== 'chest') return;
        const p = game.player;
        reloadAll(p, Infinity);
        p.addBuff('overclock', 3 * p.stats.duration);
      },
    },
  },
  {
    id: 'torpedoRun',
    name: 'Torpedo Run',
    icon: 'TR',
    tier: 2,
    tags: ['cooldown', 'damage', 'area'],
    text: 'Every 14 seconds (faster with haste), the ship fires a torpedo through the biggest crowd near you. It tears through everything in its path and bursts at the end.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.torpedo = (c.torpedo ?? 6) - dt;
        if (c.torpedo > 0) return;
        const spot = crowdCenter(game, p.x, p.y, 500, 90);
        if (!spot) return;
        c.torpedo = 14 * p.stats.cooldown;
        const angle = Math.atan2(spot.y - p.y, spot.x - p.x);
        const damage = shipDamage(p);
        game.spawnProjectile({
          x: p.x - Math.cos(angle) * 60,
          y: p.y - Math.sin(angle) * 60,
          angle,
          speed: 520,
          damage: damage * 0.6,
          pierce: 999,
          radius: 9,
          life: 1.5,
          knockback: 160,
          color: '#c9d3da',
          shape: 'torpedo',
          kind: 'ship',
          onEnd: (pr) => game.blast(pr.x, pr.y, 90 * p.stats.area, damage * 1.5, SHIP, { color: '#ffb347', knockback: 240 }),
        });
        game.audio.play('harpoon', { big: true });
      },
    },
  },
  {
    id: 'lifeline',
    name: 'Lifeline',
    icon: 'Ll',
    tier: 2,
    tags: ['duration'],
    text: 'Once per dive, your crew pulls you out of a fatal hit: you’re left at 30% health, and your crew is knocked out for 20 seconds.',
    hooks: {
      lethal(game) {
        const p = game.player;
        const crew = crewmates(game);
        if (p.counters.lifelineUsed || crew.length === 0) return false;
        p.counters.lifelineUsed = true;
        p.hp = p.stats.maxHp * 0.3;
        p.invuln = 1.5;
        for (const c of crew) c.downUntil = game.time + 20;
        game.announce('Your crew pulls you out!', 1.8);
        return true;
      },
    },
  },
  {
    id: 'quartermaster',
    name: 'Quartermaster',
    icon: 'QM',
    tier: 2,
    tags: ['growth'],
    text: 'Treasure chests and supply crates give one extra upgrade.',
    apply: (b, r, p, f) => {
      f.chestBonus = (f.chestBonus ?? 0) + 1;
    },
  },
  {
    id: 'broadside',
    name: 'Broadside',
    icon: 'Bs',
    tier: 3,
    tags: ['cooldown', 'area', 'damage'],
    text: 'Every 30 seconds (faster with haste), the ship fires a full broadside: a line of 10 depth charges straight through the biggest crowd near you.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.broadside = (c.broadside ?? 12) - dt;
        if (c.broadside > 0) return;
        const spot = crowdCenter(game, p.x, p.y, 520, 100);
        if (!spot) return;
        c.broadside = 30 * p.stats.cooldown;
        const angle = Math.atan2(spot.y - p.y, spot.x - p.x) + Math.PI / 2; // across the line to the crowd
        for (let i = 0; i < 10; i++) {
          const k = (i - 4.5) * 46;
          game.callIn({ x: spot.x + Math.cos(angle) * k, y: spot.y + Math.sin(angle) * k, delay: 0.6 + i * 0.07, radius: 70 * p.stats.area, damage: shipDamage(p) * 1.5, source: SHIP, color: '#ff8a5c' });
        }
        game.announce('Broadside!', 1);
      },
    },
  },
  {
    id: 'allHands',
    name: 'All Hands on Deck',
    icon: 'AH',
    tier: 3,
    tags: ['duration', 'damage'],
    text: 'Every level-up, your crew fights at full strength for 8 seconds (longer with duration). A specialist works twice as fast instead.',
    hooks: {
      levelUp(game) {
        const p = game.player;
        p.counters.allHandsUntil = game.time + 8 * p.stats.duration;
      },
    },
  },
];

// ------------------------------------------------------------ Old Jory, the Shantyman

export const SONG = { kind: 'song' }; // Jory's song effects: not one of your weapons

/**
 * Jory's songs. He sings one at a time and moves on every 12 seconds (Encore makes verses
 * longer). `buff(b, k)` adds to the stat buckets while it's being sung, at strength `k`
 * (1 normally); `tick(game, dt, k)` does anything else it does. Song talents teach him more.
 */
export const SONGS = {
  haulAway: { name: 'Haul Away', text: 'swim 20% faster', buff: (b, k) => (b.speed += 0.2 * k) },
  blowTheManDown: { name: 'Blow the Man Down', text: 'weapons recharge 20% faster', buff: (b, k) => (b.haste += 0.2 * k) },
  leaveHer: {
    name: 'Leave Her, Johnny',
    text: 'heal 2 health per second',
    tick: (game, dt, k) => game.player.heal(2 * k * dt),
  },
  drunkenSailor: { name: 'Drunken Sailor', text: '+20% damage', buff: (b, k) => (b.might += 0.2 * k) },
  wellerman: {
    name: 'Wellerman',
    text: 'pearls fly to you from twice as far and are worth 20% more',
    buff: (b, k) => {
      b.magnet += 1 * k;
      b.growth += 0.2 * k;
    },
  },
  southAustralia: { name: 'South Australia', text: '+25% attack speed', buff: (b, k) => (b.attackSpeed += 0.25 * k) },
  spanishLadies: {
    name: 'Spanish Ladies',
    text: 'enemies near you are 30% slower',
    tick: (game, dt, k) => {
      const p = game.player;
      const reach = 170 * p.stats.area;
      for (const e of game.enemiesNear(p.x, p.y, reach)) {
        if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach) e.slow(Math.max(0.4, 1 - 0.3 * k), 0.2);
      }
    },
  },
};
export const BASE_SONGS = ['haulAway', 'blowTheManDown', 'leaveHer'];

/** A talent that teaches Jory a song (added to the end of his rotation). */
const learn = (song) => (b, r, p, f) => {
  (f.songs ??= []).push(song);
};
const songText = (id) => `Jory learns “${SONGS[id].name}”: while he sings it, ${SONGS[id].text}.`;

const JORY = [
  {
    id: 'drunkenSailor',
    name: 'Drunken Sailor',
    icon: 'DS',
    tier: 1,
    tags: ['damage'],
    text: songText('drunkenSailor'),
    apply: learn('drunkenSailor'),
  },
  {
    id: 'encore',
    name: 'Encore',
    icon: 'En',
    tier: 1,
    ranks: 2,
    tags: ['duration'],
    text: (r) => `Every song lasts ${r === 1 ? 15 : 18} seconds instead of 12.`,
    apply: (b, r, p, f) => {
      f.songLength = 12 + 3 * r;
    },
  },
  {
    id: 'wellerman',
    name: 'Wellerman',
    icon: 'We',
    tier: 1,
    tags: ['magnet', 'growth'],
    text: songText('wellerman'),
    apply: learn('wellerman'),
  },
  {
    id: 'crescendo',
    name: 'Crescendo',
    icon: 'Cr',
    tier: 1,
    tags: ['duration'],
    text: 'Each song builds up: it starts at half strength and ends at one and a half times as strong.',
    apply: flag('crescendo'),
  },
  {
    id: 'grogRation',
    name: 'Grog Ration',
    icon: 'GR',
    tier: 1,
    tags: ['cooldown', 'speed'],
    text: 'Every 30 seconds Jory takes a swig: 4 seconds of every weapon working twice as fast, then 3 seconds of swimming 30% slower.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.grog = (c.grog ?? 20) - dt;
        if (c.grog > 0) return;
        c.grog = 30;
        p.addBuff('overclock', 4);
        c.hangoverFrom = game.time + 4;
        c.hangoverUntil = game.time + 7;
        game.effects.text(p.x, p.y - p.radius - 10, 'Grog!', '#e8a33a', 14);
      },
    },
  },
  {
    id: 'southAustralia',
    name: 'South Australia',
    icon: 'SA',
    tier: 1,
    tags: ['attackSpeed'],
    text: songText('southAustralia'),
    apply: learn('southAustralia'),
  },
  {
    id: 'liquidCourage',
    name: 'Liquid Courage',
    icon: 'LC',
    tier: 2,
    tags: ['health'],
    text: 'While you are below half health, the song Jory is singing is twice as strong.',
    apply: flag('liquidCourage'),
  },
  {
    id: 'spanishLadies',
    name: 'Spanish Ladies',
    icon: 'SL',
    tier: 2,
    tags: ['area'],
    text: songText('spanishLadies'),
    apply: learn('spanishLadies'),
  },
  {
    id: 'finale',
    name: 'Finale',
    icon: 'Fi',
    tier: 2,
    tags: ['area', 'damage'],
    text: 'Every song ends on a big final note: a blast of sound around you. Its damage grows with your level.',
    apply: flag('finale'),
  },
  {
    id: 'harmony',
    name: 'Harmony',
    icon: 'Hm',
    tier: 2,
    tags: ['duration'],
    text: 'The song before lingers: while Jory sings, the previous song still works at half strength.',
    apply: flag('harmony'),
  },
  {
    id: 'rumBarrel',
    name: 'Rum Barrel',
    icon: 'RB',
    tier: 2,
    tags: ['area', 'damage'],
    text: 'Every time the song changes, Jory leaves a rum barrel behind. It blows up when an enemy touches it.',
    apply: flag('rumBarrel'),
  },
  {
    id: 'callAndResponse',
    name: 'Call and Response',
    icon: 'CR',
    tier: 2,
    tags: ['cooldown'],
    text: 'Every time the song changes, all your weapons reload at once.',
    apply: flag('callAndResponse'),
  },
  {
    id: 'seaLegs',
    name: 'Sea Legs',
    icon: 'SL',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Every time the song changes, Jory stamps out the beat: enemies around you are knocked back and you are invulnerable for 1 second (longer with duration).',
    apply: flag('seaLegs'),
  },
  {
    id: 'seaChoir',
    name: 'Sea Choir',
    icon: 'SC',
    tier: 3,
    tags: ['duration'],
    text: 'Jory sings two songs at once: the current one and the next.',
    apply: flag('seaChoir'),
  },
  {
    id: 'ghostChorus',
    name: 'Ghost Ship Chorus',
    icon: 'GC',
    tier: 3,
    tags: ['cooldown', 'duration'],
    text: 'Every 60 seconds (faster with haste), the drowned crew of a ghost ship joins in: every song Jory knows plays at once for 8 seconds (longer with duration).',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.chorus = (c.chorus ?? 40) - dt;
        if (c.chorus > 0) return;
        c.chorus = 60 * p.stats.cooldown;
        c.chorusUntil = game.time + 8 * p.stats.duration;
        p.dirty = true;
        game.announce('The drowned crew sings along', 1.5);
      },
    },
  },
];

// ------------------------------------------------------------ Coralline, reef-grown

export const REEF = { kind: 'reef' }; // Coralline's coral: not one of your weapons
export const coralDamage = (p) => (8 + 2 * p.level) * p.stats.might;

const CORAL = [
  {
    id: 'thickCoral',
    name: 'Thick Coral',
    icon: 'TC',
    tier: 1,
    tags: ['health'],
    text: 'You grow one more coral plate (4 instead of 3).',
    apply: (b, r, p, f) => {
      f.extraPlates = (f.extraPlates ?? 0) + 1;
    },
  },
  {
    id: 'barbedPolyps',
    name: 'Barbed Polyps',
    icon: 'BP',
    tier: 1,
    ranks: 2,
    tags: ['damage'],
    text: (r) => `Enemies that touch you get stung, once a second each${r === 2 ? ', twice as hard' : ''}. The sting grows with your level.`,
    hooks: {
      touched(game, e, rank) {
        const p = game.player;
        const c = p.counters;
        c.barbs ??= new Map();
        if ((c.barbs.get(e.id) ?? 0) > game.time) return;
        c.barbs.set(e.id, game.time + 1);
        if (c.barbs.size > 300) for (const [id, t] of c.barbs) if (t <= game.time) c.barbs.delete(id);
        game.strike(e, coralDamage(p) * 0.5 * rank, REEF, 160, p.x, p.y);
      },
    },
  },
  {
    id: 'rapidGrowth',
    name: 'Rapid Growth',
    icon: 'RG',
    tier: 1,
    ranks: 2,
    tags: ['duration'],
    text: (r) => `Broken plates regrow in ${r === 1 ? 6 : 4.5} seconds instead of 8.`,
    apply: (b, r, p, f) => {
      f.plateRegrow = r === 1 ? 6 : 4.5;
    },
  },
  {
    id: 'fireCoral',
    name: 'Fire Coral',
    icon: 'FC',
    tier: 1,
    tags: ['area', 'damage'],
    text: 'When a plate breaks, it bursts into stinging shards that hit everything around you. Their damage grows with your level.',
    apply: flag('fireCoral'),
  },
  {
    id: 'reefSeed',
    name: 'Reef Seed',
    icon: 'RS',
    tier: 1,
    tags: ['cooldown', 'duration', 'area'],
    text: 'Every 6 seconds (faster with haste), a coral outcrop grows where you are. Enemies can’t swim through it, so they have to go around. It lasts 12 seconds (longer with duration).',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.seed = (c.seed ?? 2) - dt;
        if (c.seed > 0) return;
        c.seed = 6 * p.stats.cooldown;
        game.growReef(p.x - p.facingX * 24, p.y - p.facingY * 24, 26 * p.stats.area, 12 * p.stats.duration);
      },
    },
  },
  {
    id: 'symbiosis',
    name: 'Symbiosis',
    icon: 'Sy',
    tier: 1,
    tags: ['regen'],
    text: 'Every plate that regrows heals you for 4 health.',
    apply: flag('symbiosis'),
  },
  {
    id: 'stingingBloom',
    name: 'Stinging Bloom',
    icon: 'SB',
    tier: 1,
    tags: ['cooldown', 'area', 'duration'],
    text: 'Every 8 seconds (faster with haste), polyps bloom around you and poison everything close: 3 damage per second for 3 seconds (longer with duration), stacking.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.bloom = (c.bloom ?? 4) - dt;
        if (c.bloom > 0) return;
        c.bloom = 8 * p.stats.cooldown;
        const reach = 140 * p.stats.area;
        for (const e of game.enemiesNear(p.x, p.y, reach)) {
          if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (reach + e.radius) ** 2) e.poison(3 * p.stats.might, 3 * p.stats.duration);
        }
        game.effects.ring(p.x, p.y, reach, '#e57fb0');
      },
    },
  },
  {
    id: 'livingStone',
    name: 'Living Stone',
    icon: 'LS',
    tier: 2,
    tags: ['duration'],
    text: 'While you stand still, your plates regrow twice as fast.',
    apply: flag('livingStone'),
  },
  {
    id: 'overgrowth',
    name: 'Overgrowth',
    icon: 'Og',
    tier: 2,
    tags: ['health'],
    text: 'Plates keep growing even when you have them all: up to 2 extra plates on top.',
    apply: flag('overgrowth'),
  },
  {
    id: 'brainCoral',
    name: 'Brain Coral',
    icon: 'BC',
    tier: 2,
    tags: ['damage'],
    text: 'Your coral outcrops sting every enemy that brushes against them, twice a second. The sting grows with your level.',
    apply: flag('brainCoral'),
  },
  {
    id: 'atoll',
    name: 'Atoll',
    icon: 'At',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Your coral outcrops last twice as long and keep growing, up to twice their size.',
    apply: flag('atoll'),
  },
  {
    id: 'petrify',
    name: 'Petrify',
    icon: 'Pt',
    tier: 2,
    tags: ['duration'],
    text: 'Enemies that break one of your plates are turned to stone: pinned for 1.5 seconds (longer with duration). Bosses can’t be pinned.',
    apply: flag('petrify'),
  },
  {
    id: 'reefKeeper',
    name: 'Reef Keeper',
    icon: 'RK',
    tier: 2,
    tags: ['area'],
    text: 'Enemies near your coral outcrops are 35% slower, and you heal 2 health per second while you stand next to one.',
    apply: flag('reefKeeper'),
  },
  {
    id: 'greatBarrier',
    name: 'Great Barrier',
    icon: 'GB',
    tier: 3,
    tags: ['cooldown', 'duration', 'area'],
    text: 'Every 20 seconds (faster with haste), a ring of coral erupts around you and holds the horde back for 4 seconds (longer with duration).',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.barrier = (c.barrier ?? 8) - dt;
        if (c.barrier > 0 || !game.nearestEnemy(p.x, p.y, 200)) return;
        c.barrier = 20 * p.stats.cooldown;
        const ringR = 120 * p.stats.area;
        const n = 12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          game.growReef(p.x + Math.cos(a) * ringR, p.y + Math.sin(a) * ringR, 24 * p.stats.area, 4 * p.stats.duration);
        }
        game.camera.shake(4, 0.2);
      },
    },
  },
  {
    id: 'colossus',
    name: 'Coral Colossus',
    icon: 'CC',
    tier: 3,
    tags: ['duration', 'damage'],
    text: 'When your last plate breaks, you swell into a coral colossus for 5 seconds (longer with duration): nothing can hurt you, and enemies you touch are crushed and thrown aside.',
    apply: flag('colossus'),
    hooks: {
      touched(game, e) {
        const p = game.player;
        if (!((p.counters.colossusUntil ?? -1) > game.time)) return;
        const c = p.counters;
        c.crushed ??= new Map();
        if ((c.crushed.get(e.id) ?? 0) > game.time) return;
        c.crushed.set(e.id, game.time + 0.5);
        game.strike(e, coralDamage(p) * 2, REEF, 420, p.x, p.y);
      },
    },
  },
];

// ------------------------------------------------------------ the Hollow Diver

/**
 * How many levels a level-up card is worth right now: 1 for everyone but the Hollow Diver, whose
 * cards are 25% stronger (75% with One Path), 10% more per empty passive slot (Empty Suit), and
 * 3% more for every card taken so far this dive (Bottomless).
 */
export function cardStrength(p) {
  const f = p.flags;
  if (!f.hollow) return 1;
  let s = f.onePath ? 1.75 : 1.25;
  if (f.emptySuit) s += 0.1 * Math.max(0, CONFIG.slots.passives - p.passives.size);
  if (f.bottomless) s += 0.03 * (p.counters.cardsTaken ?? 0);
  return s;
}

const HOLLOW = [
  {
    id: 'spitItOut',
    name: 'Spit It Out',
    icon: 'SO',
    tier: 1,
    ranks: 2,
    text: (r) => `Don’t like either card? Spit them out and draw new ones, ${r === 1 ? 3 : 5} times a dive.`,
    apply: (b, r, p, f) => {
      f.rerolls = r === 1 ? 3 : 5;
    },
  },
  {
    id: 'hollowOut',
    name: 'Hollow Out',
    icon: 'HO',
    tier: 1,
    text: 'On the level-up screen, you can eat one of your weapons. It’s gone and its slot is free, but its talents stay, and so does its trinket’s effect on your other weapons. An eaten weapon never comes back.',
    apply: flag('hollowOut'),
  },
  {
    id: 'gorge',
    name: 'Gorge',
    icon: 'Gg',
    tier: 1,
    text: 'Every 5th level-up, you take both cards.',
    apply: flag('gorge'),
  },
  {
    id: 'emptySuit',
    name: 'Empty Suit',
    icon: 'ES',
    tier: 1,
    text: 'Each empty passive slot makes your cards another 10% stronger.',
    apply: flag('emptySuit'),
  },
  {
    id: 'gildedHunger',
    name: 'Gilded Hunger',
    icon: 'GH',
    tier: 1,
    text: 'Every chest holds one more upgrade.',
    apply: (b, r, p, f) => {
      f.chestBonus = (f.chestBonus ?? 0) + 1;
    },
  },
  {
    id: 'aftertaste',
    name: 'Aftertaste',
    icon: 'Af',
    tier: 1,
    text: 'The card you pass up comes back at your next level-up, 50% stronger instead of 25%.',
    apply: flag('aftertaste'),
  },
  {
    id: 'pourOut',
    name: 'Pour Out',
    icon: 'PO',
    tier: 1,
    text: 'On the level-up screen, you can pour out one of your passives. It’s gone and its slot is free, and everything it was worth is shared out among your other passives.',
    apply: flag('pourOut'),
  },
  {
    id: 'onePath',
    name: 'One Path',
    icon: 'OP',
    tier: 2,
    text: 'Level-ups show only 1 card, but it’s 75% stronger instead of 25%.',
    apply: (b, r, p, f) => {
      f.onePath = true;
      f.cardCount = 1;
    },
  },
  {
    id: 'devour',
    name: 'Devour',
    icon: 'Dv',
    tier: 2,
    tags: ['health'],
    text: 'You eat the card you pass up: it heals you for 10 health.',
    apply: flag('devour'),
  },
  {
    id: 'overflow',
    name: 'Overflow',
    icon: 'Ov',
    tier: 2,
    text: 'Cards for passives you’ve maxed keep coming. Taking one pours it into your weakest passive.',
    apply: flag('overflow'),
  },
  {
    id: 'twinSockets',
    name: 'Twin Sockets',
    icon: 'TS',
    tier: 2,
    text: 'Each weapon holds two trinkets, but trinket picks show 2 instead of 3.',
    apply: (b, r, p, f) => {
      f.twinSockets = true;
      f.trinketCount = 2;
    },
  },
  {
    id: 'lastMeal',
    name: 'Last Meal',
    icon: 'LM',
    tier: 2,
    text: 'Once a dive, when you would die, you eat your next level-up instead and get back up at half health.',
    hooks: {
      lethal(game) {
        const p = game.player;
        const c = p.counters;
        if (c.lastMealUsed) return false;
        c.lastMealUsed = true;
        c.mealDebt = (c.mealDebt ?? 0) + 1; // the next level-up is skipped (Game.openLevelUp)
        p.hp = p.stats.maxHp * 0.5;
        p.invuln = 2;
        game.effects.burst(p.x, p.y, '#8c7ae6', 24, 220);
        game.audio.play('chomp');
        game.announce('Last Meal!', 1.6);
        return true;
      },
    },
  },
  {
    id: 'innerShrine',
    name: 'Inner Shrine',
    icon: 'IS',
    tier: 2,
    text: 'The suit gets a trinket socket of its own. A trinket there works on every weapon you carry as if it were attached to each one, but loses its effect on your other weapons.',
    apply: flag('innerShrine'),
  },
  {
    id: 'nothingWasted',
    name: 'Nothing Wasted',
    icon: 'NW',
    tier: 3,
    text: 'At every level-up you take both cards: the one you pick, and the other at normal strength.',
    apply: flag('nothingWasted'),
  },
  {
    id: 'bottomless',
    name: 'Bottomless',
    icon: 'Bt',
    tier: 3,
    text: 'Every card you take is 3% stronger than the one before, with no limit.',
    apply: flag('bottomless'),
  },
];

const ROV = { kind: 'rov' }; // Otto's own drone (Laser Sweep): not one of your weapons

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
    id: 'autoLoader',
    name: 'Auto-Loader',
    icon: 'AL',
    tier: 1,
    ranks: 2,
    tags: ['cooldown'],
    text: (r) => `Every ${r === 1 ? '4th' : '3rd'} attack of each weapon reloads it at once.`,
    hooks: {
      weaponFire(game, w, rank) {
        const c = game.player.counters;
        c.loads ??= {};
        c.loads[w.id] = (c.loads[w.id] ?? 0) + 1;
        if (c.loads[w.id] % (rank === 1 ? 4 : 3) === 0) w.timer = 0;
      },
    },
  },
  {
    id: 'emergencyVenting',
    name: 'Emergency Venting',
    icon: 'EV',
    tier: 1,
    ranks: 2,
    tags: ['area', 'duration'],
    text: (r) =>
      r === 1
        ? 'When you get hit, your suit vents a blast that throws nearby enemies back and pins them for 0.5 seconds.'
        : 'When you get hit, your suit vents a bigger blast that throws nearby enemies back and pins them for 1 second.',
    hooks: {
      hurt(game, dmg, rank) {
        const p = game.player;
        const reach = 140 * p.stats.area * (rank === 2 ? 1.4 : 1);
        const near = game
          .enemiesNear(p.x, p.y, reach)
          .filter((e) => !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach);
        for (const e of near) {
          e.knock(420, p.x, p.y);
          e.root(0.5 * rank * p.stats.duration);
        }
        game.effects.ring(p.x, p.y, reach, '#7fe7ff');
      },
    },
  },
  {
    id: 'signalBoost',
    name: 'Signal Boost',
    icon: 'SB',
    tier: 1,
    tags: ['duration', 'damage'],
    text: 'When a marked enemy dies, its mark jumps to the nearest enemy close by, for at least 1 second.',
    hooks: {
      kill(game, { enemy }) {
        if (!(enemy.markedUntil > game.time)) return;
        const next = game.nearestEnemy(enemy.x, enemy.y, 220);
        if (!next) return;
        next.mark(Math.max(enemy.markedUntil, game.time + 1), enemy.markedBy);
        game.effects.beam(enemy.x, enemy.y, next.x, next.y, '#7ff9ff', 1);
      },
    },
  },
  {
    id: 'fieldRepairs',
    name: 'Field Repairs',
    icon: 'FR',
    tier: 1,
    tags: ['regen', 'duration'],
    text: 'Stand still for a second and your suit starts repairing itself: 1.5 health per second, plus double your normal regeneration on top.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.still = p.moving ? 0 : (c.still ?? 0) + dt;
        if (c.still >= 1 && !p.dead) p.heal((1.5 + 2 * p.stats.regen) * dt);
      },
    },
  },
  {
    id: 'laserSweep',
    name: 'Laser Sweep',
    icon: 'LS',
    tier: 1,
    tags: ['cooldown', 'amount', 'damage'],
    text: 'Every 6 seconds (faster with haste), the drone docked on your back sweeps a laser across the 3 nearest enemies (one more per amount). Its damage grows with your level.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.sweep = (c.sweep ?? 2) - dt;
        if (c.sweep > 0) return;
        const reach = 280 * p.stats.area;
        const targets = game
          .enemiesNear(p.x, p.y, reach)
          .filter((e) => !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach)
          .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2))
          .slice(0, 3 + p.stats.amount);
        if (targets.length === 0) return;
        c.sweep = 6 * p.stats.cooldown;
        const damage = (6 + 1.2 * p.level) * p.stats.might;
        const fromX = p.x - p.facingX * 8;
        const fromY = p.y - p.facingY * 8 - 6;
        for (const e of targets) {
          game.effects.beam(fromX, fromY, e.x, e.y, '#7ff9ff', 2);
          game.strike(e, damage, ROV, 40, p.x, p.y);
        }
        game.audio.play('droneShot');
      },
    },
  },
  {
    id: 'towCable',
    name: 'Tow Cable',
    icon: 'TC',
    tier: 2,
    tags: ['speed'],
    text: 'When you get hit, your ROV tows you a short way out of the fight (at most once every 4 seconds).',
    hooks: {
      hurt(game) {
        const p = game.player;
        const c = p.counters;
        if ((c.towReady ?? 0) > game.time) return;
        c.towReady = game.time + 4;
        const e = game.nearestEnemy(p.x, p.y, 200);
        c.tow = { left: 0.18, angle: e ? Math.atan2(p.y - e.y, p.x - e.x) : Math.atan2(-p.facingY, -p.facingX) };
      },
      tick(game, dt) {
        const p = game.player;
        const tow = p.counters.tow;
        if (!tow || tow.left <= 0) return;
        tow.left -= dt;
        p.x += Math.cos(tow.angle) * 480 * dt;
        p.y += Math.sin(tow.angle) * 480 * dt;
      },
    },
  },
  {
    id: 'calibration',
    name: 'Calibration',
    icon: 'Ca',
    tier: 2,
    tags: ['cooldown', 'damage'],
    text: 'After every level-up, each of your weapons’ next attack is overcharged for double damage.',
    hooks: {
      levelUp(game) {
        game.player.counters.calibrated = new Set(game.player.weapons.map((w) => w.id)); // used in game.weaponFired
      },
    },
  },
  {
    id: 'sensorBuoy',
    name: 'Sensor Buoy',
    icon: 'Bu',
    tier: 2,
    tags: ['cooldown', 'area', 'duration'],
    text: 'Every 10 seconds (faster with haste), you drop a sensor buoy that marks every enemy around it for 3 seconds (longer with duration). Marked enemies take 20% more damage from all your weapons.',
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.buoy = (c.buoy ?? 4) - dt;
        if (c.buoy > 0) return;
        const reach = 150 * p.stats.area;
        const near = game.enemiesNear(p.x, p.y, reach).filter((e) => !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach);
        if (near.length === 0) return;
        c.buoy = 10 * p.stats.cooldown;
        for (const e of near) e.mark(game.time + 3 * p.stats.duration, 'buoy');
        game.effects.ring(p.x, p.y, reach, '#7ff9ff');
      },
    },
  },
  {
    id: 'cascade',
    name: 'Cascade',
    icon: 'Cs',
    tier: 2,
    ranks: 2,
    tags: ['duration', 'damage'],
    text: (r) => `When a weapon kills, your other weapons deal 30% more damage for ${r} second${r > 1 ? 's' : ''} (longer with duration).`,
    hooks: {
      kill(game, { source }, rank) {
        const kind = sourceKind(source);
        if (!kind) return;
        const c = game.player.counters;
        c.cascadeFrom = kind;
        c.cascadeUntil = game.time + rank * game.player.stats.duration;
      },
    },
  },
  {
    id: 'failsafe',
    name: 'Failsafe',
    icon: 'Fs',
    tier: 2,
    tags: ['duration', 'area'],
    text: 'Once every 30 seconds, a hit that drops you below 30% health makes you invulnerable for 1.5 seconds (longer with duration) and blasts nearby enemies away.',
    hooks: {
      hurt(game) {
        const p = game.player;
        const c = p.counters;
        if (p.hp <= 0 || p.hp > p.stats.maxHp * 0.3 || (c.failsafeReady ?? 0) > game.time) return;
        c.failsafeReady = game.time + 30;
        p.invuln = Math.max(p.invuln, 1.5 * p.stats.duration);
        const reach = 170 * p.stats.area;
        for (const e of game.enemiesNear(p.x, p.y, reach)) {
          if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach) e.knock(480, p.x, p.y);
        }
        game.effects.ring(p.x, p.y, reach, '#ffd166');
        game.announce('Failsafe!', 1);
      },
    },
  },
  {
    id: 'uplinkRelay',
    name: 'Uplink Relay',
    icon: 'UR',
    tier: 2,
    tags: ['cooldown', 'duration'],
    text: 'Every hit a weapon lands on a marked enemy brings that weapon 0.05 seconds closer to firing.',
    hooks: {
      hit(game, { enemy, projectile }) {
        if (!(enemy.markedUntil > game.time)) return;
        const id = weaponOf(projectile);
        if (id === 'drones') game.hastenLaunch(0.05); // drones keep their floor, so lasers can't loop
        else if (id) {
          const w = game.player.getWeapon(id);
          if (w) w.timer -= 0.05;
        }
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

export const CHARACTER_TALENTS = { otto: OTTO, captain: CAPTAIN, jory: JORY, coral: CORAL, hollow: HOLLOW };
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

// Every talent by id, plus who it belongs to (shown on the card).
const BY_ID = new Map();
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

/** A talent's description at `rank` (multi-rank talents describe each rank). */
export function talentText(t, rank = 1) {
  return typeof t.text === 'function' ? t.text(Math.max(1, rank)) : t.text;
}
