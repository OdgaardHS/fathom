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
    this.setupTalentTree();
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
      if (hero.locked) {
        // A secret diver: just a dark shape. No name, no hint.
        const card = el('button', 'hero-card locked-hero');
        card.type = 'button';
        card.disabled = true;
        const top = el('span', 'hero-top');
        const names = el('span', 'hero-names');
        names.append(el('span', 'hero-name', '???'), el('span', 'hero-role', 'Locked'));
        top.append(portrait(hero, { silhouette: true }), names);
        card.append(top);
        return card;
      }
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
      // Only what makes this diver different: no item icons, no talent counts.
      if (hero.statsText) card.append(el('span', 'hero-foot', hero.statsText));
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

  showDepths(entries, hero, weapon, unspent = 0) {
    const diver = this.screens.depths.querySelector('[data-diver]');
    diver.replaceChildren('Diving as ', el('b', null, hero.name), ' with ', el('b', null, weapon.name));
    setTalentsButton(this.screens.depths, unspent);

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
  showLevelUp(choices, { eyebrow = '', title = '', hint = '', mode = 'normal', rerolls = null, loadout = null, selected = null, feed = null } = {}) {
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
      // The Hollow Diver's cards are stronger: say by how much.
      if (choice.strength > 1.001) {
        const badge = el('span', `card-strength${choice.aftertaste ? ' aftertaste' : ''}`, `${Math.round((choice.strength - 1) * 100)}% stronger`);
        if (choice.aftertaste) badge.title = 'Aftertaste: the card you passed up last time, back and stronger';
        card.append(badge);
      }
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
    this.renderFeed(feed);
    this.show('levelup');
  }

  /**
   * The Hollow Diver's Hollow Out and Pour Out: a row of what it can eat, under the cards.
   * The first click asks ("Eat?"), the second eats it.
   */
  renderFeed(view) {
    const box = this.screens.levelup.querySelector('[data-feed]');
    box.hidden = !view;
    if (!view) {
      box.replaceChildren();
      return;
    }
    const row = el('div', 'feed-items');
    for (const item of view.items) {
      const asking = view.pick === item.value;
      const b = el('button', `feed-item${asking ? ' asking' : ''}`);
      b.type = 'button';
      b.dataset.action = 'feed';
      b.dataset.value = item.value;
      b.style.setProperty('--accent', item.color);
      b.append(itemIcon('feed-icon', item.sprite, item.icon), el('span', 'feed-name', asking ? `${item.verb} the ${item.name}?` : item.name));
      row.append(b);
    }
    const info = view.pick ? 'Click it again to go through with it. Esc or another item changes your mind.' : 'Eat a weapon or pour out a passive to free its slot. The cards change to match.';
    box.replaceChildren(el('p', 'loadout-title', 'Feed the suit'), el('p', 'loadout-info', info), row);
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
      const socket = el('span', `slot-socket${s?.twin ? ' twin' : ''}`);
      if (!s) {
        // An empty weapon slot: trinkets go on weapons, so nothing can be dropped here.
        slot.classList.add('empty');
        slot.setAttribute('aria-disabled', 'true');
        slot.append(weapon, socket, el('span', 'slot-name', 'Empty'));
        slots.append(slot);
        return;
      }
      slot.style.setProperty('--accent', s.color);
      if (s.suit) {
        slot.classList.add('suit');
        weapon.append(portrait(s.hero, { size: 40 }));
      } else weapon.append(itemIcon('slot-icon', s.sprite, s.icon), el('span', 'slot-level', String(s.level)));
      if (!s.open) {
        slot.classList.add('full'); // no room for another trinket
        slot.setAttribute('aria-disabled', 'true');
      }
      if (s.trinket) socket.style.setProperty('--held', s.trinket.color);
      for (const held of s.twin ? [s.trinket, s.trinket2] : [s.trinket]) {
        socket.append(held ? itemIcon('slot-icon', held.sprite, held.icon) : el('span', 'socket-gem'));
      }
      slot.append(weapon, socket, el('span', 'slot-name', s.name), el('span', 'slot-tag', 'No effect'));
      if (selected !== null && s.open) slot.append(el('kbd', 'slot-key', String(i + 1)));
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
      const open = Boolean(trinket && s && s.open);
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
    const where = s.suit ? 'The suit' : `Your ${s.name}`;
    if (!s.open) return [null, `${where} already holds ${s.trinket2 ? `the ${s.trinket.name} and the ${s.trinket2.name}` : `the ${s.trinket.name}`}.`];
    if (!trinket) return [null, s.suit ? 'The suit has a socket of its own: a trinket there works on every weapon you carry.' : `Your ${s.name} has a free trinket slot.`];
    const text = s.effects[trinket.id];
    if (text) return [`${trinket.name} ${s.suit ? 'in the suit' : `on your ${s.name}`}:`, text];
    if (s.suit) return ['No effect in the suit.', `None of your weapons can use the ${trinket.name}.`];
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
    renderProgress(screen.querySelector('[data-progress]'), summary.progress);
    setTalentsButton(screen, summary.unspent);
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
    renderProgress(screen.querySelector('[data-progress]'), summary.progress);
    setTalentsButton(screen, summary.unspent);
    this.show('cleared');
  }

  // ------------------------------------------------ talent trees (between dives)

  /** The talent screen: tabs for every diver and weapon, the open tree, and what a hovered talent does. */
  showTalents(view) {
    const screen = this.screens.talents;
    this.talentView = view;
    screen.querySelector('[data-talent-debug]').hidden = !view.debug;
    this.show('talents'); // first, so the tree can measure how much room it has
    renderTalentTabs(screen.querySelector('[data-talent-tabs]'), view.tabs);
    renderTalentHead(screen.querySelector('[data-talent-head]'), view.head);
    renderTree(screen.querySelector('[data-talent-tree]'), view);
    this.describeTalent(this.talentHover ?? null); // keep describing what the pointer is on after a click
  }

  /** The panel under the tree: the hovered talent (`target` = { key, option }), or a summary. */
  describeTalent(target) {
    const box = this.screens.talents.querySelector('[data-talent-info]');
    const view = this.talentView;
    const node = target && view.nodes.find((n) => n.key === target.key);
    if (!node) {
      const h = view.head;
      const text = h.free > 0
        ? `${h.free} point${h.free > 1 ? 's' : ''} to spend. Hover a talent to read it, click to learn it.`
        : h.level >= h.maxLevel
          ? 'Every point is spent at the top level. Swap choices or respec any time.'
          : 'No points to spend right now. Dive to level up; hover a talent to read it.';
      box.replaceChildren(el('p', 'talent-info-text', text));
      return;
    }
    const option = node.options.find((o) => o.id === target.option) ?? node.options.find((o) => o.taken) ?? node.options[0];
    const title = el('div', 'talent-info-title');
    title.style.setProperty('--accent', option.color);
    title.append(el('b', null, option.name));
    const own = option.taken ? (node.choice ? 1 : node.rank) : 0;
    title.append(el('span', 'talent-info-rank', node.choice ? (option.taken ? 'Chosen' : 'Choice') : `Rank ${own}/${option.ranks}`));
    const parts = [title, el('p', 'talent-info-text', option.text)];
    if (option.next) parts.push(el('p', 'talent-info-next', `Next rank: ${option.next}`));
    if (node.choice) parts.push(el('p', 'talent-info-note', `A choice: take ${node.options.map((o) => o.name).join(' or ')}. You can swap between them any time.`));
    if (option.tags.length) {
      const tags = el('p', 'card-tags');
      tags.append(el('em', null, 'Plays off'), ...option.tags.map((t) => el('span', null, t)));
      parts.push(tags);
    }
    let note = null;
    if (node.choice && node.rank > 0 && !option.taken) note = 'Click to swap to this one.';
    else if (node.status === 'open' || node.status === 'partial') note = 'Click to learn it.';
    else if (node.reason && node.status !== 'maxed') note = node.reason;
    if (node.rank > 0) note = [note, node.refundReason ?? 'Right-click to take a point back.'].filter(Boolean).join(' ');
    if (note) parts.push(el('p', 'talent-info-note', note));
    box.replaceChildren(...parts);
  }

  /** Clicks are handled like every other button (data-action); this adds hover info and right-click refunds. */
  setupTalentTree() {
    const tree = this.screens.talents?.querySelector('[data-talent-tree]');
    if (!tree) return;
    tree.addEventListener('pointerover', (e) => {
      const button = e.target.closest('[data-key]');
      this.talentHover = button ? { key: button.dataset.key, option: button.dataset.option } : null;
      this.describeTalent(this.talentHover);
    });
    tree.addEventListener('pointerleave', () => {
      this.talentHover = null;
      this.describeTalent(null);
    });
    tree.addEventListener('contextmenu', (e) => {
      const button = e.target.closest('[data-key]');
      if (!button) return;
      e.preventDefault();
      this.actions.talentRefund?.(button.dataset.key);
    });
  }
}

