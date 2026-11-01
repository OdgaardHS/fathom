const FONT = '12px ui-monospace, "Cascadia Mono", Consolas, monospace';

/** Toggle with F3 (or start with ?debug in the URL). */
export function drawDebug(ctx, game, w, h) {
  const lines = [`FPS ${Math.round(game.fps)}`];
  if (game.player) {
    const s = game.spawner;
    lines.push(
      `enemies ${game.enemies.length}  allies ${game.allies.length}  shots ${game.projectiles.length}/${game.enemyShots.length}  hazards ${game.hazards.length}  pickups ${game.pickups.length}  particles ${game.effects.particles.length}`,
      `${game.level.id}  time ${game.time.toFixed(1)}s  spawn ${s.currentRate().toFixed(2)}/s  enemy hp x${s.hpMultiplier().toFixed(2)}  seed ${game.seed}`,
      `[L] level up  [K] kill all  [T] +30s  [C] trinket  [G] god mode: ${game.player.god ? 'ON' : 'off'}`,
    );
  }

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lineH = 16;
  const pad = 8;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const boxH = lines.length * lineH + pad * 2 - 4;
  const x = 10;
  const y = h - boxH - 10;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#9ef0a5';
  lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + i * lineH));
}
