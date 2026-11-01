/**
 * Spatial hash for fast "what's near this point?" questions.
 * Rebuilt every tick from enemy positions. Turns collision checks from
 * O(enemies × things) into roughly O(things).
 */
export class SpatialGrid {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.used = [];
  }

  key(cx, cy) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear() {
    for (const cell of this.used) cell.length = 0;
    this.used.length = 0;
    // Cells pile up as the player travels; drop them all now and then.
    if (this.cells.size > 4096) this.cells.clear();
  }

  insert(item) {
    const k = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    if (cell.length === 0) this.used.push(cell);
    cell.push(item);
  }

  /**
   * Collects items whose cell overlaps the square around (x, y). Results are candidates:
   * callers still do an exact distance check. Fills and returns `out`.
   */
  query(x, y, radius, out = []) {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const y0 = Math.floor((y - radius) / cs);
    const y1 = Math.floor((y + radius) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const item of cell) out.push(item);
      }
    }
    return out;
  }
}