// ------------------------------------------------ talent tree drawing

const COL_W = 96; // a tree is 5 columns...
const ROW_H = 92; // ...and up to 6 rows
const NODE = 54;

function renderTalentTabs(nav, tabs) {
  const group = (title, list) => {
    const box = el('div', 'talent-tab-group');
    box.append(el('p', 'talent-tab-title', title));
    for (const t of list) {
      const b = el('button', `talent-tab${t.active ? ' active' : ''}${t.locked ? ' locked' : ''}`);
      b.type = 'button';
      b.dataset.action = 'talentTab';
      b.dataset.value = `${t.kind}:${t.id}`;
      b.title = `${t.name} · ${t.locked ? 'not found yet' : `level ${t.level}`}`;
      if (t.color) b.style.setProperty('--accent', t.color);
      const pic = t.hero ? portrait(t.hero) : itemIcon('tab-icon', { kind: 'weapon', id: t.id }, t.icon);
      pic.classList.add('tab-pic');
      const names = el('span', 'tab-names');
      names.append(el('span', 'tab-name', t.name), el('span', 'tab-level', t.locked ? 'Not found yet' : `Level ${t.level}`));
      b.append(pic, names);
      if (t.free > 0) b.append(el('span', 'tab-points', String(t.free)));
      box.append(b);
    }
    return box;
  };
  nav.replaceChildren(group('Divers', tabs.filter((t) => t.kind === 'character')), group('Weapons', tabs.filter((t) => t.kind === 'weapon')));
}

