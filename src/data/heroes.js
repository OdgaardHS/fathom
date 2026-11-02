import { BASE_SONGS, CHARACTER_TALENTS, REEF, SONG, SONGS, cardStrength, coralDamage, reloadAll } from './talents.js';

/**
 * The expedition crew. A character is a unique passive plus a talent tree of their own
 * (data/trees.js). Weapons are picked separately before each dive, so any character can use
 * any weapon you've unlocked.
 *
 *   name, role, blurb              shown on the character select screen
 *   statsText                      optional: base stats that differ from everyone else's, also
 *                                  shown there (left out when there's nothing different)
 *   accent, palette                UI color, and the diver sprite's colors and `gear`
 *                                  (their kit, see drawDiver in render/sprites.js)
 *   stats(b)                       base stat changes, in the same buckets passives use
 *   trait                          the passive: { name, text, tags?, apply?, derive?, hooks? }
 *   hud(game)                      optional extra HUD line (Jory's song, Coralline's plates)
 *   talents                        this character's talents (data/talents.js)
 *   secret                         optional: hidden until unlocked (Game.isHeroUnlocked)
 */
export const HEROES = {
  otto: {
    name: 'Otto Brask',
    role: 'ROV Pilot',
    blurb: 'Keeps machines running longer than they should.',
    statsText: '90 health, 10 less than usual',
    accent: '#7ff9ff',
    palette: { suit: '#2f5f7f', helmet: '#f2a541', trim: '#7a4a12', fins: '#1f3b4d', gear: 'pilot' },
    stats(b) {
      b.maxHp -= 10;
    },
    trait: {
      name: 'Field Engineer',
      text: '+20% duration',
      tags: ['duration'],
      apply(b) {
        b.duration += 0.2;
      },
    },
    talents: CHARACTER_TALENTS.otto,
  },

  captain: {
    name: 'Captain Isolde Crane',
    role: 'Expedition Commander',
    blurb: 'Her ship is right above you, and she’s on the radio.',
    accent: '#e9c46a',
    palette: { suit: '#22355e', coat: '#1b2a4a', helmet: '#2b3f6b', trim: '#0f1a30', fins: '#141e33', gear: 'captain' },
    stats() {},
    trait: {
      name: 'First Mate',
      text: 'A crewmate dives at your side and fires weaker copies of all your weapons (35% damage).',
      apply(b, r, p, f) {
        f.crew = true; // the game keeps the crewmates in step with this (Game.syncCrew)
      },
    },
    talents: CHARACTER_TALENTS.captain,
  },

  jory: {
    name: 'Old Jory',
    role: 'Shantyman',
    blurb: 'Sings the crew through the dark. The sea seems to listen.',
    accent: '#e8a33a',
    palette: { suit: '#d9a636', helmet: '#c8963e', trim: '#6e4f1a', fins: '#3b2a18', gear: 'shanty' },
    stats() {},
    trait: {
      name: 'Shanty',
      text: 'Jory is always singing, and each song helps while he sings it: Haul Away (swim faster), Blow the Man Down (weapons recharge faster) and Leave Her, Johnny (heal over time). He moves on to the next song every 12 seconds.',
      apply(b, r, p, f) {
        f.shanty = true;
      },
      // The songs being sung add their buffs once every talent has had its say (Encore, new songs...).
      derive(b, r, p, f) {
        for (const [id, k] of activeSongs(p, f)) SONGS[id].buff?.(b, k);
        const c = p.counters;
        if ((c.hangoverFrom ?? Infinity) <= (c.now ?? 0) && (c.now ?? 0) < (c.hangoverUntil ?? -1)) b.speed -= 0.3; // Grog Ration
      },
      hooks: {
        tick(game, dt) {
          singTick(game, dt);
        },
        draw(game, ctx) {
          for (const barrel of game.player.counters.barrels ?? []) drawBarrel(ctx, barrel);
        },
      },
    },
    hud(game) {
      const p = game.player;
      const songs = activeSongs(p, p.flags).filter(([, , lingering]) => !lingering);
      const left = Math.ceil((p.flags.songLength ?? 12) - (p.counters.songTime ?? 0));
      return `♪ ${songs.map(([id]) => SONGS[id].name).join(' + ')} · ${left}s`;
    },
    talents: CHARACTER_TALENTS.jory,
  },

  coral: {
    name: 'Coralline',
    role: 'Reef-grown',
    blurb: 'Half diver, half reef. Whatever breaks off grows back.',
    statsText: '160 health and swims 15% slower than usual',
    accent: '#e57fb0',
    palette: { suit: '#5d7480', helmet: '#7d8f98', trim: '#3a4a52', fins: '#3d2f4f', gear: 'coral' },
    stats(b) {
      b.maxHp += 60;
      b.speed -= 0.15;
    },
    trait: {
      name: 'Coral Armor',
      text: 'Coral plates cover her. Each plate blocks one hit completely, then breaks off and regrows after 8 seconds. She starts with 3.',
      apply(b, r, p, f) {
        f.coral = true;
      },
      hooks: {
        tick(game, dt) {
          growPlates(game, dt);
        },
        shield(game) {
          return breakPlate(game);
        },
        draw(game, ctx) {
          drawPlates(ctx, game);
        },
      },
    },
    hud(game) {
      const p = game.player;
      const colossus = (p.counters.colossusUntil ?? -1) > game.time;
      return colossus ? 'Coral Colossus!' : `Coral plates ${p.counters.plates ?? 0}/${maxPlates(p.flags)}`;
    },
    talents: CHARACTER_TALENTS.coral,
  },

  hollow: {
    name: 'The Hollow Diver',
    role: 'Nobody inside',
    blurb: 'An empty suit that something else is wearing. It has nothing of its own, so it takes only what it wants.',
    accent: '#8c7ae6',
    // An old copper suit gone green. No air tank: it doesn't breathe, and dark wisps leak from it.
    palette: { suit: '#3c6555', helmet: '#8fbfa3', trim: '#24392f', fins: '#1c2a26', gear: 'hollow', tank: false, wisps: true },
    secret: true, // hidden on the loadout until you clear a depth with only one weapon
    stats() {},
    trait: {
      name: 'Hollow',
      text: 'Level-ups show 2 cards instead of 3, but the card you take is 25% stronger: passives give 25% more, and a weapon level-up improves its weapon 25% more.',
      apply(b, r, p, f) {
        f.hollow = true;
        f.cardCount = 2;
      },
    },
    hud(game) {
      const s = cardStrength(game.player);
      return `Hollow · cards ${Math.round((s - 1) * 100)}% stronger`;
    },
    talents: CHARACTER_TALENTS.hollow,
  },
};

