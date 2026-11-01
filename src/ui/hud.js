import { CONFIG } from '../config.js';
import { PASSIVES } from '../data/passives.js';
import { TRINKETS } from '../data/trinkets.js';
import { drawItemIcon } from '../render/icons.js';
import { formatTime } from './format.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Inventory (top left): weapon slots in a row, each weapon's trinket slot under it, passives below.
const WEAPON_SLOT = 42;
const TRINKET_SLOT = 32;
const PASSIVE_SLOT = 30;
const SLOT_GAP = 5;

// Slot colors, in the style of an inventory hotbar: a rounded square, a dark rim, a lighter top.
const SLOT_STYLES = {
  weapon: { fill: 'rgba(56, 78, 160, 0.8)', empty: 'rgba(56, 78, 160, 0.38)', rim: 'rgba(14, 20, 58, 0.95)' },
  trinket: { fill: 'rgba(34, 128, 146, 0.8)', empty: 'rgba(34, 128, 146, 0.34)', rim: 'rgba(8, 38, 48, 0.95)' },
  passive: { fill: 'rgba(56, 78, 160, 0.66)', empty: 'rgba(56, 78, 160, 0.3)', rim: 'rgba(14, 20, 58, 0.9)' },
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
  const levelWidth = ctx.measureText(`LV ${p.level}`).width;
  const every = CONFIG.talents.every;
  const nextTalent = Math.ceil((p.level + 1) / every) * every;
  label(ctx, `talent at ${nextTalent}`, 16 + levelWidth + 8, barH + 15, { size: 11, color: '#ffd166', weight: 600 });
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

  const below = drawInventory(ctx, p, 16, barH + 40);
  drawWeaponNotes(ctx, game, 16, below);
  if (game.boss && !game.boss.dead) drawBossBar(ctx, game.boss, w, h);
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
 * The inventory: a row of weapon slots (numbered like a hotbar, level in the corner), with
 * each weapon's trinket slot right underneath it, and a row of passive slots below that.
 * Empty weapon slots show how many are left; an empty trinket slot under a weapon shows a
 * faint socket. Returns the y just below the inventory.
 */
function drawInventory(ctx, p, x, y) {
  const trinketY = y + WEAPON_SLOT + 4;
  for (let i = 0; i < p.weaponSlots; i++) {
    const wp = p.weapons[i];
    const sx = x + i * (WEAPON_SLOT + SLOT_GAP);
    slotFrame(ctx, sx, y, WEAPON_SLOT, SLOT_STYLES.weapon, Boolean(wp));
    label(ctx, String(i + 1), sx + 4, y + 3, { size: 9, color: 'rgba(225, 235, 255, 0.55)', weight: 700 });
    if (wp) {
      itemPicture(ctx, 'weapon', wp.id, wp.def.icon, sx, y, WEAPON_SLOT);
      label(ctx, String(wp.level), sx + WEAPON_SLOT - 4, y + WEAPON_SLOT - 13, { size: 11, align: 'right' });
    }

    // its trinket, centered under it
    const tx = sx + (WEAPON_SLOT - TRINKET_SLOT) / 2;
    slotFrame(ctx, tx, trinketY, TRINKET_SLOT, SLOT_STYLES.trinket, Boolean(wp?.trinket), wp ? 1 : 0.5);
    if (wp?.trinket) itemPicture(ctx, 'trinket', wp.trinket, TRINKETS[wp.trinket].icon, tx, trinketY, TRINKET_SLOT);
    else if (wp) socket(ctx, tx + TRINKET_SLOT / 2, trinketY + TRINKET_SLOT / 2);
  }

  const passiveY = trinketY + TRINKET_SLOT + 10;
  const passives = [...p.passives];
  for (let i = 0; i < CONFIG.slots.passives; i++) {
    const sx = x + i * (PASSIVE_SLOT + SLOT_GAP);
    const entry = passives[i];
    slotFrame(ctx, sx, passiveY, PASSIVE_SLOT, SLOT_STYLES.passive, Boolean(entry));
    if (!entry) continue;
    const [id, level] = entry;
    itemPicture(ctx, 'passive', id, PASSIVES[id].icon, sx, passiveY, PASSIVE_SLOT);
    label(ctx, String(level), sx + PASSIVE_SLOT - 3, passiveY + PASSIVE_SLOT - 11, { size: 10, align: 'right' });
  }
  return passiveY + PASSIVE_SLOT + 8;
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

/** Extra lines some weapons show (e.g. how many drones are out), plus active buffs. */
function drawWeaponNotes(ctx, game, x, y) {
  const p = game.player;
  const lines = [];
  for (const w of p.weapons) {
    const note = w.def.hud?.(game);
    if (note) lines.push(note);
    const trinketNote = w.trinket ? TRINKETS[w.trinket].hud?.(w) : null;
    if (trinketNote) lines.push(trinketNote);
  }
  if (p.hasBuff('overclock')) lines.push(`Overclock ${p.buffs.get('overclock').toFixed(1)}s`);
  lines.forEach((line, i) => label(ctx, line, x, y + i * 16, { size: 12, color: '#bfe9ef', weight: 600 }));
}

function drawBossBar(ctx, boss, w, h) {
  const barW = Math.min(520, w - 40);
  const barH = 12;
  const x = (w - barW) / 2;
  const y = h - 40;
  label(ctx, boss.name, w / 2, y - 22, { size: 14, align: 'center', color: '#ffd166' });
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
  ctx.fillStyle = '#d64545';
  ctx.fillRect(x, y, barW * Math.max(0, boss.hp / boss.maxHp), barH);
}

function drawAnnouncement(ctx, a, w, h) {
  // Quick fade in, slower fade out
  ctx.globalAlpha = Math.max(0, Math.min(1, (a.duration - a.time) * 6, a.time * 2));
  label(ctx, a.text, w / 2, h * 0.2, { size: 30, align: 'center', color: '#ffd166', weight: 800 });
  ctx.globalAlpha = 1;
}
