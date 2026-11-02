import { TAU, clamp, createRng, lerp } from '../core/math.js';

/**
 * The diving-helmet look of the menus and the HUD: matte, hand-hammered copper and brass, brass
 * portholes (with bolts, and a grille for locked ones) and strands of kelp to hang off the plates.
 * Drawn once, at startup, in a bold, slightly exaggerated style with dark outlines.
 * The HTML menus get them as CSS variables (installMetal); the canvas HUD draws the canvases.
 */

const OUTLINE = '#2a1406';

/**
 * The finishes the metal is made in, each picked with a tester (see `hammered` for what the
 * numbers do; style.css's matte colors go with `shine: 0`):
 * - FINISH, the copper plates: matte, shallow hammer dents 9 to a 256px tile, a touch of patina,
 *   plenty of fine grain.
 * - BAND_FINISH, the brass band round every plate: not hammered, blotched with patina in big soft
 *   patches, and darker brass (`tone` below 0 darkens it, above 0 lightens it).
 * - PLAQUE_FINISH, the bronze plaques the text sits on: big, shallow dents.
 */
export const FINISH = { shine: 0, depth: 0.27, cells: 9, patina: 0.08, grain: 0.42 };
export const BAND_FINISH = { shine: 0, depth: 0, cells: 4, patina: 0.78, grain: 0.38, tone: -0.34 };
export const PLAQUE_FINISH = { shine: 0, depth: 0.21, cells: 3, patina: 0.08, grain: 0.42 };

let cache = null;

/** The sprites, as canvases. Built on first use. */
export function metal() {
  if (cache) return cache;
  const { shine } = FINISH;
  const surface = hammered(FINISH);
  const studded = studs(BAND_FINISH.shine);
  cache = {
    surface,
    bandSurface: hammered(BAND_FINISH),
    plaqueSurface: hammered(PLAQUE_FINISH),
    porthole: porthole(256, 8, 0.7, { shine, surface }),
    grille: porthole(256, 8, 0.7, { grille: true, shine, surface }),
    socket: porthole(128, 6, 0.6, { shine, surface }),
    boltRow: studded.boltRow,
    rust: studded.rust,
    screw: screw(),
    kelp: [kelp(11, 3), kelp(23, 2), kelp(37, 4)],
  };
  return cache;
}

const patterns = new WeakMap();

/**
 * A surface as a repeating fill for a canvas context (lay it on with 'overlay'): `which` is
 * 'surface' (the copper's hammering), 'bandSurface' or 'plaqueSurface'.
 */
export function surfacePattern(ctx, which = 'surface') {
  let made = patterns.get(ctx);
  if (!made) patterns.set(ctx, (made = {}));
  made[which] ??= ctx.createPattern(metal()[which], 'repeat');
  return made[which];
}

/**
 * Hand the sprites to the stylesheet: --surface, --band-surface, --plaque-surface, --porthole,
 * --grille, --socket, --bolt-row, --rust-l, --rust-r, --screw and --kelp-1 to --kelp-3.
 */
