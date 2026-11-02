import { RARITIES } from './augments.js';

/**
 * Gear: what the diver wears. Found by clearing depths, put on in the loadout, one item per
 * slot. Every item has fixed numbers. Each diver has their own gear on; everything found goes
 * into one shared stash.
 *
 *   slot    helmet | suit | gloves | boots | tank
 *   rarity  common (one stat) | uncommon (two) | rare | epic (set pieces)
 *   stats   added to the player's stat buckets (Player.recalcStats), the same buckets talents
 *           and passives use. `health` is a percentage of max health; armor and regen are flat.
 *   set     the set it belongs to: wearing 2 or 3 of its pieces turns on the set's bonuses
 *   from    set pieces only drop from clearing that depth; common and uncommon items drop anywhere
 *   cursed  it has a downside (a stat below zero)
 *   color   the main color of its picture (render/icons.js draws one per slot)
 *
 * Copies: finding an item again makes it 5% stronger (its stats; set bonuses stay the same),
 * up to +50%. Copies after that turn into XP for the diver who found them (systems/gear.js).
 */

export const GEAR_SLOTS = ['helmet', 'suit', 'gloves', 'boots', 'tank'];
export const SLOT_NAMES = { helmet: 'Helmet', suit: 'Suit', gloves: 'Gloves', boots: 'Boots', tank: 'Air Tank' };

/** Gear rarities: the augments' colors, so a color means the same thing everywhere. */
export const GEAR_RARITIES = {
  common: { name: 'Common', color: RARITIES.common.color },
  uncommon: { name: 'Uncommon', color: RARITIES.uncommon.color },
  rare: { name: 'Rare', color: RARITIES.rare.color },
  epic: { name: 'Epic', color: RARITIES.exotic.color },
};
export const GEAR_RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];

export const COPY_BONUS = 0.05; // each copy after the first: +5% to the item's stats
export const MAX_COPIES = 11; // +50%
export const SCRAP_XP = { common: 100, uncommon: 200, rare: 400, epic: 800 }; // a copy past the cap

/** What clearing each depth drops: how many items, and how likely each rarity is. */
export const GEAR_LOOT = {
  shallows: { items: 2, odds: { common: 60, uncommon: 30, rare: 10, epic: 0 } },
  openblue: { items: 3, odds: { common: 40, uncommon: 32, rare: 20, epic: 8 } },
};

// The stat buckets gear can add to, and how each reads on a plaque.
const pct = (v) => `${v < 0 ? '−' : '+'}${round1(Math.abs(v) * 100)}%`;
const flat = (v) => `${v < 0 ? '−' : '+'}${round1(Math.abs(v))}`;
const round1 = (v) => String(Math.round(v * 10) / 10);
export const GEAR_STATS = {
  health: { bucket: 'healthPct', text: (v) => `${pct(v)} max health` },
  damage: { bucket: 'might', text: (v) => `${pct(v)} damage` },
  haste: { bucket: 'haste', text: (v) => `${pct(v)} haste` },
  area: { bucket: 'area', text: (v) => `${pct(v)} size` },
  duration: { bucket: 'duration', text: (v) => `${pct(v)} duration` },
  speed: { bucket: 'speed', text: (v) => `${pct(v)} move speed` },
  magnet: { bucket: 'magnet', text: (v) => `${pct(v)} pickup range` },
  armor: { bucket: 'armor', text: (v) => `${flat(v)} armor` },
  regen: { bucket: 'regen', text: (v) => `${flat(v)} health per second` },
};

