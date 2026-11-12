import { blank } from '../terminal/TerminalBuffer';
import type { FineText, Screen } from './Screen';
import {
  ASCII_FACES,
  FACE_BLOCK,
  FACE_CELL,
  FACE_COLUMNS,
  FACE_LEVELS,
  FACE_ROWS,
  MOUTH,
} from './asciiFaces';
import { videoLength, type Video } from './videos';
/** The face is drawn in fine text (FACE_COLUMNS x FACE_ROWS cells) over this block of the page. */
export { FACE_BLOCK, FACE_COLUMNS, FACE_ROWS };
/** An empty face-sized layer of fine text, with its top-left corner at a page cell. */
function layer(left: number, top: number): FineText {
  const count = FACE_COLUMNS * FACE_ROWS;
  return {
    x: left * 9,
    y: top * 16,
    columns: FACE_COLUMNS,
    rows: FACE_ROWS,
    chars: new Array<string>(count).fill(' '),
    levels: new Uint8Array(count),
  };
}
/**
 * The faces process 04 can show: the site assistant's, the other one's, and James
 * Anderson's, surfacing in the same brain.
 */
export type Expression =
  | 'calm'
  | 'worried'
  | 'joy'
  | 'shy'
  | 'angry'
  | 'closed'
  | 'bare'
  | 'crying'
  | 'terror'
  | 'blank'
  | 'sly'
  | 'eyebrow'
  | 'snarl'
  | 'scream'
  | 'andersonSmile'
  | 'andersonTalk'
  | 'andersonAsleep';
export const EXPRESSIONS: readonly Expression[] = [
  'calm',
  'worried',
  'joy',
  'shy',
  'angry',
  'closed',
  'bare',
  'crying',
  'terror',
  'blank',
  'sly',
  'eyebrow',
  'snarl',
  'scream',
  'andersonSmile',
  'andersonTalk',
  'andersonAsleep',
];
export const isAnderson = (expression: Expression) => expression.startsWith('anderson');
/** A small repeatable hash in [0, 1). */
const hash = (a: number, b: number) => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const REVEAL_MS = 1500;
const BLINK_MS = 150;
const BLINK_EVERY = 4700;
const GLITCH_STEP = 80;
/** The shimmer: a few cells at a time swap to their near character, this often. */
const SHIMMER_MS = 300;
const SHIMMER_SHARE = 0.05;
/** While the face speaks, the mouth changes this often. */
const MOUTH_MS = 130;
/**
 * The face in the middle of the screen, drawn in ASCII like the text around it and never
 * quite still: cells shimmer between two near characters, the eyes blink, and the mouth
 * moves while it speaks. The engine sets the expression; the screens that show it draw it.
 */
