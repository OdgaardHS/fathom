import { TAU } from '../core/math.js';

/**
 * The glass pipe round an augment card, in place of its brass band: a glass tube with copper
 * elbows at the corners and a copper clamp on each side, and fluid in the augment's rarity color
 * running round it (streaks, a current and bubbles). Drawn on a canvas laid over the card's band.
 *
 *   attachPipe(card, color)   give a card its pipe; it animates until the card leaves the page
 *
 * The glass and copper are drawn once per card size into two layers (behind and in front of the
 * fluid); every frame only draws the fluid between them.
 */

const TUBE = 15; // the pipe's outside diameter, a little more than the band, in css pixels
const MARGIN = 8; // room round the card for the clamps' ends
const OUTLINE = '#2a1406';
const COPPER = { light: '#eaa883', mid: '#c27a52', dark: '#8a4628', deep: '#5a2812' };

const pipes = new Set();
let running = false;
const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Give augment card `card` a glass pipe with `color` fluid (a '#rrggbb' color). */
export function attachPipe(card, color) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pipe';
  card.append(canvas);
  pipes.add({ card, canvas, rgb: rgbOf(color), size: '', layers: null, bubbles: makeBubbles() });
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
}

function frame(now) {
  for (const pipe of pipes) {
    if (!pipe.card.isConnected) {
      pipes.delete(pipe);
      continue;
    }
    if (pipe.card.offsetParent !== null) draw(pipe, still ? 0 : now / 1000);
  }
  if (pipes.size) requestAnimationFrame(frame);
  else running = false;
}

// ------------------------------------------------ the pipe's shape

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (c, a) => `rgba(${c.map(Math.round).join(', ')}, ${a})`;
const mix = (c, to, t) => c.map((v, i) => v + (to[i] - v) * t);

/** The pipe's center line: a rounded rectangle down the middle of the card's band. */
function shapeOf(card) {
  const band = parseFloat(getComputedStyle(card).borderTopWidth) || 12;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const x = MARGIN + band / 2;
  const y = MARGIN + band / 2;
  return { band, cw: w + MARGIN * 2, ch: h + MARGIN * 2, x, y, w: w - band, h: h - band, r: 10 };
}

function loop(s) {
  const p = new Path2D();
  p.roundRect(s.x, s.y, s.w, s.h, s.r);
  return p;
}

/**
 * A point `d` pixels along the center line (clockwise from the top-left corner's end, like
 * roundRect draws it), with the outward normal there.
 */
function pointAt(s, d) {
  const a = s.w - 2 * s.r;
  const b = s.h - 2 * s.r;
  const q = (Math.PI / 2) * s.r;
  const arc = (cx, cy, from, t) => {
    const ang = from + t / s.r;
    return { x: cx + Math.cos(ang) * s.r, y: cy + Math.sin(ang) * s.r, nx: Math.cos(ang), ny: Math.sin(ang) };
  };
  const runs = [
    [a, (t) => ({ x: s.x + s.r + t, y: s.y, nx: 0, ny: -1 })],
    [q, (t) => arc(s.x + s.w - s.r, s.y + s.r, -Math.PI / 2, t)],
    [b, (t) => ({ x: s.x + s.w, y: s.y + s.r + t, nx: 1, ny: 0 })],
    [q, (t) => arc(s.x + s.w - s.r, s.y + s.h - s.r, 0, t)],
    [a, (t) => ({ x: s.x + s.w - s.r - t, y: s.y + s.h, nx: 0, ny: 1 })],
    [q, (t) => arc(s.x + s.r, s.y + s.h - s.r, Math.PI / 2, t)],
    [b, (t) => ({ x: s.x, y: s.y + s.h - s.r - t, nx: -1, ny: 0 })],
    [q, (t) => arc(s.x + s.r, s.y + s.r, Math.PI, t)],
  ];
  let left = ((d % lengthOf(s)) + lengthOf(s)) % lengthOf(s);
  for (const [len, at] of runs) {
    if (left <= len) return at(left);
    left -= len;
  }
  return runs[0][1](0);
}

const lengthOf = (s) => 2 * (s.w - 2 * s.r) + 2 * (s.h - 2 * s.r) + TAU * s.r;

/** Stroke `path` on `ctx` with `width` and `style`. */
function stroke(ctx, path, width, style) {
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke(path);
}

