import { CONFIG } from '../config.js';
import { TAG_LABELS } from '../data/talents.js';
import { itemIconURL } from '../render/icons.js';
import { drawDiver } from '../render/sprites.js';
import { formatTime } from './format.js';

// Depth rows darken from shallow teal to near-black as you go down the list.
const SHALLOW = [27, 101, 112];
const DEEP = [3, 9, 13];

/**
 * HTML overlay screens (title, characters, weapons, depths, level-up, pause, game over, cleared)
 * defined in index.html. The in-run HUD is drawn on the canvas instead (see hud.js).
 */
export class Menus {
  /** `actions` maps each button's data-action to a callback, which receives its data-value. */
  constructor(root, actions) {
    this.root = root;
    this.screens = {};
    for (const node of root.querySelectorAll('[data-screen]')) this.screens[node.dataset.screen] = node;
    for (const node of root.querySelectorAll('[data-game-title]')) node.textContent = CONFIG.title;

    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      actions[button.dataset.action]?.(button.dataset.value);
    });
  }

  /** Labels on the Music / Sounds buttons (pause screen). */
  setAudioLabels(settings) {
    for (const b of this.root.querySelectorAll('[data-action="toggleMusic"]')) b.textContent = `Music: ${settings.music ? 'on' : 'off'}`;
    for (const b of this.root.querySelectorAll('[data-action="toggleSfx"]')) b.textContent = `Sounds: ${settings.sfx ? 'on' : 'off'}`;
    for (const n of this.root.querySelectorAll('[data-muted-note]')) n.hidden = !settings.muted;
  }

  /** Show one screen by name (or none). */
  show(name) {
    for (const [key, node] of Object.entries(this.screens)) node.hidden = key !== name;
  }

  hide() {
    this.show(null);
  }

  showTitle() {
    this.show('title');
  }

  showHeroes(heroes, selectedId) {
    const cards = heroes.map((hero, i) => {
      const card = el('button', `hero-card${hero.id === selectedId ? ' selected' : ''}`);
      card.type = 'button';
      card.dataset.action = 'hero';
      card.dataset.value = hero.id;
      card.style.setProperty('--accent', hero.accent);

      const top = el('span', 'hero-top');
      const names = el('span', 'hero-names');
      names.append(el('span', 'hero-name', hero.name), el('span', 'hero-role', hero.role));
      top.append(portrait(hero), names, el('kbd', 'hero-key', String(i + 1)));

      card.append(
        top,
        el('span', 'hero-blurb', hero.blurb),
        detail(`Passive · ${hero.trait.name}`, hero.trait.text),
      );
      if (hero.affects?.length) card.append(affectsRow(hero.affects));
      card.append(el('span', 'hero-foot', `${hero.statsText} · ${hero.talents.length} talents`));
      return card;
    });
    this.screens.heroes.querySelector('[data-heroes]').replaceChildren(...cards);
    this.show('heroes');
  }

  showWeapons(weapons, selectedId) {
    const cards = weapons.map((w, i) => {
      const card = el('button', `hero-card weapon-card${w.id === selectedId ? ' selected' : ''}`);
      card.type = 'button';
      card.dataset.action = 'weapon';
      card.dataset.value = w.id;
      card.disabled = !w.unlocked;
      card.style.setProperty('--accent', w.color);

      const top = el('span', 'hero-top');
      const names = el('span', 'hero-names');
      const role = w.unlocked ? (w.foundFrom ? 'Weapon · found deep' : 'Weapon') : 'Locked';
      names.append(el('span', 'hero-name', w.name), el('span', 'hero-role', role));
      top.append(itemIcon('card-icon weapon-icon', { kind: 'weapon', id: w.id }, w.icon), names);
      if (i < 9) top.append(el('kbd', 'hero-key', String(i + 1))); // number keys go up to 9

      card.append(top, el('span', 'hero-blurb', w.unlocked ? w.description : (w.foundText ?? 'Find it on a dive to unlock it.')));
      if (w.unlocked && w.passiveText) card.append(detail('Built in', w.passiveText));
      if (w.unlocked) card.append(el('span', 'hero-foot', `${w.talents.length} talents · leans on ${w.tags.map((t) => TAG_LABELS[t]).join(', ')}`));
      return card;
    });
    this.screens.weapons.querySelector('[data-weapons]').replaceChildren(...cards);
    this.show('weapons');
  }

  showDepths(entries, hero, weapon) {
    const diver = this.screens.depths.querySelector('[data-diver]');
    diver.replaceChildren('Diving as ', el('b', null, hero.name), ' with ', el('b', null, weapon.name));

    const rows = entries.map((d, i) => {
      const row = el('li', `depth depth-${d.status}`);
      row.style.background = depthColor(i / (entries.length - 1));

      const info = el('div', 'depth-info');
      info.append(el('span', 'depth-meters', d.depth), el('span', 'depth-name', d.name), el('span', 'depth-blurb', d.blurb));
      row.append(info);

      const side = el('div', 'depth-side');
      if (d.status === 'open' || d.status === 'cleared') {
        if (d.status === 'cleared') side.append(el('span', 'depth-badge', `Cleared · ${formatTime(d.bestClear)}`));
        else if (d.bestTime) side.append(el('span', 'depth-note', `Best: ${formatTime(d.bestTime)}`));
        const dive = el('button', 'btn primary', 'Dive');
        dive.type = 'button';
        dive.dataset.action = 'dive';
        dive.dataset.value = d.id;
        side.append(dive);
      } else {
        side.append(el('span', 'depth-note', d.status === 'uncharted' ? 'Not charted yet' : 'Locked'));
      }
      row.append(side);
      return row;
    });
    this.screens.depths.querySelector('[data-depths]').replaceChildren(...rows);
    this.show('depths');
  }

  /**
   * Normal level-ups, talent picks and trinkets (pick one, then the weapon it goes on) share
   * this screen. `mode` is 'normal' | 'talent' | 'trinket' | 'socket'; `rerolls` null hides the button.
   */
  showLevelUp(choices, { eyebrow = '', title = '', hint = '', mode = 'normal', rerolls = null } = {}) {
    const screen = this.screens.levelup;
    screen.classList.toggle('is-talent', mode === 'talent');
    screen.classList.toggle('is-trinket', mode === 'trinket' || mode === 'socket');
    screen.querySelector('[data-levelup-eyebrow]').textContent = eyebrow;
    screen.querySelector('[data-levelup-title]').textContent = title;
    screen.querySelector('[data-levelup-hint]').textContent = hint;

    const reroll = screen.querySelector('[data-action="reroll"]');
    reroll.hidden = rerolls === null;
    reroll.disabled = !(rerolls > 0);
    reroll.textContent = rerolls > 0 ? `Reroll (${rerolls} left) · R` : 'No rerolls left';

    const special = { talent: ' card-talent', trinket: ' card-trinket' };
    const cards = choices.map((choice, i) => {
      const card = el('button', `card${special[choice.kind] ?? ''}`);
      card.type = 'button';
      card.dataset.action = 'pick';
      card.dataset.value = String(i);
      card.style.setProperty('--accent', choice.color);
      card.append(
        el('kbd', 'card-key', String(i + 1)),
        itemIcon('card-icon', choice.sprite, choice.icon),
        el('span', 'card-tag', choice.tag),
        el('span', 'card-name', choice.name),
      );
      if (choice.text) card.append(el('span', 'card-text', choice.text));
      for (const [label, text] of choice.details ?? []) {
        const line = el('span', 'card-detail');
        line.append(el('b', null, label), el('span', null, text));
        card.append(line);
      }
      if (choice.note) card.append(el('span', 'card-note', choice.note));
      if (choice.affects?.length) card.append(affectsRow(choice.affects));
      if (choice.tags?.length) {
        const tags = el('span', 'card-tags');
        tags.append(el('em', null, 'Plays off'), ...choice.tags.map((t) => el('span', null, t)));
        card.append(tags);
      }
      return card;
    });
    screen.querySelector('[data-cards]').replaceChildren(...cards);
    this.show('levelup');
  }

  showPause(summary) {
    const screen = this.screens.paused;
    screen.querySelector('[data-depth]').textContent = `${summary.heroName} + ${summary.weaponName} · ${summary.levelName} · ${summary.depth}`;
    renderBuild(screen.querySelector('[data-build]'), summary);
    this.show('paused');
  }

  showGameOver(summary, isNewBest) {
    const screen = this.screens.gameover;
    screen.querySelector('[data-depth]').textContent = `${summary.heroName} + ${summary.weaponName} · ${summary.levelName} · ${summary.depth}`;
    screen.querySelector('[data-new-best]').hidden = !isNewBest;
    screen.querySelector('[data-seed]').textContent = String(summary.seed);
    renderStats(screen.querySelector('[data-stats]'), [
      ['Survived', formatTime(summary.time)],
      ['Level', summary.level],
      ['Kills', summary.kills],
      ['Best', summary.bestTime ? formatTime(summary.bestTime) : '—'],
    ]);
    renderBuild(screen.querySelector('[data-build]'), summary);
    this.show('gameover');
  }

  showCleared(summary, nextText) {
    const screen = this.screens.cleared;
    screen.querySelector('[data-depth]').textContent = summary.depth;
    screen.querySelector('[data-level-name]').textContent = `${summary.levelName} · ${summary.heroName} + ${summary.weaponName}`;
    screen.querySelector('[data-next]').textContent = nextText;
    renderStats(screen.querySelector('[data-stats]'), [
      ['Time', formatTime(summary.time)],
      ['Level', summary.level],
      ['Kills', summary.kills],
      ['Fastest', summary.bestClear ? formatTime(summary.bestClear) : '—'],
    ]);
    renderBuild(screen.querySelector('[data-build]'), summary);
    this.show('cleared');
  }
}

