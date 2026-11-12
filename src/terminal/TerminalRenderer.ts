import type { TerminalCell } from './TerminalBuffer';
import type { Cursor, FineText, Picture } from '../screen/Screen';
import { FINE_CELL, GlyphAtlas, GLYPH_SCALE } from './GlyphAtlas';
/** The phosphor at the picture's four levels: off, dim, normal and bright. */
const PICTURE_LEVELS = [
  [0x00, 0x00, 0x00],
  [0x9a, 0x5a, 0x18],
  [0xf2, 0xa2, 0x3a],
  [0xff, 0xd2, 0x7a],
];
export class TerminalRenderer {
  plane = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private revision = '';
  /** The picture at its own resolution, before it is scaled onto the plane. */
  private frame = document.createElement('canvas');
  constructor(private atlas: GlyphAtlas) {
    // Drawing stays in 720x400 logical units; the plane itself is supersampled.
    this.plane.width = 720 * GLYPH_SCALE;
    this.plane.height = 400 * GLYPH_SCALE;
    this.context = this.plane.getContext('2d')!;
    this.context.setTransform(GLYPH_SCALE, 0, 0, GLYPH_SCALE, 0, 0);
    this.context.imageSmoothingEnabled = false;
  }
  /**
   * Draws a page of cells, over a picture if the page has one. `key` identifies the page's
   * content; nothing is redrawn while it and the blink phase stay the same.
   */
  draw(
    cells: readonly TerminalCell[],
    cursor: Cursor | null,
    blink: boolean,
    key: string,
    picture: Picture | null = null,
    fine: FineText | null = null,
  ) {
    const revision = key + '|' + blink;
    if (revision === this.revision) return false;
    this.revision = revision;
    const ctx = this.context;
    ctx.clearRect(0, 0, 720, 400);
    if (picture) this.paint(picture);
    const over = (x: number, y: number) =>
      !!picture &&
      x + 9 > picture.x &&
      x < picture.x + picture.width * picture.scale &&
      y + 16 > picture.y &&
      y < picture.y + picture.height * picture.scale;
    for (let n = 0; n < 2000; n++) {
      const cell = cells[n];
      if ((cell.char !== ' ' || cell.inverse || cell.underline) && (!cell.blink || blink)) {
        const x = (n % 80) * 9;
        const y = Math.floor(n / 80) * 16;
        // Text laid over a picture gets a black backing, like a camera's burned-in stamp.
        if (over(x, y)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(x, y, 9, 16);
        }
        this.atlas.draw(
          ctx,
          cell.char,
          x,
          y,
          cell.palette === 'red' ? 3 : cell.intensity,
          cell.inverse,
          cell.underline,
        );
      }
    }
    if (fine)
      for (let row = 0; row < fine.rows; row++)
        for (let column = 0; column < fine.columns; column++) {
          const n = row * fine.columns + column;
          const char = fine.chars[n];
          if (!char || char === ' ') continue;
          this.atlas.fine.draw(
            ctx,
            char,
            fine.x + column * FINE_CELL.width,
            fine.y + row * FINE_CELL.height,
            fine.levels[n],
          );
        }
    if (picture?.box) {
      const { x, y, width, height } = picture.box;
      const s = picture.scale;
      ctx.strokeStyle = '#F23A2E';
      ctx.lineWidth = s;
      ctx.strokeRect(
        picture.x + x * s + s / 2,
        picture.y + y * s + s / 2,
        width * s - s,
        height * s - s,
      );
    }
    if (cursor && blink) {
      ctx.fillStyle = '#F2A23A';
      if (cursor.shape === 'block') ctx.fillRect(cursor.x * 9, cursor.y * 16 + 1, 8, 14);
      else ctx.fillRect(cursor.x * 9, cursor.y * 16 + 13, 8, 2);
    }
    return true;
  }
  /** Paints the picture's pixels at its scale, square and unsmoothed. */
  private paint(picture: Picture) {
    const { width, height, pixels } = picture;
    if (this.frame.width !== width || this.frame.height !== height) {
      this.frame.width = width;
      this.frame.height = height;
    }
    const frame = this.frame.getContext('2d')!;
    const image = frame.createImageData(width, height);
    for (let n = 0; n < width * height; n++) {
      const [r, g, b] = PICTURE_LEVELS[pixels[n] & 3];
      image.data[n * 4] = r;
      image.data[n * 4 + 1] = g;
      image.data[n * 4 + 2] = b;
      image.data[n * 4 + 3] = 255;
    }
    frame.putImageData(image, 0, 0);
    this.context.drawImage(
      this.frame,
      picture.x,
      picture.y,
      width * picture.scale,
      height * picture.scale,
    );
  }
}
