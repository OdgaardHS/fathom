// Keys whose default browser action (scrolling, find-in-page) we don't want during play.
const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F3']);

/**
 * Keyboard state. Uses `event.code` (physical key position), so WASD also works
 * on AZERTY and other layouts.
 */
export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set(); // keys pressed since the last frame

    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    // Avoid "stuck" keys when the window loses focus mid-press.
    window.addEventListener('blur', () => this.held.clear());
  }

  isDown(...codes) {
    return codes.some((c) => this.held.has(c));
  }

  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Movement direction from WASD / arrows, normalized so diagonals aren't faster. */
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyW', 'ArrowUp')) y -= 1;
    if (this.isDown('KeyS', 'ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /** Call once per frame after input has been handled. */
  endFrame() {
    this.pressed.clear();
  }
}