export const GEAR = {
  // ---- common and uncommon: plain stats, from any depth
  brassBonnet: { name: 'Brass Bonnet', slot: 'helmet', rarity: 'common', stats: { magnet: 0.1 }, color: '#d6b264' },
  scratchedFaceplate: { name: 'Scratched Faceplate', slot: 'helmet', rarity: 'common', stats: { health: 0.05 }, color: '#b9a27a' },
  twelveBolt: { name: 'Twelve-Bolt Helmet', slot: 'helmet', rarity: 'uncommon', stats: { armor: 1, magnet: 0.08 }, color: '#c98a5e' },

  canvasSuit: { name: 'Patched Canvas Suit', slot: 'suit', rarity: 'common', stats: { health: 0.06 }, color: '#b8a888' },
  oilskinSuit: { name: 'Oilskin Suit', slot: 'suit', rarity: 'common', stats: { regen: 0.2 }, color: '#c9a640' },
  quiltedSuit: { name: 'Quilted Undersuit', slot: 'suit', rarity: 'uncommon', stats: { health: 0.08, regen: 0.15 }, color: '#8a9db0' },

  rivetedGloves: { name: 'Riveted Gloves', slot: 'gloves', rarity: 'common', stats: { damage: 0.04 }, color: '#8b5a3c' },
  greasedGloves: { name: 'Greased Gloves', slot: 'gloves', rarity: 'common', stats: { haste: 0.04 }, color: '#4a4a44' },
  steelcapGloves: { name: 'Steelcap Gauntlets', slot: 'gloves', rarity: 'uncommon', stats: { damage: 0.05, haste: 0.03 }, color: '#9aa4a8' },

  corkBoots: { name: 'Cork-Soled Boots', slot: 'boots', rarity: 'common', stats: { speed: 0.05 }, color: '#a87a4e' },
  leadBoots: { name: 'Lead Boots', slot: 'boots', rarity: 'common', stats: { armor: 1 }, color: '#6f767a' },
  finBoots: { name: 'Fin Boots', slot: 'boots', rarity: 'uncommon', stats: { speed: 0.06, magnet: 0.06 }, color: '#3f8f8a' },

  spareTank: { name: 'Spare Air Tank', slot: 'tank', rarity: 'common', stats: { duration: 0.06 }, color: '#c0c6c8' },
  pressureTank: { name: 'Pressure Tank', slot: 'tank', rarity: 'common', stats: { area: 0.05 }, color: '#c25a3a' },
  twinTanks: { name: 'Twin Tanks', slot: 'tank', rarity: 'uncommon', stats: { duration: 0.05, area: 0.04 }, color: '#d6b264' },

  // ---- Pearl Diver's Kit (Sunlit Shallows)
  pearlGoggles: { name: 'Pearl Diver’s Goggles', slot: 'helmet', rarity: 'rare', set: 'pearlDiver', from: 'shallows', stats: { magnet: 0.08 }, color: '#e8e2d0' },
  pearlWrap: { name: 'Pearl Diver’s Wrap', slot: 'suit', rarity: 'rare', set: 'pearlDiver', from: 'shallows', stats: { health: 0.05 }, color: '#e8e2d0' },
  pearlFins: { name: 'Pearl Diver’s Fins', slot: 'boots', rarity: 'rare', set: 'pearlDiver', from: 'shallows', stats: { speed: 0.04 }, color: '#e8e2d0' },

  // ---- Choir of the Drowned (Sunlit Shallows)
  choirBell: { name: 'Choirmaster’s Bell', slot: 'helmet', rarity: 'rare', set: 'choir', from: 'shallows', stats: { area: 0.05 }, color: '#7fb3a4' },
  choirGloves: { name: 'Conductor’s Gloves', slot: 'gloves', rarity: 'rare', set: 'choir', from: 'shallows', stats: { haste: 0.03 }, color: '#7fb3a4' },
  choirTank: { name: 'Bellows Tank', slot: 'tank', rarity: 'rare', set: 'choir', from: 'shallows', stats: { duration: 0.05 }, color: '#7fb3a4' },

  // ---- Lamplighter's Rig (The Open Blue)
  lampHelmet: { name: 'Lamplighter’s Helmet', slot: 'helmet', rarity: 'rare', set: 'lamplighter', from: 'openblue', stats: { magnet: 0.08 }, color: '#ffc35a' },
  lampGloves: { name: 'Wick Gloves', slot: 'gloves', rarity: 'rare', set: 'lamplighter', from: 'openblue', stats: { damage: 0.03 }, color: '#ffc35a' },
  lampTank: { name: 'Oil Tank', slot: 'tank', rarity: 'rare', set: 'lamplighter', from: 'openblue', stats: { duration: 0.05 }, color: '#ffc35a' },

  // ---- Leviathan Hide (The Open Blue)
  leviathanCoat: { name: 'Leviathan Hide Coat', slot: 'suit', rarity: 'epic', set: 'leviathan', from: 'openblue', stats: { health: 0.06 }, color: '#4d6b7a' },
  leviathanGloves: { name: 'Leviathan Tooth Gloves', slot: 'gloves', rarity: 'epic', set: 'leviathan', from: 'openblue', stats: { damage: 0.04 }, color: '#4d6b7a' },
  leviathanBoots: { name: 'Leviathan Fin Boots', slot: 'boots', rarity: 'epic', set: 'leviathan', from: 'openblue', stats: { speed: 0.04 }, color: '#4d6b7a' },

  // ---- The Omen's Regalia (The Open Blue): cursed, every piece costs something
  omenCrown: { name: 'Omen’s Crown', slot: 'helmet', rarity: 'epic', set: 'omen', from: 'openblue', cursed: true, stats: { damage: 0.12, health: -0.08 }, color: '#5b3a6e' },
  omenShroud: { name: 'Omen’s Shroud', slot: 'suit', rarity: 'epic', set: 'omen', from: 'openblue', cursed: true, stats: { haste: 0.1, speed: -0.06 }, color: '#5b3a6e' },
  omenLung: { name: 'Omen’s Lung', slot: 'tank', rarity: 'epic', set: 'omen', from: 'openblue', cursed: true, stats: { area: 0.1, armor: -1 }, color: '#5b3a6e' },
};