export class Portrait {
  expression: Expression = 'worried';
  /** 0 whole, 1 gone: how much of the face has been purged. */
  dissolve = 0;
  /** Eyes held shut, whatever the expression. */
  closedEyes = false;
  /** Reduced flicker: tears and shimmer hold still, and cells arrive without a flare. */
  steady = false;
  private revealedAt = -Infinity;
  private glitchUntil = 0;
  private speakingUntil = 0;
  private video: { clip: Video; from: number; until?: number } | null = null;
  /** A glimpse of a clip from its middle, `ms` long: there and gone. */
  flash(clip: Video, now: number, ms: number) {
    this.video = { clip, from: now - videoLength(clip) / 2, until: now + ms };
  }
  /** A clip plays in the face's place until it ends. */
  play(clip: Video, now: number) {
    this.video = { clip, from: now };
  }
  /** The frame of the clip playing now, or -1. */
  private videoFrame(now: number) {
    const video = this.video;
    const end = video?.until ?? (video ? video.from + videoLength(video.clip) : 0);
    if (!video || now < video.from || now >= end) return -1;
    return Math.min(
      video.clip.chars.length - 1,
      Math.floor(((now - video.from) / 1000) * video.clip.fps),
    );
  }
  /** One frame of the playing clip, in the face's block. */
  private drawClip(screen: Screen, left: number, top: number, frame: number) {
    const clip = this.video!.clip;
    const chars = clip.chars[frame];
    const levels = clip.levels[frame];
    const text = layer(left, top);
    for (let at = 0; at < text.chars.length; at++) {
      text.chars[at] = chars[at] ?? ' ';
      text.levels[at] = Number(levels[at] ?? 0);
    }
    screen.fine = text;
  }
  set(expression: Expression) {
    this.expression = expression;
    this.seen.add(expression);
  }
  /** Every expression the face has shown, for the archive. */
  readonly seen = new Set<Expression>();
  /** The face comes up from the middle outwards. */
  reveal(now: number) {
    this.revealedAt = now;
    this.dissolve = 0;
  }
  /** The face tears: the picture flickers to the bare face for a moment. */
  glitch(now: number, ms: number) {
    this.glitchUntil = Math.max(this.glitchUntil, now + ms);
    this.seen.add('bare');
  }
  /** The mouth moves for as long as a line takes to type out. */
  speak(now: number, ms: number) {
    this.speakingUntil = Math.max(this.speakingUntil, now + ms);
  }
  /** Which face, and how, at this moment. `listening` closes its eyes while it composes. */
  private look(now: number, listening: boolean) {
    const glitching = now < this.glitchUntil;
    const step = this.steady ? 0 : Math.floor(now / GLITCH_STEP);
    const speaking = now < this.speakingUntil;
    let face: string = this.expression;
    if (glitching && (this.steady || step % 3 !== 0)) face = 'bare';
    // Anderson's mouth opens and closes; hers moves in the shimmer of the mouth's cells.
    else if (speaking && face === 'andersonSmile' && Math.floor(now / (MOUTH_MS * 2)) % 2)
      face = 'andersonTalk';
    const window = Math.floor(now / BLINK_EVERY);
    const blinkAt = 900 + hash(window, 7) * 2800;
    const blinking = now % BLINK_EVERY >= blinkAt && now % BLINK_EVERY < blinkAt + BLINK_MS;
    if ((listening || this.closedEyes || blinking) && ASCII_FACES[face + 'Blink']) face += 'Blink';
    const progress = (now - this.revealedAt) / REVEAL_MS;
    return {
      face,
      glitch: glitching && !this.steady ? step : -1,
      reveal: progress < 1.2 ? Math.floor(Math.max(0, progress) * 48) : -1,
      shimmer: this.steady ? 0 : Math.floor(now / SHIMMER_MS),
      mouth: speaking && !this.steady ? Math.floor(now / MOUTH_MS) : -1,
    };
  }
  /** Changes whenever the drawn face does. */
  frame(now: number, listening = false) {
    const clip = this.videoFrame(now);
    if (clip >= 0) return 'video,' + clip;
    const look = this.look(now, listening);
    return [
      look.face,
      look.glitch,
      look.reveal,
      look.shimmer,
      look.mouth,
      this.dissolve,
      this.steady,
    ].join(',');
  }
  /** Draws the face with its top-left cell at (left, top); `dim` draws it faint. */
  draw(screen: Screen, left: number, top: number, now: number, listening = false, dim = false) {
    const clip = this.videoFrame(now);
    if (clip >= 0) return this.drawClip(screen, left, top, clip);
    const look = this.look(now, listening);
    const face = ASCII_FACES[look.face] ?? ASCII_FACES.calm;
    const progress = look.reveal < 0 ? Infinity : look.reveal / 48;
    const text = layer(left, top);
    for (let row = 0; row < FACE_ROWS; row++) {
      // While the picture tears, bands of rows slip sideways.
      const band = Math.floor(row / 2);
      const slip =
        look.glitch >= 0 && hash(look.glitch, band) < 0.3
          ? Math.round((hash(band, look.glitch) - 0.5) * 10)
          : 0;
      const line = face.rows[row] ?? '';
      const alt = face.alt[row] ?? '';
      for (let column = 0; column < line.length; column++) {
        const x = column + slip;
        if (x < 0 || x >= FACE_COLUMNS) continue;
        let char = line[column];
        if (char === ' ') continue;
        // Revealed from the middle outwards, each cell flaring as it arrives.
        const dx = (column + 0.5) / FACE_COLUMNS - 0.5,
          dy = (row + 0.5) / FACE_ROWS - 0.5;
        const due = Math.min(1, Math.hypot(dx, dy * 0.8) * 1.6) * 0.8 + hash(column, row) * 0.2;
        if (progress < due) continue;
        // Purged cells go dim, then go.
        const fade = hash(row, column + 101);
        if (fade < this.dissolve) continue;
        const cell = row * FACE_COLUMNS + column;
        const inMouth =
          row >= MOUTH.top && row < MOUTH.bottom && column >= MOUTH.left && column < MOUTH.right;
        const swap =
          (look.mouth >= 0 && inMouth && hash(cell, look.mouth) < 0.5) ||
          hash(cell, look.shimmer) < SHIMMER_SHARE;
        if (swap && alt[column] && alt[column] !== ' ') char = alt[column];
        const flare = !this.steady && progress < due + 0.08;
        // The expression bright, the face normal, the hair dim; all a step down when dimmed.
        const level = Number(FACE_LEVELS[row]?.[column] ?? 1);
        const intensity = (
          flare
            ? dim
              ? 1
              : 2
            : fade < this.dissolve + 0.12
              ? 0
              : Math.max(0, level - (dim ? 1 : 0))
        ) as 0 | 1 | 2;
        text.chars[row * FACE_COLUMNS + x] = char;
        text.levels[row * FACE_COLUMNS + x] = intensity;
      }
    }
    screen.fine = text;
  }
}
/** The page column where a face centred on the 80-column page starts. */
export const FACE_LEFT = Math.floor((80 - FACE_BLOCK.columns) / 2);
/** The fine cell's size in raster pixels (for tests and tools). */
export { FACE_CELL };
/**
 * Puts the face above the last rows of a console page: the face fills the top of the screen
 * and the rows around the cursor move below it.
 */
export function withFace(
  screen: Screen,
  portrait: Portrait,
  now: number,
  listening: boolean,
  textRows: { from: number; to: number },
) {
  const page = screen.cells.slice();
  const cursor = screen.cursor;
  const room = textRows.to - FACE_BLOCK.rows;
  const last = Math.max(cursor?.y ?? 0, lastUsedRow(page, textRows.to));
  const first = Math.max(textRows.from, last - room + 1);
  for (let n = 0; n < 80 * textRows.to; n++) screen.cells[n] = blank();
  for (let row = 0; row < room; row++)
    for (let x = 0; x < 80; x++)
      screen.cells[(FACE_BLOCK.rows + row) * 80 + x] = page[(first + row) * 80 + x] ?? blank();
  if (cursor) screen.cursor = { ...cursor, y: cursor.y - first + FACE_BLOCK.rows };
  portrait.draw(screen, FACE_LEFT, 0, now, listening);
}
function lastUsedRow(cells: readonly { char: string }[], rows: number) {
  for (let row = rows - 1; row >= 0; row--)
    for (let x = 0; x < 80; x++) if (cells[row * 80 + x].char !== ' ') return row;
  return 0;
}
