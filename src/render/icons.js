import { TAU } from '../core/math.js';
import { drawDroneBody, drawEye, drawStarfish, spiralPath, star } from './sprites.js';

/**
 * Item icons: one small picture per weapon, passive and trinket, drawn with canvas shapes.
 * Each icon draws into a 32×32 box centred on (0, 0). The HUD draws them straight onto the
 * game canvas (drawItemIcon); HTML menus use them as images (itemIconURL).
 *
 * To add one: add a function under the item's id in WEAPON_ICONS, PASSIVE_ICONS or
 * TRINKET_ICONS. Items without a picture fall back to their two-letter `icon` text.
 */

const INK = 'rgba(6, 18, 26, 0.9)'; // outline color

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

/** Fill and outline the current path. */
function paint(ctx, fill, lineWidth = 1.5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Stroke the current path twice, dark then colored, so thin shapes read on any background. */
function outlinedStroke(ctx, color, width) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 2.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/** A simple side-view fish facing right (the Plus One augment, Pilot Fish). */
function fish(ctx, x, y, s, body, stripes = null) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  polygon(ctx, [[-7, 0], [-13, -6], [-12, 0], [-13, 6]]);
  paint(ctx, body, 1.4 / s);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU);
  paint(ctx, body, 1.4 / s);
  if (stripes) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = stripes;
    for (const sx of [-5.5, -1.5, 2.5]) ctx.fillRect(sx, -6, 2, 12);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4 / s;
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  circle(ctx, 4.5, -1.2, 1.9);
  ctx.fill();
  ctx.fillStyle = '#10202a';
  circle(ctx, 5, -1.2, 1);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ weapons