export function installMetal(root = document.documentElement) {
  const m = metal();
  const vars = { '--surface': m.surface, '--band-surface': m.bandSurface, '--plaque-surface': m.plaqueSurface, '--porthole': m.porthole, '--grille': m.grille, '--socket': m.socket, '--bolt-row': m.boltRow, '--rust-l': m.rust[0], '--rust-r': m.rust[1], '--screw': m.screw };
  m.kelp.forEach((k, i) => (vars[`--kelp-${i + 1}`] = k));
  for (const [name, canvas] of Object.entries(vars)) {
    canvas.toBlob((blob) => {
      if (blob) root.style.setProperty(name, `url(${URL.createObjectURL(blob)})`);
    });
  }
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------ brass

/** A color as [r, g, b], from '#rrggbb' (or already one). */
const rgbOf = (c) => (typeof c === 'string' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c);

/** Mix two colors: `t` 0 is `a`, 1 is `b`. */
const mix = (a, b, t) => rgbOf(a).map((v, i) => lerp(v, rgbOf(b)[i], t));

const css = (c) => `rgb(${rgbOf(c).map(Math.round).join(', ')})`;

/** Mix two '#rrggbb' colors into a CSS color: `t` 0 is `a`, 1 is `b`. */
function mixHex(a, b, t) {
  return css(mix(a, b, t));
}

/** Lighten (`tone` above 0) or darken (below 0) a color, like the band tester's brass slider. */
const toned = (c, tone) => (tone >= 0 ? mix(c, '#fffaeb', tone * 0.4) : mix(c, '#140c04', -tone * 0.5));

/**
 * Brass across a box, lit from the top left. `shine` 1 is polished; lower is duller. `tone`
 * darkens (below 0) or lightens (above 0) it.
 */
export function brassGradient(ctx, x0, y0, x1, y1, shine = FINISH.shine, tone = 0) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, css(toned(mix('#dcbd78', '#fff3c4', shine), tone)));
  g.addColorStop(0.22, css(toned(mix('#d6b062', '#f0cb72', shine), tone)));
  g.addColorStop(0.55, css(toned('#c99a40', tone)));
  g.addColorStop(0.8, css(toned('#8d6620', tone)));
  g.addColorStop(1, css(toned('#5e420f', tone)));
  return g;
}

/** The brass of a plate's band (BAND_FINISH), across a box. */
export function bandGradient(ctx, x0, y0, x1, y1) {
  return brassGradient(ctx, x0, y0, x1, y1, BAND_FINISH.shine, BAND_FINISH.tone);
}

/** A round brass stud: highlight, outline, a speck of shine (less of both when `shine` is low). */
export function bolt(ctx, x, y, r, outline = Math.max(1, r * 0.28), shine = FINISH.shine) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, mixHex('#e2c27a', '#fffbe2', shine));
  g.addColorStop(0.45, '#e9c46c');
  g.addColorStop(1, '#94691f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = outline;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * shine})`;
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.36, r * 0.22, 0, TAU);
  ctx.fill();
}

/**
 * A porthole's brass ring, `size` pixels across, with `bolts` bolts and an open middle (`hole` is
 * its share of the diameter); the glass behind it is up to whoever draws it. With `grille`, two
 * crossed bars cover the opening, like a diving helmet's face plate.
 */
function porthole(size, bolts, hole, { grille = false, shine = 1, surface = null } = {}) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = size / 2;
  const outer = r - size * 0.03;
  const inner = r * hole;
  const mid = (outer + inner) / 2;
  const band = outer - inner;
  const line = size * 0.022;

  ctx.beginPath();
  ctx.arc(r, r, outer, 0, TAU);
  ctx.arc(r, r, inner, 0, TAU, true);
  ctx.fillStyle = brassGradient(ctx, 0, 0, size, size, shine);
  ctx.fill();
  if (surface) {
    // hammer marks on the ring
    ctx.save();
    ctx.clip();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(surface, 'repeat');
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }
  // shine: a bright sweep across the top left, a dark one across the bottom right
  ctx.lineCap = 'round';
  ctx.lineWidth = band * 0.42;
  ctx.strokeStyle = `rgba(255, 252, 230, ${0.75 * shine})`;
  ctx.beginPath();
  ctx.arc(r, r, mid + band * 0.08, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
  ctx.lineWidth = band * 0.3;
  ctx.strokeStyle = 'rgba(60, 34, 4, 0.3)';
  ctx.beginPath();
  ctx.arc(r, r, mid, Math.PI * 0.1, Math.PI * 0.55);
  ctx.stroke();
  // the lip dropping down to the glass: dark at the top, lit at the bottom
  const lip = ctx.createLinearGradient(0, r - inner, 0, r + inner);
  lip.addColorStop(0, '#4a300a');
  lip.addColorStop(1, '#f6d98c');
  ctx.lineWidth = line * 2.4;
  ctx.strokeStyle = lip;
  ctx.beginPath();
  ctx.arc(r, r, inner + line * 1.2, 0, TAU);
  ctx.stroke();
  // outlines
  ctx.lineWidth = line;
  ctx.strokeStyle = OUTLINE;
  for (const rad of [outer, inner]) {
    ctx.beginPath();
    ctx.arc(r, r, rad, 0, TAU);
    ctx.stroke();
  }

  if (grille) {
    // two bars crossed over the opening, clipped to it
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, inner, 0, TAU);
    ctx.clip();
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(a);
      const w = size * 0.075;
      ctx.fillStyle = brassGradient(ctx, 0, -w, 0, w, shine);
      ctx.fillRect(-inner, -w / 2, inner * 2, w);
      ctx.lineWidth = line * 0.8;
      ctx.strokeStyle = OUTLINE;
      ctx.strokeRect(-inner - 2, -w / 2, inner * 2 + 4, w);
      ctx.restore();
    }
    ctx.restore();
    bolt(ctx, r, r, size * 0.05, line * 0.7, shine);
  }

  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * TAU + TAU / bolts / 2;
    bolt(ctx, r + Math.cos(a) * mid, r + Math.sin(a) * mid, band * 0.24, line * 0.7, shine);
  }
  return c;
}

