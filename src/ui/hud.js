import { CONFIG } from '../config.js';
import { TAU } from '../core/math.js';
import { RARITIES, RARITY_ORDER } from '../data/augments.js';
import { PASSIVES } from '../data/passives.js';
import { TRINKETS, mountsOf } from '../data/trinkets.js';
import { drawItemIcon } from '../render/icons.js';
import { formatTime } from './format.js';
import { BAND as METAL_BAND, bandGradient, bolt, brassGradient, metal, surfacePattern } from './metal.js';

// The HUD is made of the same matte, hammered copper and brass as the menus (see metal.js and style.css):
// copper plates in a studded brass band, brass nameplates and rolling counters, brass-framed
// windows for the weapons, portholes for trinkets, outlined lettering. Kelp hangs off the bar.
const PLATE_FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const DISPLAY_FONT = '"Alfa Slab One", Rockwell, Georgia, serif';
const OUTLINE = '#2a1406';
const INK = '#2b1207';
const CREAM = '#fff3dc';

// Action bar (bottom centre, like a spell bar): weapon slots in a row with each weapon's trinket
// socket under it, and the passives in a small block to the right.
const WEAPON_SLOT = 50;
const TRINKET_SLOT = 36;
const PASSIVE_SLOT = 30;
const SLOT_GAP = 8;
const BAND = 8; // the brass band round the HUD's plates
const PLATE_PAD = BAND + 6; // the plate reaches this far past the slots
const BOTTOM_GAP = 10; // space between the bar and the bottom edge of the screen
const SIDE_GAP = 12; // space between the weapon bar and the passives block

// Window frames: brass for weapons and passives, the Captain's crew slot in bright gold, the
// Hollow Diver's suit socket in copper. `glass` is the window's light and dark color.
const FRAMES = {
  weapon: { metal: 'brass', glass: ['#2a7686', '#071f25'] },
  passive: { metal: 'brass', glass: ['#246878', '#061a1f'] },
  crew: { metal: 'gold', glass: ['#5a5226', '#16130a'] },
  suit: { metal: 'copper', glass: ['#4a3d6e', '#120e1e'] },
};

