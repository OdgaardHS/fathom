/**
 * Old-god teases that any depth can use.
 */

/** Two dark pulses at the screen edges, like a heartbeat felt through the water. `t` = seconds since it began. */
export function drawHeartbeat(ctx, w, h, t) {
  const beat = (center) => Math.max(0, 1 - Math.abs(t - center) / 0.22);
  const k = Math.max(beat(0.15), beat(0.6) * 0.8);
  if (k <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(40, 0, 10, 0)');
  g.addColorStop(1, `rgba(40, 0, 10, ${0.75 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
