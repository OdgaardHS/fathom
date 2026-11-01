import { Audio } from './audio/audio.js';
import { CONFIG } from './config.js';
import { Camera } from './core/camera.js';
import { TAU, createRng, randomSeed } from './core/math.js';
import { SpatialGrid } from './core/spatialGrid.js';
import { loadHeroChoice, loadProgress, loadWeaponChoice, saveHeroChoice, saveProgress, saveWeaponChoice } from './core/storage.js';
import { ENEMY_TYPES, MAX_ENEMY_RADIUS } from './data/enemies.js';
import { HEROES, HERO_ORDER } from './data/heroes.js';
import { LEVELS, bossTime, isPlayable } from './data/levels.js';
import { PASSIVES } from './data/passives.js';
import { TIER_COLORS, findTalent } from './data/talents.js';
import { TRINKETS, UNDERTOW_RETURN } from './data/trinkets.js';
import { WEAPONS, weaponsUsing } from './data/weapons.js';
import { Drone } from './entities/drone.js';
import { Enemy, resetEnemyIds } from './entities/enemy.js';
import { Hazard } from './entities/hazard.js';
import { Pickup } from './entities/pickup.js';
import { Player } from './entities/player.js';
import { Projectile, isHarpoon, sourceKind } from './entities/projectile.js';
import { drawDebug } from './render/debug.js';
import { drawHeartbeat } from './render/omens.js';
import { getTheme } from './render/themes/index.js';
import { Effects } from './systems/effects.js';
import { Spawner } from './systems/spawner.js';
import { applyUpgrade, canTakeTrinket, rollTalents, rollTrinkets, rollUpgrades, socketOptions } from './systems/upgrades.js';
import { drawHud } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const DEATH_DELAY = 1.2; // seconds between dying and the game-over screen
const CLEAR_DELAY = 4; // seconds between killing the final boss and the depth-cleared screen
const OVERCHARGED_DRONE = { power: 3, size: 2 }; // Conductor Coil on the Drone Launcher
const NORMAL_ATTACK = { damage: 1, size: 1, color: null, charged: false }; // see weaponFired
// Sound of each weapon's regular attack. Razor Starfish and Siphonophore Tendrils sound on hits instead.
const FIRE_SOUNDS = {
  harpoon: 'harpoon',
  darts: 'darts',
  drones: 'droneLaunch',
  sonar: 'sonar',
  eel: 'zap',
  ink: 'squirt',
  trident: 'thrust',
  bubbles: 'bubbleShot',
  lure: 'lureCast',
  shrimp: 'snap',
  eye: 'eyeLock',
};
const SPLIT_SEEK = 260; // Split Coral pieces aim at enemies this close to where the shot split
const FENCE_REACH = 170; // Laser Fence: longest link between two drones (× size stat)
const FENCE_PULSE = 0.35; // Laser Fence: seconds between hits on enemies crossing a link (÷ attack speed)
const FENCE_DAMAGE = 0.6; // Laser Fence: share of a laser hit
const NUMBER_KEYS = [
  ['Digit1', 'Numpad1'],
  ['Digit2', 'Numpad2'],
  ['Digit3', 'Numpad3'],
  ['Digit4', 'Numpad4'],
  ['Digit5', 'Numpad5'],
  ['Digit6', 'Numpad6'],
  ['Digit7', 'Numpad7'],
  ['Digit8', 'Numpad8'],
  ['Digit9', 'Numpad9'],
];

/**
 * Owns a dive: entities, systems, the state machine and draw order.
 *
 *   title ─▶ heroes ─▶ weapons ─▶ depths ─dive─▶ playing ◀──▶ paused
 *                                   ▲              │  ▲
 *                                   │      level up▼  │pick
 *                                   │            levelup   (every 5th level: talents;
 *                                   │              │        elite chests: trinket, then a weapon for it)
 *                                   │              │
 *                                   ├── gameover ◀─┤ player dies   (retry ─▶ playing)
 *                                   └── cleared ◀──┘ final boss dies
 */
