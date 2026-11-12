import { blank, type TerminalCell } from '../terminal/TerminalBuffer';
export type Attr = Partial<
  Pick<TerminalCell, 'intensity' | 'palette' | 'inverse' | 'underline' | 'blink'>
>;
export interface Cursor {
  x: number;
  y: number;
  shape: 'block' | 'underline';
}
const frames = {
  single: '┌┐└┘─│',
  double: '╔╗╚╝═║',
  /** Double top and bottom with single sides, as full-screen programs drew their panels. */
  mixed: '╒╕╘╛═│',
} as const;
/**
 * A picture shown under the text, as a frame grabber put one on the screen: four levels of
 * the phosphor (black, dim, normal, bright), painted on the 720x400 text raster.
 */
export interface Picture {
  /** One level (0-3) per pixel, row by row. */
  pixels: Uint8Array;
  width: number;
  height: number;
  /** Top-left corner on the raster, and raster pixels per picture pixel. */
  x: number;
  y: number;
  scale: number;
  /** A red frame around something the player should look at, in picture pixels. */
  box?: { x: number; y: number; width: number; height: number } | null;
}
/** The fine text's cells, in raster pixels: VGA's denser text mode, half the page's size. */
export const FINE_CELL = { width: 5, height: 8 };
/**
 * Text in a finer grid than the page's own (the faces: cells of 5 x 8 raster pixels), drawn
 * over the page like a second, denser text mode.
 */
export interface FineText {
  /** Top-left corner on the raster, in pixels. */
  x: number;
  y: number;
  columns: number;
  rows: number;
  /** One character per cell, row by row; a space for none. */
  chars: string[];
  /** The brightness of each cell: 0 dim, 1 normal, 2 bright. */
  levels: Uint8Array;
}
/** A directly addressed 80x25 text-mode page for full-screen programs. */
export class Screen {
  readonly columns = 80;
  readonly rows = 25;
  cells: TerminalCell[] = Array.from({ length: 2000 }, blank);
  cursor: Cursor | null = null;
  /** Drawn under the cells; text over it gets a black backing so it stays readable. */
  picture: Picture | null = null;
  /** Drawn over the cells: the face, in fine text. */
  fine: FineText | null = null;
  clear(attr: Attr = {}) {
    for (let n = 0; n < 2000; n++) this.cells[n] = { ...blank(), ...attr };
    this.cursor = null;
  }
  /** Writes text on one row, clipped to the page. */
  put(x: number, y: number, text: string, attr: Attr = {}) {
    if (y < 0 || y >= 25) return;
    let column = x;
    for (const char of text) {
      if (column >= 80) break;
      if (column >= 0) this.cells[y * 80 + column] = { ...blank(), ...attr, char };
      column++;
    }
  }
  fill(x: number, y: number, width: number, height: number, char = ' ', attr: Attr = {}) {
    for (let row = y; row < y + height; row++)
      this.put(x, row, char.repeat(Math.max(0, width)), attr);
  }
  /** Draws a frame and clears its interior, fine text included. */
  box(
    x: number,
    y: number,
    width: number,
    height: number,
    style: keyof typeof frames = 'single',
    attr: Attr = {},
  ) {
    const [tl, tr, bl, br, h, v] = frames[style];
    this.uncover(x, y, width, height);
    this.put(x, y, tl + h.repeat(width - 2) + tr, attr);
    for (let row = y + 1; row < y + height - 1; row++)
      this.put(x, row, v + ' '.repeat(width - 2) + v, attr);
    this.put(x, y + height - 1, bl + h.repeat(width - 2) + br, attr);
  }
  /** Takes the fine text off a block of page cells, so a box drawn there shows. */
  uncover(x: number, y: number, width: number, height: number) {
    const fine = this.fine;
    if (!fine) return;
    for (let row = 0; row < fine.rows; row++) {
      const top = fine.y + row * FINE_CELL.height;
      if (top + FINE_CELL.height <= y * 16 || top >= (y + height) * 16) continue;
      for (let column = 0; column < fine.columns; column++) {
        const left = fine.x + column * FINE_CELL.width;
        if (left + FINE_CELL.width <= x * 9 || left >= (x + width) * 9) continue;
        fine.chars[row * fine.columns + column] = ' ';
      }
    }
  }
  /** Copies another page of cells, such as the shell's scrolling console. */
  copy(cells: readonly TerminalCell[]) {
    for (let n = 0; n < 2000; n++) this.cells[n] = cells[n];
  }
  get text() {
    return Array.from({ length: 25 }, (_, row) =>
      this.cells
        .slice(row * 80, row * 80 + 80)
        .map((c) => c.char)
        .join('')
        .trimEnd(),
    ).join('\n');
  }
}
