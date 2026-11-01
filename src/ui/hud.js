import { CONFIG } from '../config.js';
import { TAU } from '../core/math.js';
import { PASSIVES } from '../data/passives.js';
import { TRINKETS, mountsOf } from '../data/trinkets.js';
import { drawItemIcon } from '../render/icons.js';
import { formatTime } from './format.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Action bar (bottom centre, like a spell bar): weapon slots in a row with each weapon's trinket
// socket under it, and the passives in a small block to the right.
const WEAPON_SLOT = 50;
const TRINKET_SLOT = 34;
const PASSIVE_SLOT = 30;
const SLOT_GAP = 6;
const PLATE_PAD = 7; // the dark backing plate reaches this far past the slots
const BOTTOM_GAP = 10; // space between the bar and the bottom edge of the screen
const SIDE_GAP = 10; // space between the weapon bar and the passives block

// Slot colors, in the style of an inventory hotbar: a rounded square, a dark rim, a lighter top.
const SLOT_STYLES = {
  weapon: { fill: 'rgba(56, 78, 160, 0.8)', empty: 'rgba(56, 78, 160, 0.38)', rim: 'rgba(14, 20, 58, 0.95)' },
  trinket: { fill: 'rgba(34, 128, 146, 0.8)', empty: 'rgba(34, 128, 146, 0.34)', rim: 'rgba(8, 38, 48, 0.95)' },
  passive: { fill: 'rgba(56, 78, 160, 0.66)', empty: 'rgba(56, 78, 160, 0.3)', rim: 'rgba(14, 20, 58, 0.9)' },
  crew: { fill: 'rgba(150, 110, 40, 0.82)', empty: 'rgba(150, 110, 40, 0.4)', rim: 'rgba(60, 40, 10, 0.95)' },
  suit: { fill: 'rgba(98, 76, 170, 0.82)', empty: 'rgba(98, 76, 170, 0.36)', rim: 'rgba(24, 14, 52, 0.95)' },
};

/** The in-run HUD, drawn on the canvas in screen space (after the camera transform). */
export function drawHud(ctx, game, w, h) {
  const p = game.player;

  // XP bar along the top edge
  const barH = 8;
  ctx.fillStyle = 'rgba(5, 7, 14, 0.85)';
  ctx.fillRect(0, 0, w, barH);
  ctx.fillStyle = '#8ff0ff';
  ctx.fillRect(0, 0, w * Math.min(1, p.xp / p.xpToNext), barH);

  label(ctx, `LV ${p.level}`, 16, barH + 12, { size: 16 });
  label(ctx, formatTime(game.time), w / 2, barH + 10, { size: 28, align: 'center' });
  label(ctx, `${game.level.name} · ${game.level.depth}`, w / 2, barH + 44, {
    size: 12,
    align: 'center',
    color: 'rgba(225, 248, 250, 0.8)',
    weight: 600,
  });
  label(ctx, `${game.kills} kills`, w - 16, barH + 12, { size: 15, align: 'right', color: '#d6eef2', weight: 600 });

  // How long until this depth's boss surfaces
  if (game.bossAt && game.time < game.bossAt) {
    const bw = 160;
    const bx = w / 2 - bw / 2;
    const by = barH + 64;
    ctx.fillStyle = 'rgba(0, 20, 30, 0.6)';
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(bx, by, bw * (game.time / game.bossAt), 4);
    ctx.beginPath();
    ctx.moveTo(bx + bw + 8, by - 3);
    ctx.lineTo(bx + bw + 13, by + 2);
    ctx.lineTo(bx + bw + 8, by + 7);
    ctx.lineTo(bx + bw + 3, by + 2);
    ctx.closePath();
    ctx.fill();
  }

  const bar = drawActionBar(ctx, p, w, h);
  drawWeaponNotes(ctx, game, bar.left, bar.top - 6);
  // The boss's health sits at the top, under the timer, so the bottom stays the weapon bar's.
  if (game.boss && !game.boss.dead) drawBossBar(ctx, game.boss, w, barH + 96);
  if (game.announcement) drawAnnouncement(ctx, game.announcement, w, h);
}

