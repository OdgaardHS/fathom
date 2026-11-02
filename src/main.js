import { CONFIG } from './config.js';
import { setupCanvas } from './core/canvas.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Game } from './game.js';
import { installMetal } from './ui/metal.js';

installMetal(); // the brass portholes, studs, rust and kelp the menus and HUD are made of
// The HUD draws with the menus' fonts; ask for them now so the canvas has them (until then it uses a fallback).
for (const font of ['700 16px "Barlow Condensed"', '600 16px "Barlow Condensed"', '16px "Alfa Slab One"']) document.fonts?.load(font).catch(() => {});

const screen = setupCanvas(document.getElementById('game'));
const input = new Input();
const game = new Game({ screen, input, uiRoot: document.getElementById('ui') });

document.title = CONFIG.title;

startLoop({
  tickRate: CONFIG.tickRate,
  maxFrameTime: CONFIG.maxFrameTime,
  frame: (dt) => {
    game.frame(dt);
    input.endFrame();
  },
  tick: (dt) => game.tick(dt),
  render: (dt, alpha) => game.render(dt, alpha),
});

// Handy for poking at the game from the browser console, e.g. `game.player.hp = 999`.
window.game = game;