// ------------------------------------------------ hammered metal

const TILE = 256;

/** Seamless value noise over a TILE x TILE tile: `cells` random lattice cells across, smoothly blended. */
function valueNoise(rand, cells) {
  const grid = Float32Array.from({ length: cells * cells }, () => rand());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / TILE) * cells;
    const fy = (y / TILE) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const at = (i, j) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
}

const wrap = (i, n) => ((i % n) + n) % n;

/**
 * Hand-hammered metal, as a seamless gray tile to lay over copper or brass with the 'overlay'
 * blend (mid gray changes nothing; lighter lifts, darker sinks):
 * - `cells`: hammer strikes across the tile (fewer = bigger dimples),
 * - `depth` 0-1: how deep they are (how strongly their sides catch the light),
 * - `patina` 0-1: darker, duller blotches, as old metal gets,
 * - `grain` 0-1: a fine speckle that takes away the plastic smoothness.
 * Every strike leaves a round dimple that fades out smoothly at its rim; where two overlap, the
 * deeper one wins and leaves a soft crease. Lit from the top left.
 */
function hammered({ cells = 8, depth = 0.4, patina = 0.25, grain = 0.2, seed = 1904 } = {}) {
  const rng = createRng(seed);
  const size = TILE / cells;
  // one strike per cell of a jittered grid, each a little bigger or deeper than the next
  const dents = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      dents.push({
        x: (i + rng.range(0.1, 0.9)) * size,
        y: (j + rng.range(0.1, 0.9)) * size,
        r: size * rng.range(0.75, 1.05),
        d: rng.range(0.7, 1.2),
      });
    }
  }
  const height = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const ci = Math.floor(x / size);
      const cj = Math.floor(y / size);
      let low = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          const dent = dents[wrap(j, cells) * cells + wrap(i, cells)];
          // across a wrapped edge, the strike's copy sits a whole tile away
          const dx = dent.x + (i - wrap(i, cells)) * size - x;
          const dy = dent.y + (j - wrap(j, cells)) * size - y;
          const t = (dx * dx + dy * dy) / (dent.r * dent.r);
          if (t >= 1) continue;
          const h = -(1 - t) * (1 - t) * dent.d; // a dimple: deepest in the middle, flat at the rim
          if (h < low) low = h;
        }
      }
      height[y * TILE + x] = low;
    }
  }
  const h = (x, y) => height[wrap(y, TILE) * TILE + wrap(x, TILE)];
  // light from the top left: the sides of a dimple that rise toward the bottom right face it
  const shade = new Float32Array(TILE * TILE);
  const strength = depth * size * 45;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) shade[y * TILE + x] = (h(x + 1, y) - h(x - 1, y) + (h(x, y + 1) - h(x, y - 1))) * strength;
  }
  const blotch = valueNoise(rng.next, 5);
  const blotch2 = valueNoise(rng.next, 11);
  const c = makeCanvas(TILE);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  const at = (x, y) => shade[wrap(y, TILE) * TILE + wrap(x, TILE)];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // a light blur, so the dimples look beaten rather than cut
      const soft = (at(x, y) * 4 + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 8;
      // matte metal: the lit sides only brighten a little, the shaded sides darken fully
      let v = 128 + (soft > 0 ? soft * 0.55 : soft);
      const b = blotch(x, y) * 0.65 + blotch2(x, y) * 0.35;
      v -= patina * 70 * clamp((b - 0.42) / 0.3, 0, 1);
      v += (rng.next() - 0.5) * grain * 46;
      v = clamp(v, 0, 255);
      const k = (y * TILE + x) * 4;
      img.data[k] = v;
      img.data[k + 1] = v;
      img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A slotted screw head, the kind that holds a bronze plaque on a statue: 8 css pixels across,
 * drawn at 2x, each slot at its own angle (four of them sit in a plaque's corners).
 */
function screw() {
  const S = 2;
  const size = 8 * S;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = size / 2 - 1;
  const g = ctx.createRadialGradient(r * 0.75, r * 0.7, 0.5, size / 2, size / 2, r);
  g.addColorStop(0, '#d9bb7a');
  g.addColorStop(0.55, '#a8823c');
  g.addColorStop(1, '#5e4214');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // the slot
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(42, 20, 6, 0.9)';
  ctx.fillRect(-r * 0.75, -0.9, r * 1.5, 1.8);
  ctx.fillStyle = 'rgba(255, 236, 190, 0.35)';
  ctx.fillRect(-r * 0.75, 0.9, r * 1.5, 0.7);
  ctx.restore();
  return c;
}

// ------------------------------------------------ the studs along a plate's brass band

// Plates have a brass band BAND css pixels wide, studded every BOLT_GAP pixels (see style.css).
export const BAND = 12;
const BOLT_GAP = 64;
const BOLT_R = 4.4;

/** One stud in the middle of a BOLT_GAP x BAND tile, drawn at 2x. Repeated along a band. */
function boltRow(shine = 1) {
  const c = makeCanvas(BOLT_GAP * 2, BAND * 2);
  bolt(c.getContext('2d'), BOLT_GAP, BAND, BOLT_R * 2, 1.4, shine);
  return c;
}

/** The band's studs and rusty corner screws at a given `shine` (see bolt). */
function studs(shine = 1) {
  return { boltRow: boltRow(shine), rust: [rustyBolt(false, shine), rustyBolt(true, shine)] };
}

/**
 * The bottom row's first (or, `right`, last) stud with rust bleeding out round it and a drip
 * running off the plate's edge. 40 x 40 css pixels at 2x: the stud sits at x 20 in the middle of
 * the band, the plate's bottom edge at y 30, the drip hangs below that.
 */
function rustyBolt(right, shine = 1) {
  const S = 2;
  const c = makeCanvas(40 * S);
  const ctx = c.getContext('2d');
  const x = 20 * S;
  const y = (30 - BAND / 2) * S;
  const lean = right ? -1 : 1; // the stain spreads in from the corner
  const halo = ctx.createRadialGradient(x + lean * 3 * S, y, 1 * S, x + lean * 3 * S, y, 15 * S);
  halo.addColorStop(0, 'rgba(150, 62, 20, 0.85)');
  halo.addColorStop(0.55, 'rgba(150, 62, 20, 0.35)');
  halo.addColorStop(1, 'rgba(150, 62, 20, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(x + lean * 3 * S, y, 15 * S, 9 * S, 0, 0, TAU);
  ctx.fill();
  // the drip: a tapering streak over the edge, ending in a drop
  ctx.beginPath();
  ctx.moveTo(x - 2.2 * S, y);
  ctx.quadraticCurveTo(x - 1.6 * S, y + 8 * S, x - 1.2 * S, y + 10.5 * S);
  ctx.arc(x, y + 11.5 * S, 2.3 * S, Math.PI * 0.85, Math.PI * 0.15, true);
  ctx.quadraticCurveTo(x + 1.6 * S, y + 8 * S, x + 2.2 * S, y);
  ctx.closePath();
  const drip = ctx.createLinearGradient(0, y, 0, y + 14 * S);
  drip.addColorStop(0, '#b65a24');
  drip.addColorStop(1, '#7a3412');
  ctx.fillStyle = drip;
  ctx.fill();
  ctx.lineWidth = 1.2 * S;
  ctx.strokeStyle = 'rgba(58, 20, 6, 0.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 200, 150, 0.6)';
  ctx.beginPath();
  ctx.arc(x - 0.8 * S, y + 11 * S, 0.7 * S, 0, TAU);
  ctx.fill();
  bolt(ctx, x, y, BOLT_R * S, 1.4, shine);
  // a fleck of rust on the stud itself
  ctx.fillStyle = 'rgba(160, 70, 24, 0.75)';
  ctx.beginPath();
  ctx.arc(x + lean * 1.4 * S, y + 1.2 * S, 1.3 * S, 0, TAU);
  ctx.fill();
  return c;
}

// ------------------------------------------------ kelp

/**
 * A clump of kelp hanging down, as if draped over the top edge of a plate: `blades` long ribbons
 * with ruffled edges, a pale midrib and a float or two. Drawn at 2x for 80 x 180 CSS pixels.
 */
function kelp(seed, blades) {
  const S = 2;
  const W = 80 * S;
  const H = 180 * S;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = createRng(seed);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const list = Array.from({ length: blades }, (_, i) => ({
    x: W * lerp(0.28, 0.72, (i + 0.5) / blades) + rng.range(-5, 5) * S,
    len: H * rng.range(0.55, 0.95),
    width: W * rng.range(0.3, 0.4),
    sway: rng.range(-1, 1) * W * 0.12,
    waves: rng.range(1.2, 2.2),
    phase: rng.range(0, TAU),
    shade: rng.range(0, 1),
  }));
  list.sort((a, b) => b.len - a.len); // longest at the back

  for (const b of list) {
    const steps = 40;
    const centre = (t) => [b.x + b.sway * Math.sin(t * Math.PI * 0.9) + Math.sin(t * b.waves * TAU + b.phase) * W * 0.04, 4 * S + b.len * t];
    // narrow where it hangs from, widest past the middle, then a rounded tip
    const half = (t) => (b.width / 2) * Math.min(1, t * 4 + 0.15) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 3)));
    const left = [];
    const right = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y] = centre(t);
      const ruffle = Math.sin(t * 46 + b.phase) * b.width * 0.06 * t;
      left.push([x - half(t) - ruffle, y]);
      right.push([x + half(t) + ruffle, y]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(b.x - b.width, 0, b.x + b.width, 0);
    g.addColorStop(0, b.shade > 0.5 ? '#8cc455' : '#78b04a');
    g.addColorStop(0.55, '#4f8f36');
    g.addColorStop(1, '#2f6526');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.6 * S;
    ctx.strokeStyle = '#13290c';
    ctx.stroke();
    // the pale midrib
    ctx.beginPath();
    for (let i = 2; i <= steps - 3; i++) {
      const [x, y] = centre(i / steps);
      if (i === 2) ctx.moveTo(x - b.width * 0.08, y);
      else ctx.lineTo(x - b.width * 0.08, y);
    }
    ctx.lineWidth = 1.6 * S;
    ctx.strokeStyle = 'rgba(214, 240, 160, 0.55)';
    ctx.stroke();
  }

  // the stalk, curled over the edge, and a float or two
  ctx.beginPath();
  ctx.moveTo(W * 0.3, 9 * S);
  ctx.bezierCurveTo(W * 0.32, 0, W * 0.62, -1 * S, W * 0.7, 8 * S);
  ctx.lineWidth = 8 * S;
  ctx.strokeStyle = '#13290c';
  ctx.stroke();
  ctx.lineWidth = 4.5 * S;
  ctx.strokeStyle = '#5c9a3c';
  ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const x = W * rng.range(0.25, 0.75);
    const y = rng.range(12, 30) * S;
    const r = rng.range(5, 7) * S;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#e9f2a2');
    g.addColorStop(0.5, '#a8bf4e');
    g.addColorStop(1, '#5d7a26');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.15, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.2 * S;
    ctx.strokeStyle = '#13290c';
    ctx.stroke();
  }
  return c;
}