function label(ctx, text, x, y, { size = 14, weight = 700, color = '#ffffff', align = 'left' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillText(text, x + 1, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * The action bar, bottom centre: a row of weapon slots (numbered like a hotbar, level in the
 * corner, a cooldown sweep while the weapon recharges) with each weapon's trinket socket under
 * it. The passives sit in a small block to the right, or in a row above on narrow screens.
 * The weapons are always centred. Returns { top, left } of the weapon bar's plate.
 */
function drawActionBar(ctx, p, w, h) {
  const n = p.weaponSlots;
  const mainW = n * WEAPON_SLOT + (n - 1) * SLOT_GAP;
  const mainH = WEAPON_SLOT + 4 + TRINKET_SLOT;
  const x = Math.round((w - mainW) / 2);
  const y = Math.round(h - BOTTOM_GAP - PLATE_PAD - mainH);
  plate(ctx, x - PLATE_PAD, y - PLATE_PAD, mainW + PLATE_PAD * 2, mainH + PLATE_PAD * 2);

  const trinketY = y + WEAPON_SLOT + 4;
  for (let i = 0; i < n; i++) {
    const wp = p.weapons[i];
    const sx = x + i * (WEAPON_SLOT + SLOT_GAP);
    // The Captain's crew slot (Specialist) is the last one, framed in her gold.
    const crewSlot = p.flags.crewSpecialist && i === n - 1;
    slotFrame(ctx, sx, y, WEAPON_SLOT, crewSlot ? SLOT_STYLES.crew : SLOT_STYLES.weapon, Boolean(wp));
    if (wp) {
      itemPicture(ctx, 'weapon', wp.id, wp.def.icon, sx, y, WEAPON_SLOT);
      cooldownSweep(ctx, wp, sx, y, WEAPON_SLOT);
      label(ctx, String(wp.level), sx + WEAPON_SLOT - 4, y + WEAPON_SLOT - 14, { size: 12, align: 'right' });
    }
    label(ctx, String(i + 1), sx + 4, y + 3, { size: 9, color: 'rgba(225, 235, 255, 0.6)', weight: 700 });

    // its trinket, centered under it (two smaller sockets side by side with Twin Sockets)
    if (p.flags.twinSockets) {
      const half = (WEAPON_SLOT - 4) / 2;
      [wp?.trinket, wp?.trinket2].forEach((id, k) => {
        const tx = sx + k * (half + 4);
        const ty = trinketY + (TRINKET_SLOT - half) / 2;
        slotFrame(ctx, tx, ty, half, SLOT_STYLES.trinket, Boolean(id), wp ? 1 : 0.5);
        if (id) itemPicture(ctx, 'trinket', id, TRINKETS[id].icon, tx, ty, half);
        else if (wp) socket(ctx, tx + half / 2, ty + half / 2);
      });
    } else {
      const tx = sx + (WEAPON_SLOT - TRINKET_SLOT) / 2;
      slotFrame(ctx, tx, trinketY, TRINKET_SLOT, SLOT_STYLES.trinket, Boolean(wp?.trinket), wp ? 1 : 0.5);
      if (wp?.trinket) itemPicture(ctx, 'trinket', wp.trinket, TRINKETS[wp.trinket].icon, tx, trinketY, TRINKET_SLOT);
      else if (wp) socket(ctx, tx + TRINKET_SLOT / 2, trinketY + TRINKET_SLOT / 2);
    }
  }

  // The Hollow Diver's suit socket (Inner Shrine), on its own to the left, level with the trinkets.
  if (p.flags.innerShrine) {
    const size = TRINKET_SLOT;
    const sx = x - PLATE_PAD * 2 - SIDE_GAP - size;
    if (sx - PLATE_PAD >= 8) {
      const id = p.shrine?.trinket;
      plate(ctx, sx - PLATE_PAD, trinketY - PLATE_PAD - 13, size + PLATE_PAD * 2, size + PLATE_PAD * 2 + 13);
      label(ctx, 'Suit', sx + size / 2, trinketY - 15, { size: 9, align: 'center', color: 'rgba(214, 200, 255, 0.8)' });
      slotFrame(ctx, sx, trinketY, size, SLOT_STYLES.suit, Boolean(id));
      if (id) itemPicture(ctx, 'trinket', id, TRINKETS[id].icon, sx, trinketY, size);
      else socket(ctx, sx + size / 2, trinketY + size / 2);
    }
  }

  // Passives: two rows to the right of the weapons, if there's room; otherwise one row above.
  const pn = CONFIG.slots.passives;
  const cols = Math.ceil(pn / 2);
  const sideW = cols * PASSIVE_SLOT + (cols - 1) * SLOT_GAP;
  const sideH = 2 * PASSIVE_SLOT + SLOT_GAP;
  const sideX = x + mainW + PLATE_PAD * 2 + SIDE_GAP;
  let top = y - PLATE_PAD;
  const slots = [];
  if (sideX + sideW + PLATE_PAD <= w - 8) {
    const sy = Math.round(y + (mainH - sideH) / 2);
    plate(ctx, sideX - PLATE_PAD, sy - PLATE_PAD, sideW + PLATE_PAD * 2, sideH + PLATE_PAD * 2);
    for (let i = 0; i < pn; i++) slots.push([sideX + (i % cols) * (PASSIVE_SLOT + SLOT_GAP), sy + Math.floor(i / cols) * (PASSIVE_SLOT + SLOT_GAP)]);
  } else {
    const rowW = pn * PASSIVE_SLOT + (pn - 1) * SLOT_GAP;
    const rx = Math.round((w - rowW) / 2);
    const ry = top - 6 - PLATE_PAD - PASSIVE_SLOT;
    plate(ctx, rx - PLATE_PAD, ry - PLATE_PAD, rowW + PLATE_PAD * 2, PASSIVE_SLOT + PLATE_PAD * 2);
    for (let i = 0; i < pn; i++) slots.push([rx + i * (PASSIVE_SLOT + SLOT_GAP), ry]);
    top = ry - PLATE_PAD;
  }
  const passives = [...p.passives];
  slots.forEach(([sx, sy], i) => {
    const entry = passives[i];
    slotFrame(ctx, sx, sy, PASSIVE_SLOT, SLOT_STYLES.passive, Boolean(entry));
    if (!entry) return;
    const [id, level] = entry;
    itemPicture(ctx, 'passive', id, PASSIVES[id].icon, sx, sy, PASSIVE_SLOT);
    label(ctx, String(level), sx + PASSIVE_SLOT - 3, sy + PASSIVE_SLOT - 11, { size: 10, align: 'right' });
  });
  return { top, left: x - PLATE_PAD };
}

/** The dark, rounded backing behind a group of slots. */
function plate(ctx, x, y, width, height) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fillStyle = 'rgba(4, 12, 22, 0.58)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 230, 240, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * While a weapon recharges, a dark wedge covers its slot and shrinks clockwise from 12 o'clock,
 * like a spell cooldown. Weapons without a cooldown (Razor Starfish, Siphonophore Tendrils,
 * The Watching Eye) never show one.
 */
function cooldownSweep(ctx, wp, x, y, size) {
  if (!(wp.timer > 0) || !(wp.cooldownFull > 0)) return;
  const left = Math.min(1, wp.timer / wp.cooldownFull);
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, size - 2, size - 2, size * 0.2);
  ctx.clip();
  const start = -Math.PI / 2 + (1 - left) * TAU;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, size, start, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 6, 14, 0.5)';
  ctx.fill();
  // the sweeping edge
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(start) * size, cy + Math.sin(start) * size);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** A rounded inventory slot: colored fill, lighter toward the top, dark rim. */
function slotFrame(ctx, x, y, size, style, filled, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.2);
  ctx.fillStyle = filled ? style.fill : style.empty;
  ctx.fill();
  const shade = ctx.createLinearGradient(x, y, x, y + size);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  shade.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = style.rim;
  ctx.stroke();
  // thin inner highlight along the top edge
  ctx.beginPath();
  ctx.moveTo(x + size * 0.22, y + 2.5);
  ctx.lineTo(x + size * 0.78, y + 2.5);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** The item's picture centered in a slot, or its two-letter code if it has none. */
function itemPicture(ctx, kind, id, code, x, y, size) {
  if (drawItemIcon(ctx, kind, id, x + size / 2, y + size / 2, size * 0.76)) return;
  ctx.font = `700 ${size * 0.42}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(code, x + size / 2, y + size / 2 + 1);
}

/** An empty trinket socket: a faint gem outline. */
function socket(ctx, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx, cy + 6);
  ctx.lineTo(cx - 6, cy);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(200, 245, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Extra lines some weapons show (e.g. how many drones are out), plus active buffs, stacked up from `bottom`. */
function drawWeaponNotes(ctx, game, x, bottom) {
  const p = game.player;
  const lines = [];
  for (const w of p.weapons) {
    const note = w.def.hud?.(game);
    if (note) lines.push(note);
    // its trinkets' notes (not the suit's: that one sits on every weapon)
    for (const { id, holder } of mountsOf(w)) {
      if (holder.attachedOnly) continue;
      const trinketNote = TRINKETS[id].hud?.(holder);
      if (trinketNote) lines.push(trinketNote);
    }
  }
  if (p.hasBuff('overclock')) lines.push(`Overclock ${p.buffs.get('overclock').toFixed(1)}s`);
  const heroLine = p.hero.hud?.(game);
  if (heroLine) lines.unshift(heroLine);
  const top = bottom - lines.length * 16;
  lines.forEach((line, i) => label(ctx, line, x, top + i * 16, { size: 12, color: '#bfe9ef', weight: 600 }));
}

/** The boss's name and health, centred at height `y` (under the timer). */
function drawBossBar(ctx, boss, w, y) {
  const barW = Math.min(420, w - 40);
  const barH = 10;
  const x = (w - barW) / 2;
  label(ctx, boss.name, w / 2, y - 19, { size: 13, align: 'center', color: '#ffd166' });
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
  ctx.fillStyle = '#d64545';
  ctx.fillRect(x, y, barW * Math.max(0, boss.hp / boss.maxHp), barH);
}

function drawAnnouncement(ctx, a, w, h) {
  // Quick fade in, slower fade out
  ctx.globalAlpha = Math.max(0, Math.min(1, (a.duration - a.time) * 6, a.time * 2));
  // Shrink long messages to fit narrow screens.
  ctx.font = `800 30px ${FONT}`;
  const size = Math.max(14, Math.min(30, (30 * (w - 32)) / ctx.measureText(a.text).width));
  label(ctx, a.text, w / 2, Math.max(h * 0.2, 132), { size, align: 'center', color: '#ffd166', weight: 800 });
  ctx.globalAlpha = 1;
}
