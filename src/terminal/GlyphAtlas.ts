import fontUrl from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url';
import { FINE_CELL } from '../screen/Screen';
// Glyphs are rasterized above the 720x400 logical resolution so the CRT pass can
// resolve smooth phosphor strokes instead of stretching hard-edged pixels.
export const GLYPH_SCALE = 2;
const cell = { width: 9 * GLYPH_SCALE, height: 16 * GLYPH_SCALE };
/** Glyphs per row of the atlas sheet. */
const PER_ROW = 32;
/** Line-drawing arms (up, right, down, left): 0 none, 1 single, 2 double. */
const lines: Record<string, readonly [number, number, number, number]> = {
  '─': [0, 1, 0, 1],
  '│': [1, 0, 1, 0],
  '┌': [0, 1, 1, 0],
  '┐': [0, 0, 1, 1],
  '└': [1, 1, 0, 0],
  '┘': [1, 0, 0, 1],
  '├': [1, 1, 1, 0],
  '┤': [1, 0, 1, 1],
  '┬': [0, 1, 1, 1],
  '┴': [1, 1, 0, 1],
  '┼': [1, 1, 1, 1],
  '═': [0, 2, 0, 2],
  '║': [2, 0, 2, 0],
  '╔': [0, 2, 2, 0],
  '╗': [0, 0, 2, 2],
  '╚': [2, 2, 0, 0],
  '╝': [2, 0, 0, 2],
  '╠': [2, 2, 2, 0],
  '╣': [2, 0, 2, 2],
  '╦': [0, 2, 2, 2],
  '╩': [2, 2, 0, 2],
  '╬': [2, 2, 2, 2],
  '╒': [0, 2, 1, 0],
  '╕': [0, 0, 1, 2],
  '╘': [1, 2, 0, 0],
  '╛': [1, 0, 0, 2],
  '╞': [1, 2, 1, 0],
  '╡': [1, 0, 1, 2],
  '╤': [0, 2, 1, 2],
  '╧': [1, 2, 0, 2],
  '╪': [1, 2, 1, 2],
  '╓': [0, 1, 2, 0],
  '╖': [0, 0, 2, 1],
  '╙': [2, 1, 0, 0],
  '╜': [2, 0, 0, 1],
  '╟': [2, 1, 2, 0],
  '╢': [2, 0, 2, 1],
  '╥': [0, 1, 2, 1],
  '╨': [2, 1, 0, 1],
  '╫': [2, 1, 2, 1],
};
// VGA light shade leaves the ninth column blank, which gives shaded areas their stripes.
const lightShade = (x: number, y: number) => x < 8 && x % 4 === (y % 2 ? 0 : 2);
const triangle = (x: number, y: number, dir: 'up' | 'down' | 'left' | 'right') => {
  if (dir === 'up' || dir === 'down') {
    const row = dir === 'up' ? y - 4 : 11 - y;
    return row >= 0 && row < 7 && Math.abs(x - 3.5) <= row * 0.55 + 0.5;
  }
  const column = dir === 'right' ? x - 1 : 6 - x;
  return column >= 0 && column < 6 && Math.abs(y - 7.5) <= (6 - column) * 0.9;
};
const arrow = (x: number, y: number, dir: 'up' | 'down' | 'left' | 'right') => {
  if (dir === 'up' || dir === 'down') {
    const head = dir === 'up' ? y - 3 : 12 - y;
    return (x === 3 && y >= 3 && y <= 12) || (head >= 0 && head < 3 && Math.abs(x - 3) === head);
  }
  const head = dir === 'left' ? x - 1 : 7 - x;
  return (y === 8 && x >= 1 && x <= 7) || (head >= 0 && head < 3 && Math.abs(y - 8) === head);
};
/** Characters drawn from pixel rules on the 9x16 cell rather than from the font. */
const shapes: Record<string, (x: number, y: number) => boolean> = {
  '█': () => true,
  '▀': (_x, y) => y < 8,
  '▄': (_x, y) => y >= 8,
  '▌': (x) => x < 4,
  '▐': (x) => x >= 4,
  '░': lightShade,
  '▒': (x, y) => x < 8 && (x + y) % 2 === 1,
  '▓': (x, y) => x < 8 && !lightShade(x, y),
  '■': (x, y) => x >= 1 && x <= 6 && y >= 5 && y <= 10,
  '•': (x, y) => (x - 3.5) ** 2 + (y - 7.5) ** 2 <= 4,
  '▲': (x, y) => triangle(x, y, 'up'),
  '▼': (x, y) => triangle(x, y, 'down'),
  '►': (x, y) => triangle(x, y, 'right'),
  '◄': (x, y) => triangle(x, y, 'left'),
  '↑': (x, y) => arrow(x, y, 'up'),
  '↓': (x, y) => arrow(x, y, 'down'),
  '→': (x, y) => arrow(x, y, 'right'),
  '←': (x, y) => arrow(x, y, 'left'),
};
/** Lights the pixels of a line-drawing character, joining neighbours across the ninth column. */
function linePixels(
  [up, right, down, left]: readonly number[],
  set: (x: number, y: number) => void,
) {
  const vertical = Math.max(up, down),
    horizontal = Math.max(left, right);
  const xs = vertical === 2 ? [3, 5] : vertical ? [4] : [];
  const ys = horizontal === 2 ? [7, 9] : horizontal ? [8] : [];
  for (const y of ys) {
    const from = left ? 0 : horizontal === 2 ? Math.min(...xs, 4) : Math.max(...xs, 4);
    const to = right ? 8 : horizontal === 2 ? Math.max(...xs, 4) : Math.min(...xs, 4);
    for (let x = from; x <= to; x++) {
      // Double lines meeting a double arm leave a gap for the arm's inner line.
      const crossing = vertical === 2 && x === 4 && ((y === 7 && up) || (y === 9 && down));
      if (!crossing) set(x, y);
    }
  }
  for (const x of xs) {
    const from = up ? 0 : vertical === 2 ? Math.min(...ys, 8) : Math.max(...ys, 8);
    const to = down ? 15 : vertical === 2 ? Math.max(...ys, 8) : Math.min(...ys, 8);
    for (let y = from; y <= to; y++) {
      const crossing = horizontal === 2 && y === 8 && ((x === 3 && left) || (x === 5 && right));
      if (!crossing) set(x, y);
    }
  }
}
/** Printable ASCII, a few Latin-1 signs the font carries, then the drawn characters. */
const charset = [
  ...Array.from({ length: 95 }, (_, n) => String.fromCharCode(32 + n)),
  ...'·±°÷½¼«»',
  ...Object.keys(lines),
  ...Object.keys(shapes),
];
const index = new Map(charset.map((char, n) => [char, n]));
const fallback = index.get('?')!;
/** Characters the terminal can display; anything else is shown as "?". */
export const displayable = (char: string) => index.has(char);
export class GlyphAtlas {
  sheets: HTMLCanvasElement[] = [];
  /** The faces' fine text. */
  fine!: FineAtlas;
  async initialize() {
    const font = new FontFace('TerminalGlyph', `url(${fontUrl})`);
    await font.load();
    document.fonts.add(font);
    this.fine = new FineAtlas();
    const source = document.createElement('canvas');
    source.width = PER_ROW * cell.width;
    source.height = Math.ceil(charset.length / PER_ROW) * cell.height;
    const ctx = source.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.font = `${20 * GLYPH_SCALE}px TerminalGlyph`;
    ctx.textBaseline = 'alphabetic';
    const drawn = new Set<number>();
    charset.forEach((char, n) => {
      const left = (n % PER_ROW) * cell.width,
        top = Math.floor(n / PER_ROW) * cell.height;
      const set = (x: number, y: number) =>
        ctx.fillRect(left + x * GLYPH_SCALE, top + y * GLYPH_SCALE, GLYPH_SCALE, GLYPH_SCALE);
      const shape = shapes[char];
      if (lines[char]) linePixels(lines[char], set);
      else if (shape) {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 9; x++) if (shape(x, y)) set(x, y);
      } else {
        ctx.fillText(char, left, top + 13 * GLYPH_SCALE, 8 * GLYPH_SCALE);
        return;
      }
      drawn.add(n);
    });
    const original = ctx.getImageData(0, 0, source.width, source.height);
    for (const [r, g, b] of [
      [154, 90, 24],
      [242, 162, 58],
      [255, 210, 122],
      [242, 58, 46],
    ]) {
      const sheet = document.createElement('canvas');
      sheet.width = source.width;
      sheet.height = source.height;
      const pixels = new ImageData(
        new Uint8ClampedArray(original.data),
        source.width,
        source.height,
      );
      for (let n = 0; n < pixels.data.length; n += 4) {
        const pixel = n / 4,
          glyph =
            Math.floor(pixel / source.width / cell.height) * PER_ROW +
            Math.floor((pixel % source.width) / cell.width);
        // VT323 outlines never land on the pixel grid; keep their edges but firm up
        // partial coverage so strokes read as solid beam traces rather than blur.
        // Drawn characters are already exact.
        const t = drawn.has(glyph)
          ? pixels.data[n + 3] / 255
          : Math.max(0, Math.min(1, (pixels.data[n + 3] - 32) / 176));
        pixels.data[n] = r;
        pixels.data[n + 1] = g;
        pixels.data[n + 2] = b;
        pixels.data[n + 3] = Math.round(t * t * (3 - 2 * t) * 255);
      }
      sheet.getContext('2d')!.putImageData(pixels, 0, 0);
      this.sheets.push(sheet);
    }
  }
  /** Draws one cell in logical 9x16 units; the target context carries the GLYPH_SCALE transform. */
  draw(
    ctx: CanvasRenderingContext2D,
    char: string,
    x: number,
    y: number,
    color = 1,
    inverse = false,
    underline = false,
  ) {
    const n = index.get(char) ?? fallback;
    const fill = color === 3 ? '#F23A2E' : ['#9A5A18', '#F2A23A', '#FFD27A'][color];
    if (inverse) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, 9, 16);
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.drawImage(
      this.sheets[color],
      (n % PER_ROW) * cell.width,
      Math.floor(n / PER_ROW) * cell.height,
      cell.width,
      cell.height,
      x,
      y,
      9,
      16,
    );
    ctx.globalCompositeOperation = 'source-over';
    if (underline) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y + 14, 9, 1);
      if (inverse) ctx.clearRect(x, y + 14, 9, 1);
    }
  }
}
export { FINE_CELL };
/**
 * The fine text the faces are drawn in, as VGA's denser text modes drew it: printable ASCII
 * in cells of 5 x 8 raster pixels, the same font at half the size, in the three brightnesses.
 */