// ------------------------------------------------ set bonuses

const LAMP_HALF_ANGLE = 0.45; // radians either side of where you swim (about 26°)

/** Is enemy `e` in the Lamplighter's beam? `reach` in pixels. */
export function inLampBeam(p, e, reach) {
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > reach + e.radius) return false;
  if (d < p.radius + e.radius) return true;
  const f = Math.hypot(p.facingX, p.facingY) || 1;
  return (dx * p.facingX + dy * p.facingY) / (d * f) > Math.cos(LAMP_HALF_ANGLE);
}

/**
 * Each set's bonuses. `text[n]` is what wearing n pieces does (3 includes 2). The bonus works like
 * a talent (data/talents.js): `apply` sets flags, `hooks` react to the dive. `rank` is how many
 * pieces you wear. `suits` says which weapons it helps most, for the plaque.
 */
export const GEAR_SETS = {
  pearlDiver: {
    name: 'Pearl Diver’s Kit',
    suits: 'Best with weapons that clear crowds fast, and lots of pickup range.',
    text: {
      2: 'Every pearl you pick up adds 1% damage, up to 15%. Go 4 seconds without one and it fades.',
      3: 'Up to 30%, and it lasts 8 seconds.',
    },
    apply: (b, rank, p, f) => {
      f.pearlRush = rank;
    },
    hooks: {
      pickup(game, pk, rank) {
        if (pk.kind !== 'xp') return;
        const c = game.player.counters;
        c.pearlRush = Math.min(rank >= 3 ? 30 : 15, (c.pearlRush ?? 0) + 1);
        c.pearlRushAt = game.time;
      },
      tick(game, dt, rank) {
        const c = game.player.counters;
        if (c.pearlRush && game.time - c.pearlRushAt > (rank >= 3 ? 8 : 4)) c.pearlRush = 0;
      },
    },
  },
  choir: {
    name: 'Choir of the Drowned',
    suits: 'Best with short-range weapons and weapons that hit an area.',
    text: {
      2: 'Every 15 seconds you sing a note: enemies near you stop to listen for 2 seconds (elites for 1; bosses don’t stop).',
      3: 'The song reaches twice as far, and listening enemies take 20% more damage.',
    },
    apply: (b, rank, p, f) => {
      f.choir = rank;
    },
    hooks: {
      tick(game, dt, rank) {
        const p = game.player;
        const c = p.counters;
        c.choirTimer = (c.choirTimer ?? 15) - dt;
        if (c.choirTimer > 0) return;
        c.choirTimer = 15;
        const radius = (rank >= 3 ? 440 : 220) * p.stats.area;
        game.effects.ring(p.x, p.y, radius, '#bfe6d8');
        game.audio.play('song');
        let notes = 0;
        for (const e of game.enemiesNear(p.x, p.y, radius)) {
          if (e.dead || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (radius + e.radius) ** 2) continue;
          const seconds = e.boss || e.elite ? 1 : 2;
          e.root(seconds); // bosses can't be pinned, but they still listen (and take the extra damage)
          e.listenUntil = game.time + seconds;
          if (notes++ < 18) game.effects.text(e.x, e.y - e.radius - 6, '♪', '#bfe6d8', 16);
        }
      },
    },
  },
  lamplighter: {
    name: 'Lamplighter’s Rig',
    suits: 'Best with weapons that fire the way you swim: Harpoon, Needle Darts, Trident.',
    text: {
      2: 'Your helmet lamp shines a beam the way you swim: enemies in it take 15% more damage.',
      3: 'The beam reaches twice as far, and enemies in it take 30% more damage.',
    },
    apply: (b, rank, p, f) => {
      f.lampBeam = rank;
    },
    hooks: {
      draw(game, ctx, rank) {
        const p = game.player;
        const reach = rank >= 3 ? 560 : 280;
        const angle = Math.atan2(p.facingY, p.facingX);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p.rx, p.ry, p.radius, p.rx, p.ry, reach);
        g.addColorStop(0, 'rgba(255, 214, 140, 0.22)');
        g.addColorStop(1, 'rgba(255, 214, 140, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(p.rx, p.ry);
        ctx.arc(p.rx, p.ry, reach, angle - LAMP_HALF_ANGLE, angle + LAMP_HALF_ANGLE);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      },
    },
  },
  leviathan: {
    name: 'Leviathan Hide',
    suits: 'Best with weapons that hit often: Needle Darts, Eel Lance, drones, Razor Starfish.',
    text: {
      2: 'Every 10th hit you land is a bite: 25 extra damage (more with damage bonuses).',
      3: 'Every 6th hit bites, for 50 extra damage.',
    },
    hooks: {
      hit(game, { enemy }, rank) {
        const p = game.player;
        if (!enemy || enemy.dead) return;
        p.counters.leviathanHits = (p.counters.leviathanHits ?? 0) + 1;
        if (p.counters.leviathanHits < (rank >= 3 ? 6 : 10)) return;
        p.counters.leviathanHits = 0;
        game.effects.burst(enemy.x, enemy.y, '#c94c4c', 8, 160);
        game.audio.play('chomp');
        enemy.hit((rank >= 3 ? 50 : 25) * p.stats.might, game, 0, enemy.x, enemy.y, null);
      },
    },
  },
  omen: {
    name: 'The Omen’s Regalia',
    suits: 'Cursed. Good with anything, if you can live with the cost.',
    text: {
      2: 'Every 30 seconds the deep’s heartbeat pulses: every enemy on screen loses 10% of its health (bosses and elites 3%).',
      3: 'Once per dive, when you would die, the deep keeps you: you’re back at full health and everything near you is thrown back.',
    },
    hooks: {
      tick(game, dt) {
        const p = game.player;
        const c = p.counters;
        c.omenTimer = (c.omenTimer ?? 30) - dt;
        if (c.omenTimer > 0) return;
        c.omenTimer = 30;
        const cam = game.camera;
        game.effects.ring(p.x, p.y, Math.max(cam.viewW, cam.viewH) * 0.6, '#b07ad6');
        game.camera.shake(6, 0.3);
        game.audio.play('heartbeat');
        for (const e of [...game.enemies]) {
          if (e.dead || Math.abs(e.x - cam.x) > cam.viewW / 2 + e.radius || Math.abs(e.y - cam.y) > cam.viewH / 2 + e.radius) continue;
          e.hit(e.maxHp * (e.boss || e.elite ? 0.03 : 0.1), game, 0, e.x, e.y, null);
        }
      },
      lethal(game, payload, rank) {
        const p = game.player;
        if (rank < 3 || p.counters.omenSaved) return false;
        p.counters.omenSaved = true;
        p.hp = p.stats.maxHp;
        p.invuln = 2;
        game.effects.ring(p.x, p.y, 240, '#b07ad6');
        game.camera.shake(10, 0.4);
        game.audio.play('heartbeat');
        for (const e of game.enemiesNear(p.x, p.y, 240)) if (!e.dead) e.knock(420, p.x, p.y);
        game.announce('The deep won’t let you go', 2);
        return true;
      },
    },
  },
};

/** The text of an item's stats at `strength` (1 = as found; copies make it stronger). */
export function gearStatLines(item, strength = 1) {
  return Object.entries(item.stats).map(([stat, v]) => GEAR_STATS[stat].text(v * strength));
}