function renderStats(container, stats) {
  container.replaceChildren(
    ...stats.map(([name, value]) => {
      const stat = el('div', 'stat');
      stat.append(el('span', 'stat-value', String(value)), el('span', 'stat-label', name));
      return stat;
    }),
  );
}

/** The player's weapons, passives and talents as small colored chips. */
function renderBuild(container, summary) {
  const items = [...summary.weapons, ...(summary.trinkets ?? []), ...summary.passives, ...(summary.talents ?? [])];
  container.replaceChildren(
    ...items.map((item) => {
      const chip = el('span', 'chip');
      chip.style.setProperty('--accent', item.color);
      const url = item.sprite && itemIconURL(item.sprite.kind, item.sprite.id);
      if (url) chip.append(image('chip-icon', url));
      chip.append(el('b', null, item.name), el('span', null, item.note ?? `Lv ${item.level}`));
      return chip;
    }),
  );
}

/** A small canvas with the hero's diver drawn on it. */
function portrait(hero) {
  const size = 64;
  const scale = 2; // drawn at double resolution so it stays crisp
  const canvas = el('canvas', 'hero-portrait');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawDiver(ctx, { rx: size / 2 + 1, ry: size / 2 + 1, radius: 17.5, facingX: 0.8, facingY: -0.6, moving: false, hurtFlash: 0, hero }, 0);
  return canvas;
}

/** The weapons a stat bonus affects, as small icons. Hovering one says what it does for that weapon. */
function affectsRow(weapons) {
  const row = el('span', 'card-affects');
  row.append(el('em', null, 'Affects'));
  for (const w of weapons) {
    const chip = itemIcon('affect-chip', { kind: 'weapon', id: w.id }, w.icon);
    chip.style.setProperty('--accent', w.color);
    chip.title = `${w.name}: ${w.how}`;
    row.append(chip);
  }
  return row;
}

/** An item's picture in a span with `className`, or its two-letter code if it has no picture. */
function itemIcon(className, sprite, text) {
  const url = sprite && itemIconURL(sprite.kind, sprite.id);
  if (!url) return el('span', className, text);
  const node = el('span', `${className} has-sprite`);
  node.append(image(null, url));
  return node;
}

function image(className, src) {
  const img = el('img', className);
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

function detail(title, text) {
  const node = el('span', 'hero-detail');
  node.append(el('b', null, title), el('span', null, text));
  return node;
}

function depthColor(t) {
  const c = SHALLOW.map((v, i) => Math.round(v + (DEEP[i] - v) * t));
  return `rgb(${c.join(', ')})`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
