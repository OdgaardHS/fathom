import { CONFIG } from './config.js';
import { setupCanvas } from './core/canvas.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Game } from './game.js';

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