export class Game {
  constructor({ screen, input, uiRoot }) {
    this.screen = screen;
    this.input = input;
    this.camera = new Camera();
    this.camera.resize(screen.width, screen.height);
    this.grid = new SpatialGrid(64);
    this.effects = new Effects();
    this.scratch = [];
    this.debug = new URLSearchParams(location.search).has('debug');
    this.fps = 60;
    this.idleTime = 0;
    this.progress = loadProgress();
    this.audio = new Audio(); // sound effects and music (src/audio/)
    const savedHero = loadHeroChoice();
    this.heroId = HEROES[savedHero] ? savedHero : CONFIG.defaultHero;
    const savedWeapon = loadWeaponChoice();
    this.weaponId = WEAPONS[savedWeapon] && this.isWeaponUnlocked(savedWeapon) ? savedWeapon : CONFIG.defaultWeapon;

    this.level = LEVELS[0];
    this.theme = getTheme(this.level.theme);
    this.state = 'title';
    this.player = null;
    this.resetWorld();

    this.menus = new Menus(uiRoot, {
      start: () => this.state === 'title' && this.setState('heroes'),
      back: () => {
        if (this.state === 'heroes') this.setState('title');
        else if (this.state === 'weapons') this.setState('heroes');
        else if (this.state === 'depths') this.setState('weapons');
      },
      hero: (id) => this.state === 'heroes' && this.chooseHero(id),
      weapon: (id) => this.state === 'weapons' && this.chooseWeapon(id),
      dive: (id) => this.state === 'depths' && this.startRun(id),
      restart: () => this.state === 'gameover' && this.startRun(this.level.id),
      depths: () => this.toDepths(),
      resume: () => this.state === 'paused' && this.setState('playing'),
      pick: (i) => this.pickUpgrade(Number(i)),
      reroll: () => this.reroll(),
      toggleMusic: () => this.toggleAudio('music'),
      toggleSfx: () => this.toggleAudio('sfx'),
    });
    this.menus.setAudioLabels(this.audio.settings);
    this.menus.showTitle();

    // Pause automatically when the tab is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setState('paused');
    });
  }

  // ---------------------------------------------------------------- run state

  resetWorld() {
    this.time = 0;
    this.kills = 0;
    this.enemies = [];
    this.allies = [];
    this.projectiles = [];
    this.enemyShots = [];
    this.hazards = [];
    this.pickups = [];
    this.gemCount = 0;
    this.boss = null;
    this.announcement = null;
    this.levelQueue = []; // pending level-ups: 'normal', 'talent' or 'trinket'
    this.levelKind = 'normal'; // what the level-up screen shows: those three, or 'socket'
    this.choices = [];
    this.pendingTrinket = null; // trinket picked, waiting for you to choose its weapon
    this.rerolls = CONFIG.talents.rerollsPerDive;
    this.deathTimer = 0;
    this.clearing = 0;
    this.clearedAt = null;
    this.heartbeat = null;
    this.newBest = false;
    this.effects.clear();
  }

  chooseHero(id) {
    if (!HEROES[id]) return;
    this.heroId = id;
    saveHeroChoice(id);
    this.setState('weapons');
  }

  chooseWeapon(id) {
    if (!WEAPONS[id] || !this.isWeaponUnlocked(id)) return;
    this.weaponId = id;
    saveWeaponChoice(id);
    this.setState('depths');
  }

  /**
   * Weapons you can start a dive with. For now everything is unlocked (CONFIG.unlockAllWeapons),
   * except weapons found deeper down (`foundFrom` on the weapon): those unlock once you've taken
   * one on a dive. Debug mode (F3) unlocks everything.
   */
  isWeaponUnlocked(id) {
    const found = Boolean(this.progress.unlockedWeapons?.includes(id));
    if (WEAPONS[id]?.foundFrom) return found || this.debug;
    return CONFIG.unlockAllWeapons || found;
  }

  /** Whether level-ups on this dive can offer weapon `id` (deep weapons only show up from their depth on). */
  canFindWeapon(id) {
    const from = WEAPONS[id]?.foundFrom;
    if (!from) return true;
    return LEVELS.indexOf(this.level) >= LEVELS.findIndex((l) => l.id === from);
  }

  /** You took a weapon on a dive: if it's one you have to find, it's now unlocked as a starting weapon. */
  onWeaponFound(id) {
    if (!WEAPONS[id]?.foundFrom) return;
    this.progress.unlockedWeapons ??= [];
    if (this.progress.unlockedWeapons.includes(id)) return;
    this.progress.unlockedWeapons.push(id);
    saveProgress(this.progress);
    this.announce(`${WEAPONS[id].name} found! You can now start dives with it.`, 3);
  }

  weaponEntries() {
    return Object.entries(WEAPONS).map(([id, def]) => ({ id, ...def, unlocked: this.isWeaponUnlocked(id) }));
  }

  startRun(levelId) {
    const level = LEVELS.find((l) => l.id === levelId);
    if (!level || !isPlayable(level)) return;
    this.level = level;
    this.theme = getTheme(level.theme);
    this.theme.reset();
    this.bossAt = bossTime(level);

    this.seed = seedFromUrl() ?? randomSeed();
    this.rng = createRng(this.seed);
    this.resetWorld();
    resetEnemyIds(); // so the same seed replays the same dive
    this.player = new Player(0, 0, this.heroId);
    this.player.addWeapon(this.weaponId);
    this.player.recalcStats(); // the starting weapon may carry a passive (e.g. the drone cap)
    this.spawner = new Spawner(this, level);
    this.audio.setIntensity('calm');
    this.camera.snapTo(0, 0);
    this.setState('playing');
  }

  toDepths() {
    this.player = null;
    this.resetWorld();
    this.setState('depths');
  }

  setState(state) {
    this.state = state;
    this.updateMusic(state);
    switch (state) {
      case 'title':
        this.menus.showTitle();
        break;
      case 'heroes':
        this.menus.showHeroes(
          HERO_ORDER.map((id) => ({ id, ...HEROES[id], affects: weaponsUsing(HEROES[id].trait.tags) })),
          this.heroId,
        );
        break;
      case 'weapons':
        this.menus.showWeapons(this.weaponEntries(), this.weaponId);
        break;
      case 'depths':
        this.menus.showDepths(this.depthEntries(), HEROES[this.heroId], WEAPONS[this.weaponId]);
        break;
      case 'playing':
        this.menus.hide();
        break;
      case 'paused':
        this.menus.showPause(this.runSummary());
        break;
      case 'gameover':
        this.menus.showGameOver(this.runSummary(), this.newBest);
        break;
      case 'cleared':
        this.menus.showCleared(this.runSummary(), this.nextDepthText());
        break;
    }
  }

  /** Which music plays in each state, and when it's muffled (pause, level-up). */
  updateMusic(state) {
    const a = this.audio;
    if (state === 'playing') {
      a.setMusic(this.level.theme);
      a.setDuck(false);
    } else if (state === 'paused' || state === 'levelup') {
      a.setDuck(true);
    } else {
      a.setMusic('menu');
      a.setDuck(false);
      a.setIntensity('calm');
    }
  }

  /** Pause-menu buttons: turn music or sound effects on/off. */
  toggleAudio(key) {
    this.audio.setSetting(key, !this.audio.settings[key]);
    this.menus.setAudioLabels(this.audio.settings);
  }

  // ---------------------------------------------------------------- progress

  recordFor(levelId) {
    this.progress.levels[levelId] ??= {};
    return this.progress.levels[levelId];
  }

  isUnlocked(index) {
    if (this.debug) return true; // debug mode (F3): every built depth is open for testing
    return index === 0 || Boolean(this.progress.levels[LEVELS[index - 1].id]?.cleared);
  }

  /** What the depth-select screen shows for each level. */
  depthEntries() {
    return LEVELS.map((level, i) => {
      const record = this.progress.levels[level.id] ?? {};
      let status = 'locked';
      if (this.isUnlocked(i)) status = !isPlayable(level) ? 'uncharted' : record.cleared ? 'cleared' : 'open';
      return {
        id: level.id,
        name: level.name,
        depth: level.depth,
        blurb: level.blurb,
        status,
        bestTime: record.bestTime,
        bestClear: record.bestClear,
      };
    });
  }

  /** The deepest level you can dive into right now (Enter on the depth screen). */
  defaultDive() {
    let pick = null;
    LEVELS.forEach((level, i) => {
      if (this.isUnlocked(i) && isPlayable(level)) pick = level.id;
    });
    return pick;
  }

  nextDepthText() {
    const below = LEVELS[LEVELS.indexOf(this.level) + 1];
    if (!below) return 'There is nothing deeper. Or is there?';
    if (isPlayable(below)) return `${below.name} is now unlocked.`;
    return `${below.name} lies below. It hasn't been charted yet.`;
  }

  // ------------------------------------------------------- per-frame input

  frame(dt) {
    const input = this.input;
    if (input.wasPressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.menus.setAudioLabels(this.audio.settings);
      if (this.state === 'playing') this.announce(muted ? 'Sound off' : 'Sound on', 1);
    }
    if (input.wasPressed('F3', 'Backquote')) {
      this.debug = !this.debug;
      // refresh which depths and weapons are open
      if (this.state === 'depths' || this.state === 'weapons') this.setState(this.state);
    }
    const numberPressed = () => NUMBER_KEYS.findIndex((keys) => input.wasPressed(...keys));

    switch (this.state) {
      case 'title':
        if (input.wasPressed('Enter', 'Space')) this.setState('heroes');
        break;
      case 'heroes': {
        const i = numberPressed();
        if (input.wasPressed('Escape')) this.setState('title');
        else if (i !== -1 && HERO_ORDER[i]) this.chooseHero(HERO_ORDER[i]);
        else if (input.wasPressed('Enter')) this.chooseHero(this.heroId);
        break;
      }
      case 'weapons': {
        const i = numberPressed();
        const ids = Object.keys(WEAPONS);
        if (input.wasPressed('Escape')) this.setState('heroes');
        else if (i !== -1 && ids[i]) this.chooseWeapon(ids[i]);
        else if (input.wasPressed('Enter')) this.chooseWeapon(this.weaponId);
        break;
      }
      case 'depths':
        if (input.wasPressed('Escape')) this.setState('weapons');
        else if (input.wasPressed('Enter')) {
          const id = this.defaultDive();
          if (id) this.startRun(id);
        }
        break;
      case 'playing':
        if (input.wasPressed('Escape', 'KeyP')) this.setState('paused');
        else if (this.debug) this.debugKeys();
        break;
      case 'paused':
        if (input.wasPressed('Escape', 'KeyP')) this.setState('playing');
        break;
      case 'levelup': {
        const i = numberPressed();
        if (i !== -1) this.pickUpgrade(i);
        else if (input.wasPressed('KeyR')) this.reroll();
        break;
      }
      case 'gameover':
        if (input.wasPressed('KeyR', 'Enter')) this.startRun(this.level.id);
        break;
      case 'cleared':
        if (input.wasPressed('Enter', 'Space')) this.toDepths();
        break;
    }
  }

  debugKeys() {
    const input = this.input;
    const p = this.player;
    if (p.dead || this.clearing > 0) return;
    if (input.wasPressed('KeyL')) p.gainXp((p.xpToNext - p.xp) / p.stats.growth + 0.01, this);
    if (input.wasPressed('KeyK')) for (const e of this.enemies) this.killEnemy(e);
    if (input.wasPressed('KeyT')) {
      this.time += 30;
      this.announce('+30 seconds', 1);
    }
    if (input.wasPressed('KeyG')) p.god = !p.god;
    if (input.wasPressed('KeyC')) this.queueLevelUp('trinket');
  }

  // ------------------------------------------------------------ simulation

  tick(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;

    // Index enemies by position once per tick; weapons, drones, projectiles and crowding all query it.
    this.grid.clear();
    for (const e of this.enemies) this.grid.insert(e);

    const p = this.player;
    if (p.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.setState('gameover');
        return;
      }
    } else {
      p.update(dt, this);
    }
    for (const a of this.allies) if (!a.dead) a.update(dt, this);
    this.updateLaserFence(dt);
    if (this.level.current) this.applyCurrent(dt);

    if (this.clearing > 0) {
      this.clearing -= dt;
      if (this.clearing <= 0) {
        this.setState('cleared');
        return;
      }
    } else {
      this.spawner.update(dt);
    }

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyShots(dt);
    for (const hz of this.hazards) if (!hz.dead) hz.update(dt, this);
    for (const pk of this.pickups) if (!pk.dead) pk.update(dt, this);
    this.effects.update(dt);

    removeDead(this.enemies);
    removeDead(this.allies);
    removeDead(this.projectiles);
    removeDead(this.enemyShots);
    removeDead(this.hazards);
    removeDead(this.pickups);

    if (this.announcement) {
      this.announcement.time -= dt;
      if (this.announcement.time <= 0) this.announcement = null;
    }
    if (this.levelQueue.length > 0 && !p.dead && this.clearing <= 0) this.openLevelUp();
  }

  updateEnemies(dt) {
    const p = this.player;
    const push = CONFIG.enemies.separation;
    const recycleDist = Math.hypot(this.camera.viewW, this.camera.viewH) * 0.75 + 150;

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(dt, this);

      // Push overlapping enemies apart so they form a crowd instead of one blob.
      for (const o of this.enemiesNear(e.x, e.y, e.radius)) {
        if (o === e || o.dead) continue;
        let dx = e.x - o.x;
        let dy = e.y - o.y;
        let d2 = dx * dx + dy * dy;
        const min = e.radius + o.radius;
        if (d2 >= min * min) continue;
        if (d2 < 0.0001) {
          dx = this.rng.range(-1, 1);
          dy = this.rng.range(-1, 1);
          d2 = dx * dx + dy * dy || 1;
        }
        const d = Math.sqrt(d2);
        const overlap = (min - d) * push;
        const share = o.mass / (e.mass + o.mass); // heavier enemies move less
        e.x += (dx / d) * overlap * share;
        e.y += (dy / d) * overlap * share;
        o.x -= (dx / d) * overlap * (1 - share);
        o.y -= (dy / d) * overlap * (1 - share);
      }

      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      const min = e.radius + p.radius;
      if (d2 < min * min) {
        // Touching: hurt the player and keep the enemy outside the player's body.
        // (Not while it's sealed in a Bubble Net bubble; bosses and elites are never sealed in.)
        const sealed = e.trapUntil > this.time && !e.boss && !e.elite;
        if (!sealed) p.takeDamage(e.damage, this);
        const d = Math.sqrt(d2) || 1;
        e.x = p.x + (dx / d) * min;
        e.y = p.y + (dy / d) * min;
      } else if (d2 > recycleDist * recycleDist) {
        // Left far behind: move it back in front of the player to keep the pressure on.
        // (Bosses too, so you can't simply outswim a boss fight.)
        const ahead = Math.atan2(p.facingY, p.facingX) + this.rng.range(-1.2, 1.2);
        const pos = this.spawner.edgePosition(ahead, e.radius);
        e.teleport(pos.x, pos.y);
      }
    }
  }

  updateProjectiles(dt) {
    const p = this.player;
    const f = p?.flags ?? {};
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.update(dt);
      if (pr.dead && !pr.reeledIn) this.onProjectileExpired(pr);
      if (!pr.dead && f.treasureHooks) this.magnetizePearls(pr.x, pr.y, 16 + pr.radius * 2);

      if (!pr.dead && pr.hits) {
        // Copy the candidates: a hit can spawn new projectiles and query the grid again.
        const candidates = [...this.enemiesNear(pr.x, pr.y, pr.radius)];
        for (const e of candidates) {
          if (e.dead || pr.hitList.has(e)) continue;
          const reach = e.radius + pr.radius;
          const dx = e.x - pr.x;
          const dy = e.y - pr.y;
          if (dx * dx + dy * dy > reach * reach) continue;

          pr.hitList.add(e);
          if (pr.onHit) {
            pr.onHit(pr, e, this); // the shot does its own thing (Bubble Net traps)
          } else {
            let damage = pr.damage;
            if (isHarpoon(pr)) {
              if (f.longThrow) damage *= 1 + 0.5 * Math.min(1, pr.age / pr.maxLife);
              if (f.skewer) damage *= Math.max(0.3, 1 - 0.1 * (pr.hitList.size - 1));
            }
            e.hit(damage, this, pr.knockback, pr.x - pr.vx, pr.y - pr.vy, pr.owner ?? pr);
            p?.trigger('hit', this, { enemy: e, projectile: pr });
          }
          pr.pierce--;
          if (pr.pierce < 0) {
            pr.dead = true;
            this.effects.burst(pr.x, pr.y, pr.color, 3, 80);
            this.onProjectileSpent(pr, e);
            break;
          }
        }
      }

      // Hit its last enemy or ran out of range: let it do its final thing (e.g. deploy a drone).
      if (pr.dead && pr.onEnd) {
        const end = pr.onEnd;
        pr.onEnd = null;
        end(pr);
      }
    }
  }

  /** A projectile ran out of range. Talents and trinkets can give it a second life. */
  onProjectileExpired(pr) {
    const p = this.player;
    if (!p) return;
    // Tidal Ring: harpoons that run out turn around and come back through you.
    if (p.flags.tidal && isHarpoon(pr) && !pr.returned && pr.generation === 0) {
      pr.turnBack(p.x, p.y);
      return;
    }
    // Split Coral: shots that fly out of range split into 3.
    if (pr.splitCoral && !pr.splitDone) {
      pr.splitDone = true;
      this.splitShot(pr, 3, pr.x, pr.y);
    }
    // Undertow Stone: pulled back to you, hitting again on the way.
    if (pr.undertow && !pr.returned) pr.reelBack(p, UNDERTOW_RETURN);
  }

  /**
   * Break a shot into `count` half-damage pieces at (x, y) (Split Coral). Each piece heads for
   * one of the nearest enemies around there; pieces with no enemy to aim at fan out ahead.
   */
  splitShot(pr, count, x, y, ignore = null) {
    const reach = SPLIT_SEEK;
    const targets = this.enemiesNear(x, y, reach)
      .filter((e) => !e.dead && e !== ignore && (e.x - x) ** 2 + (e.y - y) ** 2 < reach * reach)
      .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
      .slice(0, count);
    for (let i = 0; i < count; i++) {
      const k = count === 1 ? 0 : i / (count - 1) - 0.5; // -0.5 .. 0.5 across the fan
      const t = targets[i];
      this.spawnProjectile({
        x,
        y,
        angle: t ? Math.atan2(t.y - y, t.x - x) : pr.angle + k * 0.9,
        speed: pr.speed,
        damage: pr.damage * 0.5,
        radius: pr.radius * 0.8,
        life: pr.maxLife * 0.5,
        knockback: pr.knockback * 0.5,
        color: pr.color,
        shape: pr.shape,
        kind: pr.kind,
        owner: pr.owner,
        onHit: pr.onHit,
        generation: pr.generation + 1,
        ignore,
      });
    }
  }

  /** A projectile just stopped in `lastEnemy`. Talents can make something carry on from there. */
  onProjectileSpent(pr, lastEnemy) {
    const f = this.player?.flags ?? {};

    // Splitting Barbs: a harpoon that stops splits into two weaker ones that fly on.
    if (f.splittingBarbs && isHarpoon(pr) && pr.generation === 0) {
      for (const side of [-1, 1]) {
        this.spawnProjectile({
          x: pr.x,
          y: pr.y,
          angle: pr.angle + side * 0.45,
          speed: pr.speed,
          damage: pr.damage * 0.5,
          radius: pr.radius * 0.75,
          life: pr.maxLife * 0.5,
          knockback: pr.knockback * 0.5,
          color: pr.color,
          shape: 'harpoon',
          kind: pr.kind,
          generation: 1,
          ignore: lastEnemy,
        });
      }
    }

    // Ricochet Darts: the dart bounces once to another enemy nearby. (Drone lasers bounce with Refraction, in drone.js.)
    if (f.ricochetDarts && pr.kind === 'dart' && pr.generation === 0) {
      const reach = 140 * this.player.stats.area;
      let next = null;
      let best = reach * reach;
      for (const e of this.enemiesNear(lastEnemy.x, lastEnemy.y, reach)) {
        if (e.dead || e === lastEnemy) continue;
        const d2 = (e.x - lastEnemy.x) ** 2 + (e.y - lastEnemy.y) ** 2;
        if (d2 < best) {
          best = d2;
          next = e;
        }
      }
      if (next) {
        this.spawnProjectile({
          x: lastEnemy.x,
          y: lastEnemy.y,
          angle: Math.atan2(next.y - lastEnemy.y, next.x - lastEnemy.x),
          speed: pr.speed,
          damage: pr.damage * 0.7,
          radius: pr.radius,
          life: 0.5,
          knockback: pr.knockback,
          color: pr.color,
          shape: pr.shape,
          kind: pr.kind,
          owner: pr.owner,
          generation: 1,
          ignore: lastEnemy,
        });
      }
    }

    // Undertow Stone: reeled back to you, hitting again on the way (not the enemy it stopped in).
    if (pr.undertow && !pr.returned && this.player) pr.reelBack(this.player, UNDERTOW_RETURN, lastEnemy);
  }

  /** Make every pearl within `radius` of (x, y) fly to the player. */
  magnetizePearls(x, y, radius) {
    const r2 = radius * radius;
    for (const pk of this.pickups) {
      if (pk.kind !== 'xp' || pk.magnetized || pk.dead) continue;
      if ((pk.x - x) ** 2 + (pk.y - y) ** 2 < r2) {
        pk.magnetized = true;
        pk.speed = 200;
      }
    }
  }

  updateEnemyShots(dt) {
    const p = this.player;
    for (const s of this.enemyShots) {
      if (s.dead) continue;
      s.update(dt);
      if (s.dead || p.dead) continue;
      const reach = s.radius + p.radius;
      if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 < reach * reach) {
        p.takeDamage(s.damage, this);
        s.dead = true;
      }
    }
  }

  /** Open-water current: a slow push whose direction swings back and forth. */
  currentVector() {
    const c = this.level?.current;
    if (!c || !this.player) return { x: 0, y: 0 };
    const a = c.angle + Math.sin((this.time / c.period) * TAU) * 1.1;
    return { x: Math.cos(a) * c.speed, y: Math.sin(a) * c.speed };
  }

  /** The current carries you and loose pearls; creatures swim against it. */
  applyCurrent(dt) {
    const c = this.currentVector();
    const p = this.player;
    if (!p.dead) {
      p.x += c.x * dt;
      p.y += c.y * dt;
    }
    for (const pk of this.pickups) {
      if (pk.dead || pk.magnetized) continue;
      pk.x += c.x * dt;
      pk.y += c.y * dt;
    }
  }

  // ------------------------------------- world helpers (used by weapons etc.)

  /**
   * Enemies that might be within `radius` of (x, y); do an exact distance check on each.
   * Returns a shared array, so don't call it again while looping over the result.
   */
  enemiesNear(x, y, radius) {
    return this.grid.query(x, y, radius + MAX_ENEMY_RADIUS, this.scratch);
  }

  /** Closest enemy in range. Bosses and elites count as closer, so auto-aim focuses them. */
  nearestEnemy(x, y, maxRange = Infinity) {
    let best = null;
    let bestD2 = Infinity;
    const range2 = maxRange * maxRange;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      let d2 = dx * dx + dy * dy;
      if (d2 > range2) continue;
      if (e.boss || e.elite) d2 *= 0.25;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  /**
   * Extra damage for a hit, based on which weapon it came from: marks (Spotter
   * talents, Sonar Mark) boost your *other* weapons, and so does Cascade for a
   * moment after a kill.
   */
  damageBonus(enemy, source) {
    const kind = sourceKind(source);
    if (!kind || kind === 'poison') return 1;
    let mult = 1;
    if (enemy.markedUntil > this.time && kind !== enemy.markedBy) mult *= 1.2;
    const c = this.player?.counters;
    if (c && c.cascadeUntil > this.time && kind !== c.cascadeFrom) mult *= 1.3;
    const f = this.player?.flags ?? {};
    if (f.murkyWater && enemy.inkedUntil > this.time && kind !== 'inkcloud') mult *= 1.2; // Ink Sac talent
    if (f.evilEye && enemy.gazedUntil > this.time && kind !== 'eye') mult *= 1.25; // Watching Eye talent
    if (f.softTarget && enemy.trapUntil > this.time && kind !== 'bubble') mult *= 1.3; // Bubble Net talent
    return mult;
  }

  /**
   * A weapon hit that isn't a projectile (zaps, clouds, thrusts, bites, stings, gazes).
   * Hit hooks fire as usual, so marks, Conductor Coil and the rest work with it.
   */
  strike(e, damage, source, knockback = 0, fromX = e.x, fromY = e.y) {
    if (e.dead) return;
    e.hit(damage, this, knockback, fromX, fromY, source);
    this.player?.trigger('hit', this, { enemy: e, projectile: source });
  }

  /**
   * A weapon's blast: hits every enemy in a circle (with hit hooks, unlike `explode`).
   * `damage` can be a number or a function of the enemy. `pull` drags enemies in instead of
   * throwing them out. Returns the enemies it hit.
   */
  blast(x, y, radius, damage, source, { knockback = 160, pull = false, color = '#ffffff', effects = true } = {}) {
    if (effects) {
      this.effects.ring(x, y, radius, color);
      this.effects.burst(x, y, color, 8, 160);
    }
    const targets = this.enemiesNear(x, y, radius).filter(
      (e) => !e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 < (radius + e.radius) ** 2,
    );
    for (const e of targets) {
      const amount = typeof damage === 'function' ? damage(e) : damage;
      if (pull) {
        this.strike(e, amount, source);
        e.knock(knockback, 2 * e.x - x, 2 * e.y - y); // "away from" the far side = toward the middle
      } else {
        this.strike(e, amount, source, knockback, x, y);
      }
    }
    return targets;
  }

  /** Damage every enemy in a circle. */
  explode(x, y, radius, damage, color = '#ffb347', source = null) {
    this.effects.ring(x, y, radius, color);
    this.effects.burst(x, y, color, 8, 160);
    // Copy the list first: hitting can kill, and kills can trigger more explosions.
    const targets = this.enemiesNear(x, y, radius).filter(
      (e) => !e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 < (radius + e.radius) ** 2,
    );
    for (const e of targets) e.hit(damage, this, 120, x, y, source);
  }

  spawnEnemy(typeId, x, y, { hpMult = 1, elite = false, force = false } = {}) {
    if (!force && this.enemies.length >= CONFIG.enemies.max) return null;
    const type = ENEMY_TYPES[typeId];
    if (!type) throw new Error(`Unknown enemy type "${typeId}"`);
    const e = new Enemy(type, x, y, hpMult, elite);
    this.enemies.push(e);
    if (e.boss || e.elite) this.boss = e;
    return e;
  }

  spawnProjectile(options) {
    const pr = new Projectile(options);
    // Skewer: harpoons pass through everything (they lose damage per enemy instead).
    if (this.player?.flags.skewer && isHarpoon(pr)) pr.pierce = 999;
    this.projectiles.push(pr);
    this.player?.trigger('shot', this, pr); // trinkets mark or stretch shots
    return pr;
  }

  spawnEnemyShot(options) {
    const shot = new Projectile(options);
    this.enemyShots.push(shot);
    this.audio.play('enemyShot');
    return shot;
  }

  spawnHazard(options) {
    const hz = new Hazard(options);
    this.hazards.push(hz);
    return hz;
  }

  spawnPickup(kind, x, y, value = 0) {
    const pk = new Pickup(kind, x, y, value);
    this.pickups.push(pk);
    return pk;
  }

  /**
   * A weapon's regular attack: a volley, a launch or a pulse (not extra shots from talents).
   * Lets talents and trinkets react (Pilot Fish) and returns how to scale this attack:
   * { damage, size, color, charged } (Conductor Coil's overcharge), normally all 1.
   */
  weaponFired(w) {
    this.player.trigger('weaponFire', this, w);
    const trinket = w.trinket ? TRINKETS[w.trinket] : null;
    const power = trinket?.power?.(w, this) ?? NORMAL_ATTACK;
    if (FIRE_SOUNDS[w.id]) this.audio.play(FIRE_SOUNDS[w.id], { big: power.charged });
    if (power.charged) this.audio.play('overcharge');
    return power;
  }

  // ------------------------------------------------------------------ drones

  activeDrones() {
    return this.allies.filter((a) => a.kind === 'drone' && !a.dead);
  }

  /** How many drones are within `radius` of (x, y) (Hive). */
  dronesNear(x, y, radius) {
    const r2 = radius * radius;
    let n = 0;
    for (const a of this.allies) if (a.kind === 'drone' && !a.dead && (a.x - x) ** 2 + (a.y - y) ** 2 <= r2) n++;
    return n;
  }

  /**
   * A pod landed at (x, y): deploy a drone there. No limit on how many can be out.
   * `charged` (Conductor Coil) makes it an overcharged drone. With Mothership, the drone
   * joins the ship instead, and the ship flies over to (x, y).
   */
  launchDrone(x, y, weapon, charged = false) {
    const p = this.player;
    if (!p || p.dead) return;
    this.effects.burst(x, y, '#7ff9ff', 6, 110);
    this.audio.play('droneDeploy');
    if (p.flags.mothership) {
      let ship = this.allies.find((a) => a.kind === 'drone' && a.charges && !a.dead);
      if (!ship) {
        ship = new Drone(x, y, weapon, this);
        this.allies.push(ship);
      }
      ship.absorb(x, y, this, charged ? OVERCHARGED_DRONE.power : 1);
      this.syncDroneCount();
      p.trigger('droneLaunch', this, ship);
      return;
    }
    const d = new Drone(x, y, weapon, this, charged ? OVERCHARGED_DRONE : undefined);
    this.allies.push(d);
    this.syncDroneCount();
    p.trigger('droneLaunch', this, d);
  }

  /**
   * Bring the Drone Launcher's next launch `seconds` closer (Recycled Cores, Kamikaze), but
   * never sooner than half its normal cooldown after the last launch. Without that floor,
   * lots of drones would make launches come faster and faster without end.
   */
  hastenLaunch(seconds) {
    const w = this.player?.getWeapon('drones');
    if (!w) return;
    const cooldown = w.stats.cooldown * this.player.stats.cooldown;
    const floor = (w.state.lastLaunch ?? -Infinity) + cooldown * 0.5 - this.time;
    w.timer = Math.max(w.timer - seconds, Math.min(w.timer, floor));
  }

  /** Mothership: one drone's worth of charge inside the ship ran out. Counts as a drone running out. */
  chargeExpired(ship, power) {
    const might = this.player.stats.might;
    const stand = {
      kind: 'drone',
      x: ship.x,
      y: ship.y,
      expireReason: 'expired',
      damage: () => ship.weapon.stats.droneDamage * might * power,
    };
    this.player.trigger('droneExpire', this, stand);
  }

  /**
   * Laser Fence (talent): each drone links to its nearest drone with a laser, and enemies
   * crossing a link get hit every FENCE_PULSE seconds. `fenceLinks` is also what gets drawn.
   */
  updateLaserFence(dt) {
    const p = this.player;
    if (!p?.flags.laserFence || p.dead) {
      this.fenceLinks = null;
      return;
    }
    const drones = this.activeDrones();
    const reach = FENCE_REACH * p.stats.area;
    const links = [];
    for (const d of drones) {
      let best = null;
      let bestD2 = reach * reach;
      for (const o of drones) {
        if (o === d) continue;
        const d2 = (o.x - d.x) ** 2 + (o.y - d.y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = o;
        }
      }
      if (best && !links.some(([a, b]) => a === best && b === d)) links.push([d, best]);
    }
    this.fenceLinks = links;

    this.fenceTimer = (this.fenceTimer ?? 0) - dt;
    if (this.fenceTimer > 0) return;
    this.fenceTimer = FENCE_PULSE / p.stats.attackSpeed;
    const hit = new Set();
    for (const [a, b] of links) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      for (const e of [...this.enemiesNear(mx, my, half)]) {
        if (e.dead || hit.has(e) || distanceToSegment(e.x, e.y, a.x, a.y, b.x, b.y) > e.radius + 3) continue;
        hit.add(e);
        e.hit(a.damage(this) * FENCE_DAMAGE, this, 0, e.x, e.y, a);
        p.trigger('hit', this, { enemy: e, projectile: a });
      }
    }
  }

  /** Linked Fire: every drone fires a burst at once. */
  droneVolley(count) {
    for (const d of this.activeDrones()) d.volley(this, count);
  }

  /** reason: 'expired' (ran out of charge) or 'exploded' (Kamikaze). */
  expireDrone(d, reason = 'expired') {
    if (d.dead) return;
    d.dead = true;
    d.expireReason = reason;
    for (let i = 0; i < 4; i++) this.effects.bubble(d.x + (Math.random() - 0.5) * 10, d.y + (Math.random() - 0.5) * 10);
    this.syncDroneCount();
    this.player?.trigger('droneExpire', this, d);
  }

  syncDroneCount() {
    const p = this.player;
    if (!p) return;
    p.droneCount = this.activeDrones().length; // for the HUD
  }

  // ------------------------------------------------------------ kills & drops

  dropGem(x, y, value) {
    if (this.gemCount >= CONFIG.pickups.maxGems) {
      // Too many pearls lying around: fold this one's XP into an existing pearl.
      const host = this.pickups.find((pk) => pk.kind === 'xp' && !pk.dead && !pk.magnetized);
      if (host) {
        host.value += value;
        return;
      }
    }
    this.spawnPickup('xp', x, y, value);
    this.gemCount++;
  }

  killEnemy(e, source = null) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;

    const big = e.boss || e.elite;
    this.effects.burst(e.x, e.y, e.color, e.boss ? 40 : big ? 20 : 6, big ? 260 : 140);
    for (let i = 0; i < (big ? 12 : 2); i++) {
      this.effects.bubble(e.x + (Math.random() - 0.5) * e.radius, e.y + (Math.random() - 0.5) * e.radius);
    }
    this.dropGem(e.x, e.y, e.xp);
    this.audio.play(big ? 'bigKill' : 'kill');
    this.player?.trigger('kill', this, { enemy: e, source });

    if (e.final) {
      this.onDepthCleared();
      return;
    }
    if (big) {
      const chest = this.spawnPickup('chest', e.x + 26, e.y);
      chest.trinket = true; // elite chests also hold a trinket
      this.camera.shake(8, 0.35);
      if (this.boss === e) this.boss = null;
    } else if (this.rng.chance(CONFIG.pickups.healChance)) {
      this.spawnPickup('heal', e.x, e.y);
    } else if (this.rng.chance(CONFIG.pickups.magnetChance)) {
      this.spawnPickup('magnet', e.x, e.y);
    }
  }

  collectPickup(pk) {
    if (pk.dead) return;
    pk.dead = true;
    const p = this.player;

    switch (pk.kind) {
      case 'xp':
        this.gemCount--;
        this.audio.play('pearl');
        p.gainXp(pk.value, this);
        break;
      case 'heal':
        this.audio.play('heal');
        p.heal(CONFIG.pickups.healAmount);
        this.effects.text(p.x, p.y - p.radius - 8, `+${CONFIG.pickups.healAmount}`, '#6bd968', 18);
        break;
      case 'magnet':
        this.audio.play('magnet');
        for (const o of this.pickups) if (o.kind === 'xp') o.magnetized = true;
        break;
      case 'chest':
        this.audio.play('chest', { trinket: pk.trinket });
        if (pk.trinket) this.queueLevelUp('trinket');
        for (let i = 0; i < 1 + (p.flags.chestBonus ?? 0); i++) this.queueLevelUp('normal');
        this.announce(pk.trinket ? 'A trinket!' : 'Treasure!', 1.5);
        break;
    }
    p.trigger('pickup', this, pk);
  }

  announce(text, duration = 3) {
    this.announcement = { text, time: duration, duration };
  }

  // ---------------------------------------------------------------- level up

  queueLevelUp(kind) {
    this.levelQueue.push(kind);
  }

  openLevelUp() {
    // A trinket with nowhere to go (every weapon has one, or you've found them all) becomes an upgrade.
    if (this.levelQueue[0] === 'trinket' && !canTakeTrinket(this.player)) this.levelQueue[0] = 'normal';
    const kind = this.levelQueue[0];
    this.levelKind = kind;
    if (kind === 'talent') this.choices = rollTalents(this.player, this.rng);
    else if (kind === 'trinket') this.choices = rollTrinkets(this.player, this.rng);
    else this.choices = rollUpgrades(this.player, this.rng, undefined, (id) => this.canFindWeapon(id));
    this.levelUpOpenedAt = performance.now();
    this.state = 'levelup';
    this.updateMusic('levelup');
    this.audio.play({ talent: 'talent', trinket: 'trinket' }[kind] ?? 'levelUp');
    this.showLevelUpMenu();
  }

  showLevelUpMenu() {
    const kind = this.levelKind;
    const level = this.player.level;
    const screens = {
      normal: { eyebrow: `Level ${level}`, title: 'Choose an upgrade', hint: 'Click a card or press its number key' },
      talent: {
        eyebrow: `Level ${level} · talent`,
        title: 'Choose a talent',
        hint: 'Talents change how your skills work, so the stats you collect pay off in new ways. Click a card or press its number.',
      },
      trinket: {
        eyebrow: 'Elite chest · trinket',
        title: 'Choose a trinket',
        hint: 'Each weapon holds one trinket. You choose which weapon gets it next.',
      },
      socket: {
        eyebrow: `Trinket · ${TRINKETS[this.pendingTrinket]?.name ?? ''}`,
        title: 'Choose a weapon for it',
        hint: 'It stays on that weapon for the rest of the dive.',
      },
    };
    this.menus.showLevelUp(this.choices, {
      ...screens[kind],
      mode: kind,
      rerolls: kind === 'talent' ? this.rerolls : null,
    });
  }

  pickUpgrade(index) {
    if (this.state !== 'levelup' || !this.choices[index]) return;
    // Ignore picks in the first moment so a double-click can't choose by accident.
    if (performance.now() - this.levelUpOpenedAt < 250) return;

    const choice = this.choices[index];
    this.audio.play('select');
    if (choice.kind === 'trinket') {
      // Second step: which weapon gets it.
      this.pendingTrinket = choice.id;
      this.levelKind = 'socket';
      this.choices = socketOptions(this.player, choice.id);
      this.levelUpOpenedAt = performance.now();
      this.showLevelUpMenu();
      return;
    }
    applyUpgrade(choice, this);
    if (choice.kind === 'weapon' && choice.isNew) this.onWeaponFound(choice.id);
    this.pendingTrinket = null;
    this.levelQueue.shift();
    this.effects.burst(this.player.x, this.player.y, choice.color, 16, 180);
    if (this.levelQueue.length > 0) this.openLevelUp();
    else this.setState('playing');
  }

  /** Swap the current talent offers for new ones (limited per dive). */
  reroll() {
    if (this.state !== 'levelup' || this.levelKind !== 'talent' || this.rerolls <= 0) return;
    this.rerolls--;
    this.choices = rollTalents(this.player, this.rng);
    this.levelUpOpenedAt = performance.now();
    this.showLevelUpMenu();
  }

  // -------------------------------------------------------- ending a dive

  onPlayerDied() {
    const p = this.player;
    p.dead = true;
    p.px = p.x;
    p.py = p.y;
    this.deathTimer = DEATH_DELAY;
    this.audio.play('death');
    this.audio.setMusic(null); // silence, then the menu music on the game-over screen
    this.effects.burst(p.x, p.y, '#d4a94f', 30, 240);
    for (let i = 0; i < 16; i++) this.effects.bubble(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20);
    this.camera.shake(10, 0.5);

    const record = this.recordFor(this.level.id);
    this.newBest = !record.bestTime || this.time > record.bestTime;
    if (this.newBest) record.bestTime = this.time;
    saveProgress(this.progress);
  }

  /** The final boss is dead: the horde scatters, something far below stirs, the depth is cleared. */
  onDepthCleared() {
    this.clearing = CLEAR_DELAY;
    this.clearedAt = this.time;
    this.boss = null;
    for (const o of this.enemies) {
      if (o.dead) continue;
      o.dead = true;
      this.effects.burst(o.x, o.y, o.color, 4, 120);
    }
    for (const s of this.enemyShots) s.dead = true;
    for (const h of this.hazards) h.dead = true;
    for (const pk of this.pickups) if (pk.kind === 'xp') pk.magnetized = true;

    this.heartbeat = { t: 0 };
    this.audio.play('heartbeat');
    this.audio.setIntensity('calm');
    this.audio.setMusic(null); // the music drops out for the heartbeat from below
    this.camera.shake(6, 0.3);
    this.announce('Far below, something stirs...', CLEAR_DELAY);

    const record = this.recordFor(this.level.id);
    record.cleared = true;
    record.bestClear = Math.min(record.bestClear ?? Infinity, this.time);
    saveProgress(this.progress);
  }

  runSummary() {
    const p = this.player;
    const record = this.progress.levels[this.level.id] ?? {};
    return {
      heroName: p.hero.name,
      weaponName: WEAPONS[this.weaponId]?.name ?? '',
      levelName: this.level.name,
      depth: this.level.depth,
      time: this.clearedAt ?? this.time,
      level: p.level,
      kills: this.kills,
      seed: this.seed,
      bestTime: record.bestTime,
      bestClear: record.bestClear,
      weapons: p.weapons.map((w) => ({ name: w.def.name, level: w.level, color: w.def.color, sprite: { kind: 'weapon', id: w.id } })),
      passives: [...p.passives].map(([id, level]) => ({
        name: PASSIVES[id].name,
        level,
        color: PASSIVES[id].color,
        sprite: { kind: 'passive', id },
      })),
      trinkets: p.weapons
        .filter((w) => w.trinket)
        .map((w) => ({
          name: TRINKETS[w.trinket].name,
          color: TRINKETS[w.trinket].color,
          note: `on ${w.def.name}`,
          sprite: { kind: 'trinket', id: w.trinket },
        })),
      talents: [...p.talents].map(([id, rank]) => {
        const t = findTalent(id);
        return { name: t.name, level: rank, color: TIER_COLORS[t.tier], note: (t.ranks ?? 1) > 1 ? `Rank ${rank}` : 'Talent' };
      }),
    };
  }

  // ----------------------------------------------------------------- drawing

  render(dt, alpha) {
    const { ctx, width, height, dpr } = this.screen;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const cam = this.camera;
    cam.resize(width, height);
    this.theme.update(dt, this);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, width, height);

    if (!this.player) {
      // Menus: let the reef drift slowly behind them.
      this.idleTime += dt;
      cam.snapTo(this.idleTime * 22, this.idleTime * 9);
      cam.begin(ctx, width, height);
      this.theme.drawFloor(ctx, cam, this);
      cam.end(ctx);
      this.theme.drawOverlay(ctx, width, height, cam);
      if (this.debug) drawDebug(ctx, this, width, height);
      return;
    }

    // Blend between the last two ticks so motion is smooth at any refresh rate.
    // Frozen states use the latest positions so nothing jitters.
    const a = this.state === 'playing' ? alpha : 1;
    const p = this.player;
    interpolate(p, a);
    for (const e of this.enemies) interpolate(e, a);
    for (const al of this.allies) interpolate(al, a);
    for (const pr of this.projectiles) interpolate(pr, a);
    for (const s of this.enemyShots) interpolate(s, a);
    for (const pk of this.pickups) interpolate(pk, a);

    cam.follow(p.rx, p.ry, dt);
    cam.update(dt);
    cam.begin(ctx, width, height);

    this.theme.drawFloor(ctx, cam, this);
    for (const hz of this.hazards) hz.draw(ctx);
    if (!p.dead) {
      for (const w of p.weapons) {
        if (w.def.layer === 'under') w.draw(ctx, this);
        else w.drawUnder(ctx, this);
      }
    }
    for (const pk of this.pickups) if (!pk.dead && cam.isVisible(pk.rx, pk.ry, 24)) pk.draw(ctx, this);
    for (const e of this.enemies) if (!e.dead && cam.isVisible(e.rx, e.ry, e.radius * 2)) e.draw(ctx, this.time, this.theme.shadows !== false);
    if (this.fenceLinks) drawFence(ctx, this.fenceLinks, this.time);
    for (const al of this.allies) if (!al.dead) al.draw(ctx, this);
    for (const pr of this.projectiles) if (!pr.dead && cam.isVisible(pr.rx, pr.ry, 24)) pr.draw(ctx);
    for (const s of this.enemyShots) if (!s.dead && cam.isVisible(s.rx, s.ry, 16)) s.draw(ctx);
    p.draw(ctx, this);
    if (!p.dead) for (const w of p.weapons) if (w.def.layer !== 'under') w.draw(ctx, this);
    this.effects.draw(ctx);

    cam.end(ctx);

    this.theme.drawOverlay(ctx, width, height, cam);
    if (this.heartbeat) {
      const before = this.heartbeat.t;
      this.heartbeat.t += dt;
      if (before < 0.6 && this.heartbeat.t >= 0.6) cam.shake(5, 0.25);
      drawHeartbeat(ctx, width, height, this.heartbeat.t);
      if (this.heartbeat.t > 1.2) this.heartbeat = null;
    }
    drawHud(ctx, this, width, height);
    if (this.debug) drawDebug(ctx, this, width, height);
  }
}

/** Shortest distance from (px, py) to the segment (ax, ay)–(bx, by). */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Laser Fence links: dashed, flickering green-cyan lines between drones (lasers are solid). */
function drawFence(ctx, links, time) {
  ctx.lineCap = 'round';
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -time * 40; // the dashes crawl along the link
  for (const [a, b] of links) {
    const flicker = 0.55 + 0.25 * Math.sin(time * 23 + a.bob);
    ctx.beginPath();
    ctx.moveTo(a.rx, a.ry);
    ctx.lineTo(b.rx, b.ry);
    ctx.strokeStyle = `rgba(120, 255, 200, ${0.22 * flicker})`;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = `rgba(200, 255, 230, ${flicker})`;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.lineCap = 'butt';
}

function interpolate(entity, a) {
  entity.rx = entity.px + (entity.x - entity.px) * a;
  entity.ry = entity.py + (entity.y - entity.py) * a;
}

/** Removes `dead` items in place, keeping order. */
function removeDead(list) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
  list.length = w;
}

/** `?seed=1234` in the URL replays the same dive layout (spawns, drops, upgrade offers). */
function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) return null;
  return Number(raw) >>> 0;
}
