/**
 * Fixed-timestep game loop.
 *
 * - `frame(dt)` runs once per display frame, before simulation. Use it for menu/input handling.
 * - `tick(step)` runs at exactly `tickRate` per second, so gameplay is identical on 60 Hz and 144 Hz screens.
 * - `render(dt, alpha)` draws. `alpha` (0..1) is how far we are between the last two ticks,
 *   used to interpolate positions so motion stays smooth.
 */
export function startLoop({ tickRate, maxFrameTime, frame, tick, render }) {
  const step = 1 / tickRate;
  let last = performance.now();
  let accumulator = 0;

  function onFrame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > maxFrameTime) dt = maxFrameTime;

    frame(dt);

    accumulator += dt;
    while (accumulator >= step) {
      tick(step);
      accumulator -= step;
    }

    render(dt, accumulator / step);
    requestAnimationFrame(onFrame);
  }

  requestAnimationFrame(onFrame);
}