function renderTalentHead(box, h) {
  const left = el('div', 'talent-head-name');
  left.append(el('b', null, h.name), el('span', null, h.role));
  const right = el('div', 'talent-head-level');
  const maxed = h.level >= h.maxLevel;
  right.append(el('span', 'talent-level', `Level ${h.level} / ${h.maxLevel}`));
  const bar = el('span', 'xp-bar');
  const fill = el('span', 'xp-fill');
  fill.style.width = `${maxed ? 100 : Math.round((h.into / Math.max(1, h.need)) * 100)}%`;
  bar.append(fill);
  right.append(bar, el('span', 'talent-xp', maxed ? 'Top level' : `${Math.floor(h.into)} / ${h.need} XP to the next point`));
  const points = el('div', `talent-points${h.free > 0 ? ' has-free' : ''}`);
  points.append(el('b', null, String(h.free)), el('span', null, h.free === 1 ? 'point to spend' : 'points to spend'), el('small', null, `${h.spent} of ${h.maxPoints} spent`));
  box.replaceChildren(left, right, points);
}

/** Nodes on a grid, lines between connected nodes, and dashed gates across the gated rows. */
function renderTree(box, view) {
  const rows = Math.max(...view.nodes.map((n) => n.row)) + 1;
  const width = 5 * COL_W;
  const height = rows * ROW_H;
  const canvas = el('div', 'tree-canvas');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const center = (n) => ({ x: n.col * COL_W + COL_W / 2, y: n.row * ROW_H + ROW_H / 2 });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tree-lines');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  for (const gate of view.gates) {
    const y = gate.row * ROW_H - 2;
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', 6);
    line.setAttribute('x2', width - 6);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('class', `tree-gate${gate.met ? ' met' : ''}`);
    svg.append(line);
  }
  for (const n of view.nodes) {
    for (const key of n.from) {
      const parent = view.nodes.find((p) => p.key === key);
      if (!parent) continue;
      const a = center(parent);
      const b = center(n);
      const line = document.createElementNS(svg.namespaceURI, 'line');
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y + NODE / 2);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y - NODE / 2);
      const state = parent.rank > 0 && n.rank > 0 ? 'taken' : parent.rank > 0 ? 'open' : '';
      line.setAttribute('class', `tree-edge ${state}`);
      svg.append(line);
    }
  }
  canvas.append(svg);

  for (const gate of view.gates) {
    const tag = el('span', `tree-gate-label${gate.met ? ' met' : ''}`, `${gate.points} points above`);
    tag.style.top = `${gate.row * ROW_H - 9}px`;
    canvas.append(tag);
  }

  for (const n of view.nodes) {
    const c = center(n);
    if (n.choice) {
      // A choice node: the options side by side; the taken one lights up.
      const wrap = el('div', `talent-choice status-${n.status}`);
      wrap.style.left = `${c.x}px`;
      wrap.style.top = `${c.y}px`;
      for (const o of n.options) {
        const b = talentButton(n, o, o.taken ? 'taken' : n.rank > 0 ? 'other' : '');
        wrap.append(b);
      }
      canvas.append(wrap);
    } else {
      const o = n.options[0];
      const b = talentButton(n, o, '');
      b.classList.add('talent-single', `status-${n.status}`);
      b.style.left = `${c.x}px`;
      b.style.top = `${c.y}px`;
      if (o.ranks > 1 || n.rank > 0) b.append(el('span', 'talent-rank', `${n.rank}/${o.ranks}`));
      canvas.append(b);
    }
  }
  // On narrow screens, shrink the whole tree to fit instead of cutting it off.
  const room = box.clientWidth - 12;
  if (room > 0 && room < width) {
    const scale = room / width;
    const holder = el('div', 'tree-fit');
    holder.style.width = `${width * scale}px`;
    holder.style.height = `${height * scale}px`;
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = 'top left';
    holder.append(canvas);
    box.replaceChildren(holder);
  } else {
    box.replaceChildren(canvas);
  }
}