/** Order on the character select screen. */
export const HERO_ORDER = ['otto', 'captain', 'jory', 'coral', 'hollow'];

// ------------------------------------------------------------------ Jory's songs

const knownSongs = (f) => [...BASE_SONGS, ...(f.songs ?? [])];

/**
 * The songs being sung right now, as [songId, strength, lingering]. Strength is 1 normally; Crescendo
 * builds it up over a verse, Liquid Courage doubles it at low health, Harmony keeps the last
 * song going at half, Sea Choir adds the next song, and the Ghost Ship Chorus sings them all.
 */
function activeSongs(p, f) {
  const c = p.counters;
  const known = knownSongs(f);
  const now = c.now ?? 0;
  const i = (c.songIndex ?? 0) % known.length;
  const length = f.songLength ?? 12;
  let k = 1;
  if (f.crescendo) k *= 0.5 + Math.min(1, (c.songTime ?? 0) / length);
  if (f.liquidCourage && p.stats && p.hp < p.stats.maxHp * 0.5) k *= 2;
  const list = [[known[i], k]];
  if (f.seaChoir && known.length > 1) list.push([known[(i + 1) % known.length], k]);
  if (f.harmony && c.songChanged && known.length > 1) list.push([known[(i - 1 + known.length) % known.length], 0.5, true]);
  if ((c.chorusUntil ?? -1) > now) for (const id of known) if (!list.some(([s]) => s === id)) list.push([id, 1]);
  return list;
}

function singTick(game, dt) {
  const p = game.player;
  const f = p.flags;
  const c = p.counters;
  c.now = game.time;
  const known = knownSongs(f);
  c.songTime = (c.songTime ?? 0) + dt;
  if (c.songTime >= (f.songLength ?? 12)) {
    c.songTime = 0;
    c.songIndex = ((c.songIndex ?? 0) + 1) % known.length;
    c.songChanged = true;
    songChanged(game, known[c.songIndex]);
  }
  for (const [id, k] of activeSongs(p, f)) SONGS[id].tick?.(game, dt, k);
  // Buffs shift during a song (Crescendo, Liquid Courage, Grog): refresh the stats twice a second.
  c.refresh = (c.refresh ?? 0) - dt;
  if (c.refresh <= 0) {
    c.refresh = 0.5;
    p.dirty = true;
  }
  // a few notes drifting up while he sings
  c.note = (c.note ?? 0) - dt;
  if (c.note <= 0) {
    c.note = 0.7;
    game.effects.text(p.x + (Math.random() - 0.5) * 20, p.y - p.radius - 6, Math.random() < 0.5 ? '♪' : '♫', '#ffe2a8', 13);
  }
  // Rum Barrel: barrels blow when an enemy touches them
  if (c.barrels?.length) {
    c.barrels = c.barrels.filter((barrel) => {
      if (game.time > barrel.until) return false;
      const near = game.nearestEnemy(barrel.x, barrel.y, 24);
      if (!near) return true;
      game.blast(barrel.x, barrel.y, 90 * p.stats.area, (12 + 3 * p.level) * p.stats.might, SONG, { color: '#d98b3a', knockback: 260 });
      game.audio.play('snapBurst');
      return false;
    });
  }
}