function layer(s, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(s.cw * dpr);
  c.height = Math.ceil(s.ch * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  return { c, ctx };
}

// ------------------------------------------------ glass and copper (drawn once per size)

/** Behind the fluid: the dark outline and the back of the glass. */
function backLayer(s, dpr) {
  const { c, ctx } = layer(s, dpr);
  const path = loop(s);
  stroke(ctx, path, TUBE + 3, OUTLINE);
  stroke(ctx, path, TUBE, 'rgba(14, 34, 40, 0.55)');
  stroke(ctx, path, TUBE - 2, 'rgba(190, 230, 236, 0.10)');
  return c;
}

/** In front of the fluid: the glass's shading and shine, then the copper elbows and clamps. */
function frontLayer(s, dpr) {
  const { c, ctx } = layer(s, dpr);
  const path = loop(s);

  // the glass: darker toward its edges, a bright streak along the top (lit from the top left),
  // a faint second one lower down; kept inside the tube
  const glass = layer(s, dpr);
  const g = glass.ctx;
  stroke(g, path, TUBE, 'rgba(0, 10, 14, 0.38)');
  g.globalCompositeOperation = 'destination-out';
  stroke(g, path, TUBE - 5, 'rgba(0, 0, 0, 0.75)');
  stroke(g, path, TUBE - 8, 'rgba(0, 0, 0, 1)');
  g.globalCompositeOperation = 'source-over';
  g.save();
  g.translate(-1.6, -2.6);
  stroke(g, path, 4, 'rgba(255, 255, 255, 0.16)');
  stroke(g, path, 1.6, 'rgba(255, 255, 255, 0.8)');
  g.restore();
  g.save();
  g.translate(1.4, 2.8);
  stroke(g, path, 1, 'rgba(255, 255, 255, 0.28)');
  g.restore();
  g.globalCompositeOperation = 'destination-in';
  stroke(g, path, TUBE - 0.5, '#000');
  ctx.drawImage(glass.c, 0, 0, s.cw, s.ch);

  for (const corner of corners(s)) elbow(ctx, s, dpr, corner);
  for (const clampAt of clamps(s)) clamp(ctx, clampAt);
  return c;
}

/** The four corners: the elbow's path and the two collars at its ends. */
function corners(s) {
  const e = 7; // how far the elbow reaches along the straight runs
  const { x, y, w, h, r } = s;
  const list = [
    { from: [x, y + r + e], to: [x + r + e, y], c: [x + r, y + r], a0: Math.PI, a1: Math.PI * 1.5, ends: [[x, y + r + e, 'h'], [x + r + e, y, 'v']] },
    { from: [x + w - r - e, y], to: [x + w, y + r + e], c: [x + w - r, y + r], a0: -Math.PI / 2, a1: 0, ends: [[x + w - r - e, y, 'v'], [x + w, y + r + e, 'h']] },
    { from: [x + w, y + h - r - e], to: [x + w - r - e, y + h], c: [x + w - r, y + h - r], a0: 0, a1: Math.PI / 2, ends: [[x + w, y + h - r - e, 'h'], [x + w - r - e, y + h, 'v']] },
    { from: [x + r + e, y + h], to: [x, y + h - r - e], c: [x + r, y + h - r], a0: Math.PI / 2, a1: Math.PI, ends: [[x + r + e, y + h, 'v'], [x, y + h - r - e, 'h']] },
  ];
  return list.map((k) => {
    const p = new Path2D();
    const start = [k.c[0] + Math.cos(k.a0) * r, k.c[1] + Math.sin(k.a0) * r];
    const end = [k.c[0] + Math.cos(k.a1) * r, k.c[1] + Math.sin(k.a1) * r];
    p.moveTo(...k.from);
    p.lineTo(...start);
    p.arc(k.c[0], k.c[1], r, k.a0, k.a1);
    p.lineTo(...end);
    p.lineTo(...k.to);
    return { path: p, ends: k.ends };
  });
}

/** A copper elbow: a short, thicker copper pipe bent round the corner, with a collar at each end. */
function elbow(ctx, s, dpr, { path, ends }) {
  const piece = layer(s, dpr);
  const g = piece.ctx;
  stroke(g, path, TUBE + 5, OUTLINE);
  stroke(g, path, TUBE + 2, COPPER.deep);
  stroke(g, path, TUBE - 1, COPPER.dark);
  stroke(g, path, TUBE - 5, COPPER.mid);
  g.save();
  g.translate(-1.4, -2.2);
  stroke(g, path, 2.4, 'rgba(250, 196, 160, 0.75)');
  g.restore();
  g.globalCompositeOperation = 'destination-in';
  stroke(g, path, TUBE + 5, '#000');
  ctx.drawImage(piece.c, 0, 0, s.cw, s.ch);
  for (const [cx, cy, across] of ends) collar(ctx, cx, cy, across === 'h');
}

/** A copper ring round the pipe at (x, y): lying `horizontal` across a vertical pipe, or upright across a level one. */
function collar(ctx, x, y, horizontal) {
  const len = TUBE + 7;
  const thick = 4.5;
  ctx.save();
  ctx.translate(x, y);
  if (!horizontal) ctx.rotate(Math.PI / 2);
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, COPPER.deep);
  grad.addColorStop(0.3, COPPER.light);
  grad.addColorStop(0.6, COPPER.mid);
  grad.addColorStop(1, COPPER.deep);
  ctx.beginPath();
  ctx.roundRect(-len / 2, -thick / 2, len, thick, 1.5);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

/** Where the clamps go: the middle of each side, across the pipe. */
function clamps(s) {
  return [
    { x: s.x + s.w / 2, y: s.y, vertical: false },
    { x: s.x + s.w, y: s.y + s.h / 2, vertical: true },
    { x: s.x + s.w / 2, y: s.y + s.h, vertical: false },
    { x: s.x, y: s.y + s.h / 2, vertical: true },
  ];
}

/** A copper strap over the pipe, screwed down on both sides. */
function clamp(ctx, { x, y, vertical }) {
  const len = TUBE + 12;
  const wide = 7;
  ctx.save();
  ctx.translate(x, y);
  if (vertical) ctx.rotate(Math.PI / 2);
  // the strap runs across the pipe: rounded over it, flat at the ends
  const grad = ctx.createLinearGradient(0, -len / 2, 0, len / 2);
  grad.addColorStop(0, COPPER.dark);
  grad.addColorStop(0.24, COPPER.mid);
  grad.addColorStop(0.36, COPPER.light);
  grad.addColorStop(0.62, COPPER.mid);
  grad.addColorStop(0.8, COPPER.deep);
  grad.addColorStop(1, COPPER.dark);
  ctx.beginPath();
  ctx.roundRect(-wide / 2, -len / 2, wide, len, 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // a screw in each end
  for (const end of [-1, 1]) {
    const sy = end * (len / 2 - 3);
    ctx.beginPath();
    ctx.arc(0, sy, 2.2, 0, TAU);
    ctx.fillStyle = '#d6b264';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.4, sy - 0.6);
    ctx.lineTo(1.4, sy + 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------ the fluid (every frame)

function makeBubbles() {
  return Array.from({ length: 9 }, () => ({
    at: Math.random(), // where along the pipe it starts, as a share of the way round
    speed: 46 + Math.random() * 40, // pixels a second
    size: 1.1 + Math.random() * 1.5,
    sway: 1.5 + Math.random() * 3, // how far it drifts across the pipe
    rate: 1.5 + Math.random() * 2.5,
    phase: Math.random() * TAU,
  }));
}

function draw(pipe, t) {
  const { card, canvas } = pipe;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = `${card.offsetWidth}x${card.offsetHeight}@${dpr}`;
  if (size !== pipe.size || !pipe.layers) {
    const s = shapeOf(card);
    pipe.size = size;
    pipe.shape = s;
    pipe.path = loop(s);
    pipe.layers = { back: backLayer(s, dpr), front: frontLayer(s, dpr) };
    canvas.width = Math.ceil(s.cw * dpr);
    canvas.height = Math.ceil(s.ch * dpr);
    canvas.style.width = `${s.cw}px`;
    canvas.style.height = `${s.ch}px`;
    canvas.style.left = canvas.style.top = `${-(s.band + MARGIN)}px`;
  }
  const s = pipe.shape;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, s.cw, s.ch);
  ctx.drawImage(pipe.layers.back, 0, 0, s.cw, s.ch);

  // the fluid: a see-through body, a deeper core, and streaks and a current running round at
  // different speeds, so it reads as liquid on the move
  const c = pipe.rgb;
  const path = pipe.path;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  stroke(ctx, path, TUBE - 3, rgba(c, 0.4));
  stroke(ctx, path, TUBE - 9, rgba(mix(c, [0, 0, 0], 0.15), 0.35));
  const run = (width, style, dash, speed, cap = 'butt') => {
    ctx.lineCap = cap;
    ctx.setLineDash(dash);
    ctx.lineDashOffset = -t * speed;
    stroke(ctx, path, width, style);
  };
  // wide, soft swells of thicker and thinner fluid; layered so their edges overlap and blur
  run(TUBE - 6, rgba(mix(c, [0, 0, 0], 0.35), 0.22), [60, 44, 24, 70], 30);
  run(TUBE - 7, rgba(mix(c, [255, 255, 255], 0.4), 0.14), [30, 22, 14, 40], 46);
  run(TUBE - 10, rgba(mix(c, [255, 255, 255], 0.5), 0.16), [18, 34, 26, 30], 52);
  // a thin, fast current down the middle
  run(1.6, rgba(mix(c, [255, 255, 255], 0.75), 0.38), [3, 22, 12, 34], 74, 'round');
  ctx.setLineDash([]);

  // bubbles riding the flow, drifting from side to side
  const L = lengthOf(s);
  for (const b of pipe.bubbles) {
    const p = pointAt(s, b.at * L + b.speed * t);
    const off = Math.sin(t * b.rate + b.phase) * Math.min(b.sway, TUBE / 2 - 3.5);
    const bx = p.x + p.nx * off;
    const by = p.y + p.ny * off;
    ctx.beginPath();
    ctx.arc(bx, by, b.size, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(bx - b.size * 0.45, by - b.size * 0.45, 0.8, 0.8);
  }

  ctx.drawImage(pipe.layers.front, 0, 0, s.cw, s.ch);
}