function talentButton(node, option, extra) {
  const b = el('button', `talent-node tier-${option.tier} ${extra}`.trim());
  b.type = 'button';
  b.dataset.action = 'talentBuy';
  b.dataset.value = `${node.key}#${node.choice ? option.id : ''}`;
  b.dataset.key = node.key;
  b.dataset.option = option.id;
  b.style.setProperty('--accent', option.color);
  b.setAttribute('aria-label', `${option.name}: ${option.text}`);
  b.append(el('span', 'talent-code', option.icon));
  return b;
}

/** "Talents" button: shows how many points are waiting. */
function setTalentsButton(screen, unspent) {
  const b = screen.querySelector('[data-talents-button]');
  if (!b) return;
  b.textContent = unspent > 0 ? `Talents (${unspent} to spend)` : 'Talents';
  b.classList.toggle('primary-soft', unspent > 0);
}

/** After a dive: how much XP the diver and each weapon got, and any levels (talent points) gained. */
function renderProgress(container, progress = []) {
  if (!container) return;
  container.replaceChildren(
    ...progress.map((r) => {
      const line = el('div', `progress-line${r.to > r.from ? ' levelled' : ''}`);
      const gained = r.to - r.from;
      line.append(el('b', null, r.name), el('span', null, `+${r.xp} XP`));
      if (gained > 0) line.append(el('span', 'progress-up', `Level ${r.to}: +${gained} talent point${gained > 1 ? 's' : ''}`));
      else if (r.to >= r.maxLevel) line.append(el('span', null, `Top level (${r.to})`));
      else line.append(el('span', null, `Level ${r.to}`));
      return line;
    }),
  );
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

/** A small canvas with the hero's diver drawn on it (as a dark silhouette, for a locked diver). */
function portrait(hero, { size = 64, silhouette = false } = {}) {
  const scale = 2; // drawn at double resolution so it stays crisp
  const canvas = el('canvas', size === 64 ? 'hero-portrait' : 'mini-portrait');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawDiver(ctx, { rx: size / 2 + 1, ry: size / 2 + 1, radius: size * 0.2734, facingX: 0.8, facingY: -0.6, moving: false, hurtFlash: 0, hero }, 0);
  if (silhouette) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
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