export class FineAtlas {
  private sheets: HTMLCanvasElement[] = [];
  private cell = { width: FINE_CELL.width * GLYPH_SCALE, height: FINE_CELL.height * GLYPH_SCALE };
  private index = new Map<string, number>();
  /** Needs the terminal font already loaded (GlyphAtlas.initialize does that). */
  constructor() {
    const chars = Array.from({ length: 95 }, (_, n) => String.fromCharCode(32 + n));
    const { width, height } = this.cell;
    const source = document.createElement('canvas');
    source.width = PER_ROW * width;
    source.height = Math.ceil(chars.length / PER_ROW) * height;
    const ctx = source.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.font = `${10 * GLYPH_SCALE}px TerminalGlyph`;
    ctx.textBaseline = 'alphabetic';
    chars.forEach((char, n) => {
      this.index.set(char, n);
      ctx.fillText(
        char,
        (n % PER_ROW) * width,
        Math.floor(n / PER_ROW) * height + 6.5 * GLYPH_SCALE,
        FINE_CELL.width * GLYPH_SCALE,
      );
    });
    const original = ctx.getImageData(0, 0, source.width, source.height);
    for (const [r, g, b] of [
      [154, 90, 24],
      [242, 162, 58],
      [255, 210, 122],
    ]) {
      const sheet = document.createElement('canvas');
      sheet.width = source.width;
      sheet.height = source.height;
      const pixels = new ImageData(
        new Uint8ClampedArray(original.data),
        source.width,
        source.height,
      );
      for (let n = 0; n < pixels.data.length; n += 4) {
        // Firmed up as the ordinary glyphs are, so the small strokes stay solid.
        const t = Math.max(0, Math.min(1, (pixels.data[n + 3] - 32) / 176));
        pixels.data[n] = r;
        pixels.data[n + 1] = g;
        pixels.data[n + 2] = b;
        pixels.data[n + 3] = Math.round(t * t * (3 - 2 * t) * 255);
      }
      sheet.getContext('2d')!.putImageData(pixels, 0, 0);
      this.sheets.push(sheet);
    }
  }
  /** Draws one fine cell in logical units; `level` is 0 dim, 1 normal, 2 bright. */
  draw(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, level: number) {
    const n = this.index.get(char);
    if (n === undefined) return;
    const { width, height } = this.cell;
    ctx.drawImage(
      this.sheets[level],
      (n % PER_ROW) * width,
      Math.floor(n / PER_ROW) * height,
      width,
      height,
      x,
      y,
      FINE_CELL.width,
      FINE_CELL.height,
    );
  }
}
