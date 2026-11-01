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
    this.actions = actions;
    this.screens = {};
    for (const node of root.querySelectorAll('[data-screen]')) this.screens[node.dataset.screen] = node;
    for (const node of root.querySelectorAll('[data-game-title]')) node.textContent = CONFIG.title;
    this.trinketView = null; // { choices, loadout, selected } while the trinket screen is up
    this.drag = null; // a trinket card being dragged toward a weapon
    this.suppressClick = false;

    root.addEventListener('click', (event) => {
      if (this.suppressClick) return; // the click that ends a drag isn't a pick
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      actions[button.dataset.action]?.(button.dataset.value);
    });
    this.setupTrinketDrag();
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
   * Normal level-ups, talent picks and trinkets share this screen. `mode` is 'normal' | 'talent' |
   * 'trinket'; `rerolls` null hides the button. On the trinket screen, `loadout` is your weapon
   * slots (see trinketLoadout in systems/upgrades.js): drag a trinket card onto one, or pick a
   * trinket (`selected`, by click or number key) and then click a weapon or press its number.
   */
  showLevelUp(choices, { eyebrow = '', title = '', hint = '', mode = 'normal', rerolls = null, loadout = null, selected = null } = {}) {
    const screen = this.screens.levelup;
    const trinkets = mode === 'trinket' && loadout;
    screen.classList.toggle('is-talent', mode === 'talent');
    screen.classList.toggle('is-trinket', mode === 'trinket');
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
      // Once a trinket is picked, the number keys choose a weapon instead, so the cards hide theirs.
      if (!(trinkets && selected !== null)) card.append(el('kbd', 'card-key', String(i + 1)));
      if (trinkets) {
        card.classList.toggle('selected', selected === i);
        card.classList.toggle('dimmed', selected !== null && selected !== i);
      }
      card.append(
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
    this.renderLoadout(trinkets ? { choices, loadout, selected } : null);
    this.show('levelup');
  }

  // ------------------------------------------------ trinket screen: your weapons

  /** The row of weapon slots under the trinket cards (or nothing, on other level-up screens). */
  renderLoadout(view) {
    const box = this.screens.levelup.querySelector('[data-loadout]');
    this.trinketView = view;
    box.hidden = !view;
    if (!view) {
      box.replaceChildren();
      return;
    }
    const { loadout, selected } = view;
    const slots = el('div', 'slots');
    loadout.forEach((s, i) => {
      const slot = el('button', 'slot');
      slot.type = 'button';
      slot.dataset.action = 'slot';
      slot.dataset.value = String(i);
      const weapon = el('span', 'slot-weapon');
      const socket = el('span', 'slot-socket');
      if (!s) {
        // An empty weapon slot: trinkets go on weapons, so nothing can be dropped here.
        slot.classList.add('empty');
        slot.setAttribute('aria-disabled', 'true');
        slot.append(weapon, socket, el('span', 'slot-name', 'Empty'));
        slots.append(slot);
        return;
      }
      slot.style.setProperty('--accent', s.color);
      weapon.append(itemIcon('slot-icon', s.sprite, s.icon), el('span', 'slot-level', String(s.level)));
      if (s.trinket) {
        slot.classList.add('full'); // one trinket per weapon
        slot.setAttribute('aria-disabled', 'true');
        socket.style.setProperty('--held', s.trinket.color);
        socket.append(itemIcon('slot-icon', s.trinket.sprite, s.trinket.icon));
      } else {
        socket.append(el('span', 'socket-gem'));
      }
      slot.append(weapon, socket, el('span', 'slot-name', s.name), el('span', 'slot-tag', 'No effect'));
      if (selected !== null && !s.trinket) slot.append(el('kbd', 'slot-key', String(i + 1)));
      slots.append(slot);
    });
    this.loadoutInfo = el('p', 'loadout-info');
    // The explanation sits above the slots, so it stays in view while you drag on a small screen.
    box.replaceChildren(el('p', 'loadout-title', 'Your weapons'), this.loadoutInfo, slots);
    this.markSlots(selected);
    this.hoverSlot(null);
  }

  /** The trinket being placed: the one being dragged, else the one picked by click or key. */
  currentTrinket() {
    if (this.drag?.active) return this.drag.index;
    return this.trinketView?.selected ?? null;
  }

  /** Light up the weapons trinket `index` can go on: glowing where it works, dimmed where it does nothing. */
  markSlots(index) {
    const view = this.trinketView;
    if (!view) return;
    const trinket = index === null ? null : view.choices[index];
    const box = this.screens.levelup.querySelector('[data-loadout]');
    if (trinket) box.style.setProperty('--gem', trinket.color);
    for (const slot of box.querySelectorAll('.slot')) {
      const s = view.loadout[Number(slot.dataset.value)];
      const open = Boolean(trinket && s && !s.trinket);
      slot.classList.toggle('target', open);
      slot.classList.toggle('works', open && Boolean(s.effects[trinket.id]));
      slot.classList.toggle('no-effect', open && !s.effects[trinket.id]);
    }
  }

  /** Highlight the slot under the pointer (or none) and say what the trinket would do there. */
  hoverSlot(slot) {
    if (!this.trinketView) return;
    for (const s of this.screens.levelup.querySelectorAll('.slot.hover')) if (s !== slot) s.classList.remove('hover');
    if (slot) slot.classList.add('hover');
    const [head, body] = this.describeSlot(slot ? Number(slot.dataset.value) : null, this.currentTrinket());
    this.loadoutInfo.replaceChildren(...(head ? [el('b', null, head), ' '] : []), body);
  }

  /** [bold lead-in, text] for the line under the weapon slots. */
  describeSlot(slotIndex, trinketIndex) {
    const view = this.trinketView;
    const trinket = trinketIndex === null ? null : view.choices[trinketIndex];
    if (slotIndex === null) {
      if (!trinket) return [null, 'Drag a trinket onto a weapon. Or press a trinket’s number, then the weapon’s.'];
      return [`${trinket.name}:`, 'drop it on a weapon, click one, or press its number. Esc picks another trinket.'];
    }
    const s = view.loadout[slotIndex];
    if (!s) return [null, 'An empty weapon slot. Trinkets go on weapons.'];
    if (s.trinket) return [null, `Your ${s.name} already holds the ${s.trinket.name}.`];
    if (!trinket) return [null, `Your ${s.name} has a free trinket slot.`];
    const text = s.effects[trinket.id];
    if (text) return [`${trinket.name} on your ${s.name}:`, text];
    return [`No effect on your ${s.name}.`, `The ${trinket.name}’s effect on your other weapons still works.`];
  }

  /**
   * Dragging a trinket card onto a weapon slot. Uses pointer events, so it works with a mouse,
   * a pen or a finger. A press that doesn't move is an ordinary click (it picks the trinket).
   */
  setupTrinketDrag() {
    const screen = this.screens.levelup;
    if (!screen) return;
    screen.addEventListener('pointerdown', (e) => {
      if (!this.trinketView || e.button !== 0) return;
      const card = e.target.closest('.card-trinket');
      if (!card) return;
      this.drag = { index: Number(card.dataset.value), card, x: e.clientX, y: e.clientY, pointerId: e.pointerId, active: false, ghost: null };
    });
    // Hovering a weapon (without dragging) still says what the picked trinket would do there.
    screen.addEventListener('pointerover', (e) => {
      if (this.trinketView && !this.drag?.active) this.hoverSlot(e.target.closest('.slot'));
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return; // not a drag yet
        this.startDrag(d);
      }
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      this.hoverSlot(slotAt(e.clientX, e.clientY));
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      this.drag = null;
      if (!d.active) return; // just a click: the click handler picks the trinket
      const slot = slotAt(e.clientX, e.clientY);
      this.endDrag(d);
      // The browser sends a click right after this; it isn't a pick.
      this.suppressClick = true;
      setTimeout(() => {
        this.suppressClick = false;
      }, 0);
      if (slot && slot.getAttribute('aria-disabled') !== 'true') this.actions.attach?.(`${d.index},${slot.dataset.value}`);
    });
    window.addEventListener('pointercancel', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      this.drag = null;
      if (d.active) this.endDrag(d);
    });
  }

  startDrag(d) {
    d.active = true;
    d.card.classList.add('is-dragged');
    this.screens.levelup.classList.add('dragging');
    const choice = this.trinketView.choices[d.index];
    const ghost = el('div', 'trinket-ghost');
    ghost.style.setProperty('--accent', choice.color);
    ghost.append(itemIcon('ghost-icon', choice.sprite, choice.icon));
    document.body.append(ghost);
    d.ghost = ghost;
    this.markSlots(d.index);
  }

  endDrag(d) {
    d.ghost?.remove();
    d.card.classList.remove('is-dragged');
    this.screens.levelup.classList.remove('dragging');
    this.markSlots(this.trinketView?.selected ?? null);
    this.hoverSlot(null);
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

/** The weapon slot under a screen point (the drag ghost ignores the pointer, so it's never in the way). */
function slotAt(x, y) {
  return document.elementFromPoint(x, y)?.closest('.slot') ?? null;
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