/** A new song starts: everything that happens "every time the song changes". */
function songChanged(game, id) {
  const p = game.player;
  const f = p.flags;
  p.dirty = true;
  game.audio.play('song');
  game.effects.text(p.x, p.y - p.radius - 22, `♪ ${SONGS[id].name}`, '#ffd98a', 14);
  if (f.finale) game.blast(p.x, p.y, 150 * p.stats.area, (10 + 2 * p.level) * p.stats.might, SONG, { color: '#ffd166', knockback: 220 });
  if (f.callAndResponse) reloadAll(p, Infinity);
  if (f.seaLegs) {
    p.invuln = Math.max(p.invuln, 1 * p.stats.duration);
    const reach = 130 * p.stats.area;
    for (const e of game.enemiesNear(p.x, p.y, reach)) {
      if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach) e.knock(380, p.x, p.y);
    }
    game.effects.ring(p.x, p.y, reach, '#ffe2a8');
  }
  if (f.rumBarrel) (p.counters.barrels ??= []).push({ x: p.x, y: p.y, until: game.time + 25 });
}

function drawBarrel(ctx, b) {
  ctx.fillStyle = '#8a5a2b';
  ctx.strokeStyle = '#3d2610';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#c9a46a';
  ctx.lineWidth = 1.5;
  for (const y of [-5, 5]) {
    ctx.beginPath();
    ctx.moveTo(b.x - 9, b.y + y);
    ctx.lineTo(b.x + 9, b.y + y);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ Coralline's plates

const maxPlates = (f) => 3 + (f.extraPlates ?? 0) + (f.overgrowth ? 2 : 0);

function growPlates(game, dt) {
  const p = game.player;
  const f = p.flags;
  const c = p.counters;
  const max = maxPlates(f);
  c.plates ??= 3 + (f.extraPlates ?? 0);
  if (c.plates >= max) {
    c.regrow = 0;
    return;
  }
  const rate = f.livingStone && !p.moving ? 2 : 1; // Living Stone
  c.regrow = (c.regrow ?? 0) + dt * rate;
  if (c.regrow < (f.plateRegrow ?? 8)) return;
  c.regrow = 0;
  c.plates++;
  if (f.symbiosis) p.heal(4);
  game.effects.burst(p.x, p.y, '#f5a3c0', 5, 60);
}

/** A hit lands: a plate takes it instead (or the Colossus shrugs it off). */
function breakPlate(game) {
  const p = game.player;
  const f = p.flags;
  const c = p.counters;
  if ((c.colossusUntil ?? -1) > game.time) return true;
  if (!(c.plates > 0)) return false;
  c.plates--;
  p.invuln = Math.max(p.invuln, 0.35);
  game.effects.burst(p.x, p.y, '#ff9f7a', 10, 160);
  game.audio.play('coralBreak');
  if (f.fireCoral) game.blast(p.x, p.y, 110 * p.stats.area, coralDamage(p), REEF, { color: '#ff7a59', knockback: 200 });
  if (f.petrify) {
    for (const e of game.enemiesNear(p.x, p.y, p.radius + 30)) {
      if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (p.radius + e.radius + 8) ** 2) e.root(1.5 * p.stats.duration);
    }
  }
  if (f.colossus && c.plates === 0) {
    c.colossusUntil = game.time + 5 * p.stats.duration;
    game.announce('Coral Colossus!', 1.2);
    game.camera.shake(6, 0.3);
  }
  return true;
}

/** The plates, as coral nubs circling her; a big coral aura while she's a Colossus. */
function drawPlates(ctx, game) {
  const p = game.player;
  const c = p.counters;
  if ((c.colossusUntil ?? -1) > game.time) {
    ctx.fillStyle = 'rgba(229, 127, 176, 0.22)';
    ctx.strokeStyle = 'rgba(255, 159, 122, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, p.radius * 2.1 + Math.sin(game.time * 6) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const n = c.plates ?? 0;
  for (let i = 0; i < n; i++) {
    const a = game.time * 0.8 + (i / Math.max(1, n)) * Math.PI * 2;
    const x = p.rx + Math.cos(a) * (p.radius + 9);
    const y = p.ry + Math.sin(a) * (p.radius + 9);
    ctx.fillStyle = i % 2 ? '#f28a4b' : '#e57fb0';
    ctx.strokeStyle = 'rgba(80, 20, 40, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x - 1.2, y - 1.2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}
