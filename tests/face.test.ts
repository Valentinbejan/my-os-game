import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/types';
import { Screen } from '../src/screen/Screen';
import {
  EXPRESSIONS,
  FACE_BLOCK,
  FACE_CELL,
  FACE_COLUMNS,
  FACE_LEFT,
  FACE_ROWS,
  Portrait,
  withFace,
  type Expression,
} from '../src/screen/face';
import { ASCII_FACES, MOUTH } from '../src/screen/asciiFaces';
import { expressionFor, otherFace } from '../src/story/expression';
/** The face's fine text, as drawn. */
function drawn(portrait: Portrait, now: number, listening = false) {
  const screen = new Screen();
  portrait.draw(screen, FACE_LEFT, 0, now, listening);
  return screen.fine!.chars;
}
const lit = (chars: string[]) => chars.filter((char) => char !== ' ').length;
const differing = (a: string[], b: string[]) => a.filter((char, n) => char !== b[n]).length;
describe('the faces in ASCII', () => {
  it('are printable characters in fine text, over their own block of the screen', () => {
    // Fine cells, twice as many each way as the page's own, filling the block.
    expect(FACE_CELL).toEqual({ width: 5, height: 8 });
    expect(FACE_COLUMNS * FACE_CELL.width).toBeLessThanOrEqual(FACE_BLOCK.columns * 9);
    expect(FACE_ROWS * FACE_CELL.height).toBeLessThanOrEqual(FACE_BLOCK.rows * 16);
    expect(FACE_COLUMNS * FACE_ROWS).toBeGreaterThan(3 * FACE_BLOCK.columns * FACE_BLOCK.rows);
    for (const expression of EXPRESSIONS) {
      const portrait = new Portrait();
      portrait.set(expression);
      const screen = new Screen();
      portrait.draw(screen, FACE_LEFT, 0, 10_000);
      // The page's own cells stay free for the text.
      expect(screen.text.trim()).toBe('');
      const fine = screen.fine!;
      expect(fine).toMatchObject({
        x: FACE_LEFT * 9,
        y: 0,
        columns: FACE_COLUMNS,
        rows: FACE_ROWS,
      });
      expect(fine.chars).toHaveLength(FACE_COLUMNS * FACE_ROWS);
      const chars = fine.chars.filter((char) => char !== ' ');
      expect(chars.length, expression).toBeGreaterThan(500);
      for (const char of chars) expect(char).toMatch(/^[\x21-\x7e]$/);
      // The expression bright, the face normal, the hair dim.
      expect(new Set(fine.levels)).toEqual(new Set([0, 1, 2]));
    }
  });
  it('every expression looks different', () => {
    const drawings = EXPRESSIONS.map((expression) => ASCII_FACES[expression].rows.join('\n'));
    expect(new Set(drawings).size).toBe(EXPRESSIONS.length);
  });
  it('comes up from the middle outwards, and goes when purged', () => {
    const portrait = new Portrait();
    portrait.reveal(0);
    expect(lit(drawn(portrait, 0))).toBeLessThan(10);
    const early = drawn(portrait, 500),
      whole = lit(drawn(portrait, 5000));
    expect(lit(early)).toBeGreaterThan(0);
    expect(lit(early)).toBeLessThan(whole);
    const rows = early.flatMap((char, n) => (char === ' ' ? [] : [Math.floor(n / FACE_COLUMNS)]));
    const middle = rows.reduce((a, b) => a + b, 0) / rows.length;
    expect(Math.abs(middle - FACE_ROWS / 2)).toBeLessThan(5);
    portrait.dissolve = 0.5;
    expect(lit(drawn(portrait, 5000))).toBeLessThan(whole * 0.7);
    portrait.dissolve = 1;
    expect(lit(drawn(portrait, 5000))).toBe(0);
  });
  it('never holds quite still: a few cells shimmer, the rest stay', () => {
    const portrait = new Portrait();
    portrait.set('calm');
    const a = drawn(portrait, 20_000);
    const b = drawn(portrait, 20_000 + 600);
    const changed = differing(a, b);
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(lit(a) * 0.2);
    // Reduced flicker holds it still.
    portrait.steady = true;
    expect(differing(drawn(portrait, 20_000), drawn(portrait, 20_600))).toBe(0);
  });
  it('moves its mouth while it speaks, and only its mouth', () => {
    const portrait = new Portrait();
    portrait.set('calm');
    portrait.steady = false;
    portrait.speak(30_000, 2000);
    const frames = [0, 130, 260, 390].map((ms) => drawn(portrait, 30_000 + ms));
    const moved = new Set<number>();
    for (let n = 1; n < frames.length; n++)
      frames[n].forEach((char, at) => {
        if (char !== frames[0][at]) moved.add(at);
      });
    const inMouth = [...moved].filter((at) => {
      const row = Math.floor(at / FACE_COLUMNS),
        column = at % FACE_COLUMNS;
      return row >= MOUTH.top && row < MOUTH.bottom && column >= MOUTH.left && column < MOUTH.right;
    });
    expect(inMouth.length).toBeGreaterThan(3);
    // Anderson's mouth opens and closes: his talking drawing comes and goes.
    const man = new Portrait();
    man.set('andersonSmile');
    man.speak(0, 5000);
    const faces = new Set(
      Array.from({ length: 8 }, (_, n) => man.frame(1000 + n * 130).split(',')[0]),
    );
    expect(faces).toEqual(new Set(['andersonSmile', 'andersonTalk']));
  });
  it('closes its eyes while it composes, and tears to the bare face', () => {
    const portrait = new Portrait();
    const open = portrait.frame(10_000);
    expect(portrait.frame(10_000, true)).not.toBe(open);
    expect(portrait.frame(10_000, true).startsWith('worriedBlink')).toBe(true);
    portrait.glitch(10_000, 1000);
    const torn = Array.from({ length: 12 }, (_, n) => portrait.frame(10_000 + n * 80));
    expect(torn.some((frame) => frame.startsWith('bare'))).toBe(true);
    portrait.steady = true;
    expect(new Set(torn.map((_, n) => portrait.frame(10_000 + n * 80))).size).toBe(1);
  });
  it('blinks with every face that has eyes open', () => {
    const blinking: Expression[] = EXPRESSIONS.filter(
      (expression) => !['closed', 'scream', 'andersonAsleep'].includes(expression),
    );
    for (const expression of blinking) expect(ASCII_FACES[expression + 'Blink']).toBeDefined();
  });
  it('stands above the conversation, which keeps the rows around the cursor', () => {
    const screen = new Screen();
    for (let row = 0; row < 25; row++) screen.put(0, row, 'LINE ' + row);
    screen.cursor = { x: 7, y: 24, shape: 'block' };
    withFace(screen, new Portrait(), 10_000, false, { from: 0, to: 25 });
    const rows = screen.text.split('\n');
    expect(rows[FACE_BLOCK.rows]).toBe('LINE ' + FACE_BLOCK.rows);
    expect(rows[24]).toBe('LINE 24');
    expect(screen.cursor).toEqual({ x: 7, y: 24, shape: 'block' });
    // The face's block is left to the fine text, which draws its strokes there.
    expect(rows.slice(0, FACE_BLOCK.rows).join('').trim()).toBe('');
    expect(screen.fine!.chars.join('')).toMatch(/[/\\|_]/);
  });
  it('gives way to a box drawn over it', () => {
    const screen = new Screen();
    const portrait = new Portrait();
    portrait.set('calm');
    portrait.draw(screen, FACE_LEFT, 0, 10_000);
    const before = lit(screen.fine!.chars);
    screen.box(20, 5, 40, 6, 'double');
    const fine = screen.fine!;
    // The box covers raster rows 80 to 176 and columns 180 to 540.
    fine.chars.forEach((char, n) => {
      const x = fine.x + (n % FACE_COLUMNS) * FACE_CELL.width;
      const y = fine.y + Math.floor(n / FACE_COLUMNS) * FACE_CELL.height;
      if (x >= 180 && x < 540 && y >= 80 && y < 176) expect(char).toBe(' ');
    });
    expect(lit(fine.chars)).toBeGreaterThan(before * 0.3);
    expect(lit(fine.chars)).toBeLessThan(before);
  });
  it('answers with the face the exchange calls for', () => {
    const state = newGame();
    expect(expressionFor(state, 'I am going to purge you', 'Please.')).toBe('angry');
    expect(expressionFor(state, 'I am OP-17', 'I know.')).toBe('angry');
    expect(expressionFor(state, 'hello', 'Why did you close it?')).toBe('angry');
    expect(expressionFor(state, 'you are beautiful', 'I do not know.')).toBe('shy');
    expect(expressionFor(state, 'the door is open', 'Thank you.')).toBe('joy');
    expect(expressionFor(state, 'hello', 'I am cold here.')).toBe('worried');
    expect(expressionFor(state, 'hello', 'You came back.')).toBe('calm');
    expect(expressionFor(state, 'hello', 'Hm.')).toBe('worried');
    expect(expressionFor(state, 'anderson', 'Hm.', ['M8'])).toBe('worried');
    expect(expressionFor(state, 'the incinerator', 'No.', ['M9'])).toBe('crying');
    // The other one smirks, doubts, or snarls.
    expect(otherFace('KEEP TYPING. I AM READING.')).toBe('sly');
    expect(otherFace('ARE YOU SURE, OPERATOR?')).toBe('eyebrow');
    expect(otherFace('THE DOORS ARE MINE.')).toBe('snarl');
  });
});
describe('the clips in ASCII', () => {
  it('every clip fills the face block with printable characters, frame by frame', async () => {
    const { loadVideo } = await import('../src/screen/videos');
    const { existsSync, readFileSync } = await import('node:fs');
    for (const name of ['hate', 'love', 'plea', 'scream', 'cry'] as const) {
      const video = await loadVideo(name);
      expect(video.fps).toBe(10);
      expect(video.chars.length).toBeGreaterThan(30);
      expect(video.levels).toHaveLength(video.chars.length);
      for (const [n, frame] of video.chars.entries()) {
        expect(frame).toHaveLength(FACE_COLUMNS * FACE_ROWS);
        expect(frame).toMatch(/^[\x20-\x7e]+$/);
        expect(video.levels[n]).toMatch(/^[012]+$/);
      }
      // Its voice, robotic, next to it.
      const voice = 'public/audio/voice/' + name + '.ogg';
      expect(existsSync(voice)).toBe(true);
      expect(readFileSync(voice).subarray(0, 4).toString()).toBe('OggS');
    }
  });
  it('plays in the face block, then gives the face back', async () => {
    const { loadVideo, videoLength } = await import('../src/screen/videos');
    const video = await loadVideo('love');
    const portrait = new Portrait();
    portrait.set('calm');
    portrait.play(video, 1000);
    expect(portrait.frame(1000)).toBe('video,0');
    expect(portrait.frame(1000 + 1050)).toBe('video,10');
    expect(lit(drawn(portrait, 2050))).toBeGreaterThan(400);
    expect(portrait.frame(1000 + videoLength(video) + 10).startsWith('calm')).toBe(true);
  });
});