/** The in-run HUD, drawn on the canvas in screen space (after the camera transform). */
export function drawHud(ctx, game, w, h) {
  const p = game.player;

  // XP: a glass tube along the top edge, with a brass edge under it
  const barH = 8;
  ctx.fillStyle = '#050808';
  ctx.fillRect(0, 0, w, barH);
  const xpW = w * Math.min(1, p.xp / p.xpToNext);
  const xp = ctx.createLinearGradient(0, 0, 0, barH);
  xp.addColorStop(0, '#e0fcff');
  xp.addColorStop(0.6, '#3fc6d8');
  xp.addColorStop(1, '#1b7f8d');
  ctx.fillStyle = xp;
  ctx.fillRect(0, 0, xpW, barH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(0, 1, xpW, 1.5);
  ctx.fillStyle = brassGradient(ctx, 0, barH, 0, barH + 4);
  ctx.fillRect(0, barH, w, 3);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(0, barH + 3, w, 1.5);

  brassLabel(ctx, `LV ${p.level}`, 14, barH + 12, { size: 17 });

  // the time on a rolling counter, the depth on a plate under it
  const clock = counter(ctx, formatTime(game.time), w / 2, barH + 10, { digitW: 19, digitH: 28, size: 23, align: 'center' });
  const depth = brassLabel(ctx, `${game.level.name} · ${game.level.depth}`.toUpperCase(), w / 2, clock.bottom + 7, { size: 11, align: 'center', spacing: 1 });

  const kills = counter(ctx, String(game.kills), w - 14, barH + 10, { digitW: 15, digitH: 22, size: 18, align: 'right' });
  label(ctx, 'KILLS', w - 16, kills.bottom + 5, { size: 12, align: 'right' });

  // How long until this depth's boss surfaces: a thin tube filling with amber
  if (game.bossAt && game.time < game.bossAt) {
    const bw = 160;
    const bx = w / 2 - bw / 2;
    const by = depth.bottom + 10;
    tube(ctx, bx, by, bw, 5, game.time / game.bossAt, ['#ffe7a8', '#e09a2c']);
    // a small diamond at the end: the boss
    ctx.beginPath();
    ctx.moveTo(bx + bw + 10, by - 3.5);
    ctx.lineTo(bx + bw + 16, by + 2.5);
    ctx.lineTo(bx + bw + 10, by + 8.5);
    ctx.lineTo(bx + bw + 4, by + 2.5);
    ctx.closePath();
    ctx.fillStyle = '#ffc35a';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const bar = drawActionBar(ctx, p, w, h);
  drawWeaponNotes(ctx, game, bar.left, bar.top - 8);
  // The boss's health sits at the top, under the timer, so the bottom stays the weapon bar's.
  if (game.boss && !game.boss.dead) drawBossBar(ctx, game.boss, w, barH + 112);
  if (game.announcement) drawAnnouncement(ctx, game.announcement, w, h);
}

/** Pale lettering with a dark outline, for notes over the water. */
function label(ctx, text, x, y, { size = 14, weight = 700, color = CREAM, align = 'left', font = PLATE_FONT } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.24);
  ctx.strokeStyle = OUTLINE;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Big brass lettering outlined in dark, like the menus' headings. */
function display(ctx, text, x, y, size) {
  ctx.save();
  ctx.font = `${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillText(text, x, y + size * 0.14);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = brassGradient(ctx, 0, y, 0, y + size);
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ------------------------------------------------ materials

/**
 * Lay a surface from metal.js over the current path's metal, like the menus' plates: the copper's
 * hammering, or `which` 'bandSurface' for a plate's brass band.
 */
function hammer(ctx, which = 'surface') {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = surfacePattern(ctx, which);
  ctx.fill();
  ctx.restore();
}

/** A hammered brass plate with a dark outline. */
function brassPlate(ctx, x, y, width, height, radius = 5) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 4;
  ctx.fillStyle = brassGradient(ctx, 0, y, 0, y + height);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  hammer(ctx);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

/** Text on a brass plate that fits it. Returns the plate's box. */
function brassLabel(ctx, text, x, y, { size = 14, align = 'left', spacing = 0.6 } = {}) {
  ctx.save();
  ctx.font = `700 ${size}px ${PLATE_FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const padX = Math.round(size * 0.65);
  const padY = Math.round(size * 0.32);
  const width = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const height = size + padY * 2;
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  brassPlate(ctx, left, y, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cy = y + height / 2 + 1;
  ctx.fillStyle = 'rgba(255, 240, 200, 0.45)';
  ctx.fillText(text, left + width / 2, cy + 1);
  ctx.fillStyle = INK;
  ctx.fillText(text, left + width / 2, cy);
  ctx.restore();
  return { left, right: left + width, bottom: y + height };
}

/** A rolling counter: one dark window per digit, set in a brass bezel. Returns its box. */
function counter(ctx, text, x, y, { digitW, digitH, size, align = 'left' }) {
  const chars = [...text];
  const sepW = Math.round(digitW * 0.45);
  const gap = 2;
  const pad = 5;
  const inner = chars.reduce((sum, ch) => sum + (/\d/.test(ch) ? digitW : sepW), 0) + gap * (chars.length - 1);
  const width = inner + pad * 2;
  const height = digitH + pad * 2;
  const left = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
  brassPlate(ctx, left, y, width, height, 6);
  const glass = ctx.createLinearGradient(0, y + pad, 0, y + pad + digitH);
  glass.addColorStop(0, '#040606');
  glass.addColorStop(0.44, '#1c2322');
  glass.addColorStop(0.56, '#1c2322');
  glass.addColorStop(1, '#040606');
  ctx.font = `700 ${size}px ${PLATE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let cx = left + pad;
  for (const ch of chars) {
    const digit = /\d/.test(ch);
    const cw = digit ? digitW : sepW;
    if (digit) {
      ctx.beginPath();
      ctx.roundRect(cx, y + pad, cw, digitH, 2);
      ctx.fillStyle = glass;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(cx, y + pad + digitH / 2, cw, 1); // the seam between the drum's faces
    }
    ctx.fillStyle = digit ? '#f6f1e4' : INK;
    ctx.fillText(ch, cx + cw / 2, y + pad + digitH / 2 + 1);
    cx += cw + gap;
  }
  return { left, right: left + width, bottom: y + height };
}

/** A glass tube, `t` full, in a brass sleeve. */
function tube(ctx, x, y, width, height, t, [light, dark]) {
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, width + 6, height + 6, 4);
  ctx.fillStyle = brassGradient(ctx, 0, y - 3, 0, y + height + 3);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = '#050808';
  ctx.fillRect(x, y, width, height);
  const fill = ctx.createLinearGradient(0, y, 0, y + height);
  fill.addColorStop(0, light);
  fill.addColorStop(1, dark);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, t)), height);
}

/** Matte, hammered copper, lit from the top left (the menus' --copper-face). */
function copperFill(ctx, x, y, width, height) {
  const base = ctx.createLinearGradient(x, y, x + width * 0.35, y + height);
  base.addColorStop(0, '#ce8c68');
  base.addColorStop(0.36, '#be7852');
  base.addColorStop(0.74, '#a05c3a');
  base.addColorStop(1, '#70361e');
  ctx.fillStyle = base;
  ctx.fill();
  hammer(ctx);
}

/**
 * A hammered copper plate in a brass band studded with bolts, outlined in dark, with a little rust
 * at the two bottom corner screws (the band in metal.js's BAND_FINISH, like the menus').
 */
function plate(ctx, x, y, width, height) {
  ctx.save();
  // the brass band
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = bandGradient(ctx, 0, y, 0, y + height);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  hammer(ctx, 'bandSurface');
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // the copper face, sunk into the band
  ctx.beginPath();
  ctx.roundRect(x + BAND, y + BAND, width - BAND * 2, height - BAND * 2, 6);
  copperFill(ctx, x + BAND, y + BAND, width - BAND * 2, height - BAND * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(42, 20, 6, 0.8)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + BAND + 6, y + BAND + 2.5);
  ctx.lineTo(x + width - BAND - 6, y + BAND + 2.5);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 228, 205, 0.3)';
  ctx.stroke();
  // studs along the top and bottom of the band, spread evenly like the menus' plates
  const tile = 48;
  const count = Math.max(1, Math.floor(width / tile));
  const spacing = count > 1 ? (width - count * tile) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const bx = count > 1 ? x + tile / 2 + i * (tile + spacing) : x + width / 2;
    bolt(ctx, bx, y + BAND / 2, 2.9, 1.1);
    if (i === 0 || i === count - 1) {
      // the bottom corner screws, with their rust (metal.js's 40px sprite: stud at x 20, plate edge at y 30)
      const sprite = metal().rust[i === 0 ? 0 : 1];
      const s = BAND / METAL_BAND;
      ctx.drawImage(sprite, bx - 20 * s, y + height - 30 * s, 40 * s, 40 * s);
    } else {
      bolt(ctx, bx, y + height - BAND / 2, 2.9, 1.1);
    }
  }
  ctx.restore();
}

/** Kelp hanging from (x, y), swaying slowly; `variant` picks one of metal.js's clumps. */
function hangingKelp(ctx, x, y, width, variant, phase) {
  const sprite = metal().kelp[variant];
  const height = width * 2.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(performance.now() / 1000 / 1.1 + phase) * 0.05);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 3;
  ctx.drawImage(sprite, -width / 2, -width * 0.12, width, height);
  ctx.restore();
}

/** A square window in a hammered brass (or gold, or copper) frame, outlined, with glass behind. */
function windowFrame(ctx, x, y, size, frame, filled, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const b = size >= 40 ? 4 : 3;
  ctx.beginPath();
  ctx.roundRect(x - 1, y - 1, size + 2, size + 2, 7);
  if (!filled) ctx.fillStyle = '#6b5532';
  else if (frame.metal === 'copper') {
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, '#d89470');
    g.addColorStop(0.5, '#b4683f');
    g.addColorStop(1, '#70361e');
    ctx.fillStyle = g;
  } else ctx.fillStyle = brassGradient(ctx, x, y, x + size * 0.3, y + size);
  ctx.fill();
  if (filled && frame.metal === 'gold') {
    ctx.fillStyle = 'rgba(255, 245, 190, 0.25)';
    ctx.fill();
  }
  if (filled) hammer(ctx);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x + b, y + b, size - b * 2, size - b * 2, 4);
  const glass = ctx.createRadialGradient(x + size / 2, y + size * 0.36, 0, x + size / 2, y + size / 2, size * 0.66);
  glass.addColorStop(0, filled ? frame.glass[0] : '#142224');
  glass.addColorStop(1, filled ? frame.glass[1] : '#050909');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(42, 20, 6, 0.9)';
  ctx.stroke();
  // a glint in the glass's top left corner
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, y + size * 0.24, size * 0.14, size * 0.07, -0.5, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fill();
  ctx.restore();
}

/** One trinket socket: glass, the trinket's picture (if any), the brass porthole ring. */
function trinketSocket(ctx, cx, cy, size, id, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const r = size * 0.31;
  const glass = ctx.createRadialGradient(cx, cy - r * 0.35, 0, cx, cy, r);
  glass.addColorStop(0, id ? '#2f7e8e' : '#163236');
  glass.addColorStop(1, '#03090b');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  if (id) drawItemIcon(ctx, 'trinket', id, cx, cy, size * 0.56);
  ctx.drawImage(metal().socket, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

/** A small round brass badge with a number on it (a weapon's level). */
function levelBadge(ctx, text, cx, cy) {
  const r = 8.5;
  ctx.save();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#e8cc8c');
  g.addColorStop(0.5, '#d2a958');
  g.addColorStop(1, '#94691f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.font = `700 11px ${PLATE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

/** A small gem with how many augments a weapon has, in the color of the rarest one. */
function augmentBadge(ctx, augments, cx, cy) {
  const best = Math.max(...augments.map((a) => RARITY_ORDER.indexOf(a.rarity)));
  const color = RARITIES[RARITY_ORDER[best]].color;
  const r = 9;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.font = `700 10px ${PLATE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(String(augments.length), cx, cy + 1);
  ctx.restore();
}

// ------------------------------------------------ the action bar

/**
 * The action bar, bottom centre: a row of weapon slots (numbered like a hotbar, level in the
 * corner, a cooldown sweep while the weapon recharges) with each weapon's trinket socket under
 * it. The passives sit in a small block to the right, or in a row above on narrow screens.
 * The weapons are always centred. Returns { top, left } of the weapon bar's plate.
 */
function drawActionBar(ctx, p, w, h) {
  const n = p.weaponSlots;
  const mainW = n * WEAPON_SLOT + (n - 1) * SLOT_GAP;
  const mainH = WEAPON_SLOT + 6 + TRINKET_SLOT;
  const x = Math.round((w - mainW) / 2);
  const y = Math.round(h - BOTTOM_GAP - PLATE_PAD - mainH);
  const plateX = x - PLATE_PAD;
  plate(ctx, plateX, y - PLATE_PAD, mainW + PLATE_PAD * 2, mainH + PLATE_PAD * 2);

  const trinketY = y + WEAPON_SLOT + 6;
  for (let i = 0; i < n; i++) {
    const wp = p.weapons[i];
    const sx = x + i * (WEAPON_SLOT + SLOT_GAP);
    // The Captain's crew slot (Specialist) is the last one, framed in her gold.
    const crewSlot = p.flags.crewSpecialist && i === n - 1;
    windowFrame(ctx, sx, y, WEAPON_SLOT, crewSlot ? FRAMES.crew : FRAMES.weapon, Boolean(wp));
    if (wp) {
      itemPicture(ctx, 'weapon', wp.id, wp.def.icon, sx, y, WEAPON_SLOT);
      cooldownSweep(ctx, wp, sx, y, WEAPON_SLOT);
      levelBadge(ctx, String(wp.level), sx + WEAPON_SLOT - 2, y + WEAPON_SLOT - 2);
      if (wp.augments.length) augmentBadge(ctx, wp.augments, sx + WEAPON_SLOT - 1, y + 1);
    }
    label(ctx, String(i + 1), sx + 6, y + 5, { size: 10 });

    // its trinket, centred under it (two smaller sockets side by side with Twin Sockets)
    const alpha = wp ? 1 : 0.5;
    if (p.flags.twinSockets) {
      const half = (WEAPON_SLOT - 2) / 2;
      [wp?.trinket, wp?.trinket2].forEach((id, k) => {
        trinketSocket(ctx, sx + half / 2 + k * (half + 2), trinketY + TRINKET_SLOT / 2, half + 2, id, alpha);
      });
    } else {
      trinketSocket(ctx, sx + WEAPON_SLOT / 2, trinketY + TRINKET_SLOT / 2, TRINKET_SLOT, wp?.trinket, alpha);
    }
  }

  // The Hollow Diver's suit socket (Inner Shrine), on its own to the left, level with the trinkets.
  if (p.flags.innerShrine) {
    const size = TRINKET_SLOT;
    const sx = plateX - SIDE_GAP - PLATE_PAD - size;
    if (sx - PLATE_PAD >= 8) {
      const id = p.shrine?.trinket;
      plate(ctx, sx - PLATE_PAD, trinketY - PLATE_PAD - 15, size + PLATE_PAD * 2, size + PLATE_PAD * 2 + 15);
      label(ctx, 'SUIT', sx + size / 2, trinketY - 17, { size: 11, align: 'center' });
      trinketSocket(ctx, sx + size / 2, trinketY + size / 2, size, id);
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
  let side = null;
  if (sideX + sideW + PLATE_PAD <= w - 8) {
    const sy = Math.round(y + (mainH - sideH) / 2);
    side = { x: sideX - PLATE_PAD, y: sy - PLATE_PAD, w: sideW + PLATE_PAD * 2 };
    plate(ctx, side.x, side.y, side.w, sideH + PLATE_PAD * 2);
    for (let i = 0; i < pn; i++) slots.push([sideX + (i % cols) * (PASSIVE_SLOT + SLOT_GAP), sy + Math.floor(i / cols) * (PASSIVE_SLOT + SLOT_GAP)]);
  } else {
    const rowW = pn * PASSIVE_SLOT + (pn - 1) * SLOT_GAP;
    const rx = Math.round((w - rowW) / 2);
    const ry = top - 8 - PLATE_PAD - PASSIVE_SLOT;
    plate(ctx, rx - PLATE_PAD, ry - PLATE_PAD, rowW + PLATE_PAD * 2, PASSIVE_SLOT + PLATE_PAD * 2);
    for (let i = 0; i < pn; i++) slots.push([rx + i * (PASSIVE_SLOT + SLOT_GAP), ry]);
    top = ry - PLATE_PAD;
  }
  const passives = [...p.passives];
  slots.forEach(([sx, sy], i) => {
    const entry = passives[i];
    windowFrame(ctx, sx, sy, PASSIVE_SLOT, FRAMES.passive, Boolean(entry));
    if (!entry) return;
    const [id, level] = entry;
    itemPicture(ctx, 'passive', id, PASSIVES[id].icon, sx, sy, PASSIVE_SLOT);
    label(ctx, String(level), sx + PASSIVE_SLOT - 3, sy + PASSIVE_SLOT - 13, { size: 11, align: 'right' });
  });

  // kelp caught on the corners of the plates
  hangingKelp(ctx, plateX + 4, y - PLATE_PAD + 2, 30, 0, 0);
  if (side) hangingKelp(ctx, side.x + side.w - 6, side.y + 2, 24, 1, 2);
  return { top, left: plateX };
}

/**
 * While a weapon recharges, a dark wedge covers its window and shrinks clockwise from 12 o'clock,
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
  ctx.roundRect(x + 4, y + 4, size - 8, size - 8, 4);
  ctx.clip();
  const start = -Math.PI / 2 + (1 - left) * TAU;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, size, start, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 4, 6, 0.55)';
  ctx.fill();
  // the sweeping edge
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(start) * size, cy + Math.sin(start) * size);
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** The item's picture centred in a slot, or its two-letter code if it has none. */
function itemPicture(ctx, kind, id, code, x, y, size) {
  if (drawItemIcon(ctx, kind, id, x + size / 2, y + size / 2, size * 0.7)) return;
  label(ctx, code, x + size / 2, y + size * 0.3, { size: Math.round(size * 0.38), align: 'center', font: DISPLAY_FONT, weight: 400 });
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
  const step = 18;
  const top = bottom - lines.length * step;
  lines.forEach((line, i) => label(ctx, line, x + 4, top + i * step, { size: 14, weight: 700 }));
}

/** The boss's name and health, centred at height `y` (under the timer). */
function drawBossBar(ctx, boss, w, y) {
  const barW = Math.min(420, w - 40);
  const barH = 10;
  const x = (w - barW) / 2;
  display(ctx, boss.name.toUpperCase(), w / 2, y - 26, 17);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - 5, y - 5, barW + 10, barH + 10, 5);
  ctx.fillStyle = brassGradient(ctx, 0, y - 5, 0, y + barH + 5);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#050808';
  ctx.fillRect(x, y, barW, barH);
  const hp = barW * Math.max(0, boss.hp / boss.maxHp);
  const red = ctx.createLinearGradient(0, y, 0, y + barH);
  red.addColorStop(0, '#ff8a68');
  red.addColorStop(0.5, '#d23a26');
  red.addColorStop(1, '#7e1a10');
  ctx.fillStyle = red;
  ctx.fillRect(x, y, hp, barH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(x, y + 1.5, hp, 1.5);
  bolt(ctx, x - 1, y + barH / 2, 3, 1.1);
  bolt(ctx, x + barW + 1, y + barH / 2, 3, 1.1);
}

function drawAnnouncement(ctx, a, w, h) {
  // Quick fade in, slower fade out
  ctx.globalAlpha = Math.max(0, Math.min(1, (a.duration - a.time) * 6, a.time * 2));
  // Shrink long messages to fit narrow screens.
  ctx.font = `34px ${DISPLAY_FONT}`;
  const size = Math.max(14, Math.min(34, (34 * (w - 40)) / ctx.measureText(a.text).width));
  display(ctx, a.text, w / 2, Math.max(h * 0.2, 140), size);
  ctx.globalAlpha = 1;
}
