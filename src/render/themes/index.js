import { createOpenBlueTheme } from './openblue.js';
import { createShallowsTheme } from './shallows.js';

/**
 * Each depth's look lives in its own theme. A theme provides:
 *   background                     base fill color
 *   shadows                        false if creatures shouldn't cast shadows (no seabed)
 *   update(dt, game)               advance its visual clock
 *   reset()                        clear per-run state
 *   omen(name, game)               play a scripted tease (from level events)
 *   drawFloor(ctx, camera, game)   world space, under entities
 *   drawOverlay(ctx, w, h, camera) screen space, over entities, under the HUD
 */
const FACTORIES = {
  shallows: createShallowsTheme,
  openblue: createOpenBlueTheme,
};

const cache = new Map();

export function getTheme(id) {
  if (!cache.has(id)) {
    const make = FACTORIES[id];
    if (!make) throw new Error(`Unknown theme "${id}"`);
    cache.set(id, make());
  }
  return cache.get(id);
}
