/** Sizes the canvas to the window (crisp on high-DPI screens) and keeps it sized on resize. */
export function setupCanvas(canvas) {
  const screen = {
    canvas,
    ctx: canvas.getContext('2d'),
    width: 0, // CSS pixels
    height: 0,
    dpr: 1,
  };

  const resize = () => {
    screen.dpr = Math.min(window.devicePixelRatio || 1, 2);
    screen.width = window.innerWidth;
    screen.height = window.innerHeight;
    canvas.width = Math.round(screen.width * screen.dpr);
    canvas.height = Math.round(screen.height * screen.dpr);
  };

  window.addEventListener('resize', resize);
  resize();
  return screen;
}