const WEAPON_ICONS = {
  harpoon(ctx) {
    ctx.rotate(-Math.PI / 4);
    // rope trailing off the tail
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.bezierCurveTo(-19, 5, -14, 8, -18, 12);
    ctx.strokeStyle = '#d8c9a3';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(8, 0);
    outlinedStroke(ctx, '#cfc8b4', 2.4);
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-17, -4.5);
    ctx.moveTo(-13, 0);
    ctx.lineTo(-17, 4.5);
    outlinedStroke(ctx, '#e46b5a', 2);
    polygon(ctx, [[17, 0], [5, -6.5], [8.5, 0], [5, 6.5]]);
    paint(ctx, '#eef3f7');
  },

  drones(ctx) {
    // a launch trail behind the drone
    ctx.strokeStyle = 'rgba(127, 249, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, 11);
    ctx.lineTo(-8, 5);
    ctx.moveTo(-11, 14);
    ctx.lineTo(-5, 9);
    ctx.stroke();
    ctx.rotate(-0.55);
    drawDroneBody(ctx, 12.5, 0.12, false);
  },

  darts(ctx) {
    ctx.rotate(-Math.PI / 4);
    for (const k of [-1, 0, 1]) {
      ctx.save();
      ctx.translate(k === 0 ? 3 : -2, k * 7);
      polygon(ctx, [[13, 0], [-6, -3.2], [-10, 0], [-6, 3.2]]);
      paint(ctx, '#c8f3ff', 1.3);
      ctx.restore();
    }
  },

  starfish(ctx) {
    ctx.strokeStyle = 'rgba(255, 159, 90, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, -0.3, 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 15, Math.PI - 0.3, Math.PI + 0.7);
    ctx.stroke();
    drawStarfish(ctx, 0, 0, 12.5, -Math.PI / 2, '#ff9f5a');
  },

  sonar(ctx) {
    const cx = -9;
    [7, 12, 17].forEach((radius, i) => {
      ctx.beginPath();
      ctx.arc(cx, 0, radius, -0.95, 0.95);
      ctx.strokeStyle = `rgba(127, 231, 255, ${1 - i * 0.25})`;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    });
    circle(ctx, cx, 0, 4);
    paint(ctx, '#7fe7ff');
  },

  eel(ctx) {
    // an electric eel in an S-curve, crackling at the head
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, 12);
    ctx.bezierCurveTo(-4, 14, -12, -2, -1, -1);
    ctx.bezierCurveTo(9, 0, 2, -12, 10, -11);
    outlinedStroke(ctx, '#3f8f7a', 6);
    ctx.beginPath();
    ctx.moveTo(-14, 12);
    ctx.bezierCurveTo(-4, 14, -12, -2, -1, -1);
    ctx.bezierCurveTo(9, 0, 2, -12, 10, -11);
    ctx.strokeStyle = 'rgba(200, 240, 170, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#10202a';
    circle(ctx, 10.5, -12, 1.2);
    ctx.fill();
    polygon(ctx, [[13, -6], [9, 0], [12.5, 0], [8, 8], [16, -1], [12.5, -1], [16, -6]]);
    paint(ctx, '#a5f3ff', 1.2);
  },

  ink(ctx) {
    // a squid jetting away from its ink cloud
    for (const [x, y, r] of [[-9, 8, 7], [-3, 11, 5.5], [-12, 1, 5]]) {
      circle(ctx, x, y, r);
      ctx.fillStyle = '#26123f';
      ctx.fill();
    }
    ctx.save();
    ctx.translate(4, -3);
    ctx.rotate(-0.75);
    ctx.strokeStyle = '#7a5cc2';
    ctx.lineWidth = 1.6;
    for (const k of [-3, -1, 1, 3]) {
      ctx.beginPath();
      ctx.moveTo(k, 6);
      ctx.quadraticCurveTo(k * 1.4, 11, k * 0.8 + Math.sign(k) * 1.5, 15);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.quadraticCurveTo(7, -6, 5, 7);
    ctx.lineTo(-5, 7);
    ctx.quadraticCurveTo(-7, -6, 0, -14);
    paint(ctx, '#9b7ae0');
    polygon(ctx, [[0, -14], [-6, -8], [6, -8]]);
    paint(ctx, '#b79cf0', 1.2);
    ctx.fillStyle = '#10202a';
    circle(ctx, -2, 3, 1.4);
    ctx.fill();
    circle(ctx, 2, 3, 1.4);
    ctx.fill();
    ctx.restore();
  },

  trident(ctx) {
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(5, 0);
    outlinedStroke(ctx, '#c9a46a', 2.6);
    ctx.beginPath();
    ctx.moveTo(5, -7);
    ctx.lineTo(5, 7);
    ctx.moveTo(5, -7);
    ctx.lineTo(13, -7);
    ctx.moveTo(5, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(5, 7);
    ctx.lineTo(13, 7);
    outlinedStroke(ctx, '#5fd4c4', 2.4);
    for (const [x, y] of [[13, -7], [16, 0], [13, 7]]) {
      polygon(ctx, [[x + 4, y], [x - 1, y - 3], [x - 1, y + 3]]);
      paint(ctx, '#c8f4ee', 1.1);
    }
  },

  bubbles(ctx) {
    // a big bubble with a little fish caught inside, and two small ones
    circle(ctx, -2, 3, 11.5);
    ctx.fillStyle = 'rgba(190, 240, 255, 0.25)';
    ctx.fill();
    fish(ctx, -2, 4, 0.55, '#ff9f5a');
    circle(ctx, -2, 3, 11.5);
    ctx.strokeStyle = '#bfefff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(-7, -3, 3, 1.6, -0.7, 0, TAU);
    ctx.fill();
    for (const [x, y, r] of [[11, -9, 4.5], [5, -14, 2.6]]) {
      circle(ctx, x, y, r);
      ctx.fillStyle = 'rgba(190, 240, 255, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#bfefff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  },

  lure(ctx) {
    // a dark anglerfish maw, its stalk curling up to a glowing bulb
    ctx.beginPath();
    ctx.moveTo(-15, 4);
    ctx.quadraticCurveTo(0, 22, 15, 4);
    ctx.quadraticCurveTo(0, 10, -15, 4);
    paint(ctx, '#1b2230');
    ctx.fillStyle = '#efeadb';
    for (let i = 0; i < 5; i++) {
      const x = -10 + i * 5;
      polygon(ctx, [[x - 1.6, 6.5 + Math.sin(((i + 0.5) / 5) * Math.PI) * 1.4], [x + 1.6, 6.5 + Math.sin(((i + 0.5) / 5) * Math.PI) * 1.4], [x, 1.5]]);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.bezierCurveTo(-6, -8, 6, -14, 8, -6);
    outlinedStroke(ctx, '#46546b', 1.6);
    ctx.fillStyle = 'rgba(216, 255, 138, 0.35)';
    circle(ctx, 8, -6, 7.5);
    ctx.fill();
    circle(ctx, 8, -6, 3.8);
    paint(ctx, '#d8ff8a', 1.2);
  },

  shrimp(ctx) {
    // a pistol shrimp's oversized claw, snapping a cavitation bubble
    ctx.save();
    ctx.translate(-4, 3);
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.ellipse(-2, 2, 10, 7, 0, 0, TAU);
    paint(ctx, '#ff8a70');
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.quadraticCurveTo(6, -12, 12, -3);
    ctx.lineTo(8, -1);
    ctx.quadraticCurveTo(4, -6, -1, -2);
    ctx.closePath();
    paint(ctx, '#ff6b52');
    ctx.beginPath();
    ctx.roundRect(-16, 0, 6, 5, 2);
    paint(ctx, '#e0664e', 1.2);
    ctx.restore();
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      ctx.beginPath();
      ctx.moveTo(11 + Math.cos(a) * 6, -6 + Math.sin(a) * 6);
      ctx.lineTo(11 + Math.cos(a) * 9.5, -6 + Math.sin(a) * 9.5);
      ctx.stroke();
    }
    circle(ctx, 11, -6, 3.6);
    paint(ctx, '#e8fbff', 1.2);
  },

  tendrils(ctx) {
    // a siphonophore: a gas float with long stinging tendrils
    ctx.strokeStyle = 'rgba(200, 225, 255, 0.9)';
    ctx.lineWidth = 1.5;
    const colors = ['#ff9ad5', '#9ad8ff', '#c5a3ff'];
    for (const [i, k] of [-1, 0, 1].entries()) {
      ctx.beginPath();
      ctx.moveTo(k * 5, -3);
      ctx.bezierCurveTo(k * 5 + 6, 3, k * 5 - 6, 8, k * 5 + 1, 15);
      ctx.stroke();
      ctx.fillStyle = colors[i];
      for (const t of [0.3, 0.6, 0.9]) {
        const x = k * 5 + (t < 0.5 ? 3 : t < 0.8 ? -2 : 0.6);
        circle(ctx, x, -3 + t * 18, 1.8);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.ellipse(0, -7, 12, 7, -0.15, 0, TAU);
    paint(ctx, 'rgba(170, 150, 255, 0.85)');
    ctx.beginPath();
    ctx.moveTo(-8, -11);
    ctx.quadraticCurveTo(0, -20, 8, -12);
    outlinedStroke(ctx, '#ff96d2', 1.8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(-4, -9, 3.5, 1.6, -0.3, 0, TAU);
    ctx.fill();
  },

  eye(ctx) {
    drawEye(ctx, 0, -4, 11, 0.6, 0.35, 1.1, 0);
  },
};

// ------------------------------------------------------------------ passives

const PASSIVE_ICONS = {
  might(ctx) {
    // a shark tooth with a red root
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.quadraticCurveTo(0, -14, 10, -9);
    ctx.quadraticCurveTo(6, 3, 0, 14);
    ctx.quadraticCurveTo(-6, 3, -10, -9);
    paint(ctx, '#f6f1e4');
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.quadraticCurveTo(0, -14, 10, -9);
    ctx.lineTo(8.6, -4.5);
    ctx.quadraticCurveTo(0, -8, -8.6, -4.5);
    ctx.closePath();
    paint(ctx, '#ff6b6b');
  },

  haste(ctx) {
    polygon(ctx, [[5, -15], [-9, 2], [-1, 2], [-5, 15], [10, -3], [2, -3], [7, -15]]);
    paint(ctx, '#ffd166');
  },

  vitality(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.bezierCurveTo(-17, 1, -12, -15, 0, -6);
    ctx.bezierCurveTo(12, -15, 17, 1, 0, 13);
    paint(ctx, '#ff8fab');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-6, -5, 2.6, 1.6, -0.6, 0, TAU);
    ctx.fill();
  },

  swiftness(ctx) {
    // a diving fin with speed lines
    ctx.strokeStyle = 'rgba(99, 230, 190, 0.6)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-15, -9);
    ctx.lineTo(-9, -9);
    ctx.moveTo(-16, 9);
    ctx.lineTo(-10, 9);
    ctx.stroke();
    ctx.rotate(-0.45);
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(13, -9);
    ctx.quadraticCurveTo(16, 0, 13, 9);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    paint(ctx, '#63e6be');
    ctx.strokeStyle = 'rgba(0, 70, 55, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.lineTo(12, -5.5);
    ctx.moveTo(-3, 2);
    ctx.lineTo(12, 5.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-14, -5, 9, 10, 3);
    paint(ctx, '#1f3b4d');
  },

  attractor(ctx) {
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(-8, 1);
    ctx.arc(0, 1, 8, Math.PI, 0, true);
    ctx.lineTo(8, -10);
    outlinedStroke(ctx, '#4dabf7', 5.5);
    for (const x of [-8, 8]) {
      ctx.beginPath();
      ctx.rect(x - 3.6, -15, 7.2, 5);
      paint(ctx, '#e9eef3', 1.3);
    }
  },

  reach(ctx) {
    // an inflated pufferfish
    ctx.strokeStyle = '#5f3dc4';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, 1 + Math.sin(a) * 10);
      ctx.lineTo(Math.cos(a) * 14.5, 1 + Math.sin(a) * 14.5);
      ctx.stroke();
    }
    circle(ctx, 0, 1, 10.5);
    paint(ctx, '#9775fa');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 7, 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    circle(ctx, 4.5, -2, 2.8);
    ctx.fill();
    ctx.fillStyle = '#10202a';
    circle(ctx, 5.2, -2, 1.4);
    ctx.fill();
  },

  recovery(ctx) {
    circle(ctx, 0, 0, 13.5);
    ctx.fillStyle = 'rgba(169, 227, 75, 0.16)';
    ctx.fill();
    ctx.strokeStyle = '#a9e34b';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-3.3, -9, 6.6, 18, 2);
    ctx.roundRect(-9, -3.3, 18, 6.6, 2);
    paint(ctx, '#a9e34b', 1.3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    circle(ctx, 8.5, -9.5, 1.8);
    ctx.fill();
    circle(ctx, 11.5, -5.5, 1.2);
    ctx.fill();
  },

  armor(ctx) {
    // a scallop shell
    ctx.beginPath();
    ctx.moveTo(-4, 11);
    ctx.lineTo(-14, -1);
    ctx.quadraticCurveTo(0, -21, 14, -1);
    ctx.lineTo(4, 11);
    ctx.closePath();
    paint(ctx, '#cfd5db');
    ctx.strokeStyle = 'rgba(60, 70, 80, 0.6)';
    ctx.lineWidth = 1.2;
    for (const x of [-10, -5, 0, 5, 10]) {
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(x, x === 0 ? -10 : -7 + Math.abs(x) * 0.25);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.roundRect(-7, 9, 14, 5, 1.5);
    paint(ctx, '#adb5bd', 1.3);
  },

  duplicator(ctx) {
    fish(ctx, -3, -5, 1, '#b768c9');
    fish(ctx, 3, 5, 1, '#e599f7');
  },

  persistence(ctx) {
    // an hourglass with blue sand
    ctx.beginPath();
    ctx.moveTo(-8, -11);
    ctx.lineTo(8, -11);
    ctx.lineTo(1.6, 0);
    ctx.lineTo(8, 11);
    ctx.lineTo(-8, 11);
    ctx.lineTo(-1.6, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200, 235, 255, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#d6eef2';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#74c0fc';
    polygon(ctx, [[-5, -7], [5, -7], [0.9, -1], [-0.9, -1]]);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-7, 11);
    ctx.quadraticCurveTo(0, 2, 7, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#74c0fc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 7);
    ctx.stroke();
    for (const y of [-14, 11]) {
      ctx.beginPath();
      ctx.roundRect(-11, y, 22, 3.2, 1);
      paint(ctx, '#9c7a45', 1.2);
    }
  },

  overdrive(ctx) {
    // a spinning propeller
    ctx.strokeStyle = 'rgba(255, 146, 43, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14.5, -0.5, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 14.5, Math.PI - 0.5, Math.PI + 0.8);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i / 3) * TAU - 0.3);
      ctx.beginPath();
      ctx.ellipse(0, -7, 4.2, 7.5, 0.25, 0, TAU);
      paint(ctx, '#ff922b', 1.3);
      ctx.restore();
    }
    circle(ctx, 0, 0, 3.6);
    paint(ctx, '#6b4416', 1.2);
  },

  insight(ctx) {
    // an open oyster with a glowing pearl
    ctx.beginPath();
    ctx.ellipse(-1, -5, 13, 5.5, -0.32, 0, TAU);
    paint(ctx, '#9fae8c');
    ctx.fillStyle = '#e9dde6';
    ctx.beginPath();
    ctx.ellipse(-1, -4.5, 10, 3.2, -0.32, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 8, 0, 0, Math.PI);
    ctx.closePath();
    paint(ctx, '#9fae8c');
    ctx.fillStyle = '#efe3ea';
    ctx.beginPath();
    ctx.ellipse(0, 4, 11, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(192, 235, 117, 0.45)';
    circle(ctx, 0, 2, 7.5);
    ctx.fill();
    circle(ctx, 0, 2, 4.6);
    paint(ctx, '#fbf8ff', 1.2);
    ctx.fillStyle = '#ffffff';
    circle(ctx, -1.4, 0.6, 1.4);
    ctx.fill();
  },
};

// ------------------------------------------------------------------ trinkets

const TRINKET_ICONS = {
  conductorCoil(ctx) {
    // a copper coil throwing a spark
    ctx.save();
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.moveTo(-15, 4);
    ctx.lineTo(-10, 4);
    ctx.moveTo(9, -4);
    ctx.lineTo(14, -4);
    outlinedStroke(ctx, '#b0b8bf', 1.6);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(-8 + i * 4, 0, 3, 8, 0, 0, TAU);
      outlinedStroke(ctx, '#d9822b', 2);
    }
    ctx.restore();
    star(ctx, 10, -10, 6, 2.2, 4, 0.3);
    paint(ctx, '#ffe066', 1.2);
  },

  pilotFish(ctx) {
    fish(ctx, 2, 0, 1.25, '#bfe3f7', '#1d3a52');
  },

  undertowStone(ctx) {
    ctx.beginPath();
    ctx.ellipse(0, 1, 13.5, 10.5, -0.15, 0, TAU);
    paint(ctx, '#6b86a8');
    spiralPath(ctx, 0, 1, 8.5, 2.25);
    ctx.strokeStyle = '#c4dafa';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-6, -5, 4, 2, -0.5, 0, TAU);
    ctx.fill();
  },

  splitCoral(ctx) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, 3);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-11, -13);
    ctx.moveTo(-8, -5);
    ctx.lineTo(-3, -12);
    ctx.moveTo(0, 3);
    ctx.lineTo(8, -3);
    ctx.lineTo(12, -11);
    ctx.moveTo(8, -3);
    ctx.lineTo(5, -12);
    outlinedStroke(ctx, '#ff7f8e', 4.2);
    ctx.fillStyle = '#ffc2ca';
    for (const [x, y] of [[-11, -13], [-3, -12], [12, -11], [5, -12]]) {
      circle(ctx, x, y, 1.6);
      ctx.fill();
    }
  },
};

const ICONS = { weapon: WEAPON_ICONS, passive: PASSIVE_ICONS, trinket: TRINKET_ICONS };

/** Whether an item has a picture. kind: 'weapon' | 'passive' | 'trinket'. */
export const hasItemIcon = (kind, id) => Boolean(ICONS[kind]?.[id]);

/** Draw an item's icon centred on (x, y), `size` pixels across. Returns false if it has none. */
export function drawItemIcon(ctx, kind, id, x, y, size) {
  const draw = ICONS[kind]?.[id];
  if (!draw) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  ctx.lineJoin = 'round';
  draw(ctx);
  ctx.restore();
  return true;
}

const urlCache = new Map();

/** The icon as an image URL for HTML (rendered once, then cached), or null if it has none. */
export function itemIconURL(kind, id, px = 96) {
  if (!hasItemIcon(kind, id)) return null;
  const key = `${kind}:${id}:${px}`;
  if (!urlCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    drawItemIcon(canvas.getContext('2d'), kind, id, px / 2, px / 2, px * 0.94);
    urlCache.set(key, canvas.toDataURL());
  }
  return urlCache.get(key);
}
