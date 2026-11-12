/**
 * A picture coming off the disk the way an interlaced frame did: every eighth row first,
 * then the rows between, down to every row. Until its own row arrives, a row shows a coarse
 * copy of the nearest row above it (eight pixels wide in the first pass, then four, two):
 * blurry to sharp, top to bottom, four times over.
 */
const PASSES = [
  { start: 0, step: 8, block: 8 },
  { start: 4, step: 8, block: 4 },
  { start: 2, step: 4, block: 2 },
  { start: 1, step: 2, block: 1 },
];
/** How fast rows arrive, and the pause (a drive seek) before each pass. */
export const ROWS_PER_SECOND = 64;
export const SEEK_MS = 300;
export class Loader {
  /** What the screen shows so far. */
  readonly pixels: Uint8Array;
  private order: Array<{ row: number; pass: number }> = [];
  private counts: number[] = [];
  /** Rows drawn so far, in arrival order. */
  shown = 0;
  constructor(
    private source: Uint8Array,
    private width: number,
    private height: number,
  ) {
    this.pixels = new Uint8Array(width * height);
    PASSES.forEach(({ start, step }, pass) => {
      let count = 0;
      for (let row = start; row < height; row += step, count++) this.order.push({ row, pass });
      this.counts.push(count);
    });
  }
  get done() {
    return this.shown === this.order.length;
  }
  /** Draws what has arrived after `elapsed` ms; returns the pass being read (4 when done). */
  advance(elapsed: number): number {
    const { rows, pass } = this.at(elapsed);
    for (; this.shown < rows; this.shown++) this.draw(this.order[this.shown]);
    return pass;
  }
  /** Rows arrived and the pass under way after `elapsed` ms. */
  private at(elapsed: number) {
    let left = elapsed;
    let rows = 0;
    for (let pass = 0; pass < PASSES.length; pass++) {
      left -= SEEK_MS;
      if (left < 0) return { rows, pass };
      const count = this.counts[pass];
      const arrived = Math.floor((left * ROWS_PER_SECOND) / 1000);
      if (arrived < count) return { rows: rows + arrived, pass };
      left -= (count * 1000) / ROWS_PER_SECOND;
      rows += count;
    }
    return { rows, pass: PASSES.length };
  }
  private draw({ row, pass }: { row: number; pass: number }) {
    const { block } = PASSES[pass];
    const { width } = this;
    for (let x = 0; x < width; x++) this.pixels[row * width + x] = this.source[row * width + x];
    for (let y = row + 1; y < Math.min(this.height, row + block); y++)
      for (let x = 0; x < width; x++)
        this.pixels[y * width + x] = this.source[row * width + x - (x % block)];
  }
}
