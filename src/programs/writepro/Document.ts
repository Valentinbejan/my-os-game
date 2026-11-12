/**
 * A WRITEPRO document. Like a real word-processor file, formatting lives in the text as
 * codes: control characters that TYPE shows as junk. A hidden comment is one unit, from
 * NOTE to NOTE_END, with its text inside.
 */
export const BOLD = '\u0011';
export const BOLD_END = '\u0012';
export const UNDERLINE = '\u0013';
export const UNDERLINE_END = '\u0014';
export const NOTE = '\u0015';
export const NOTE_END = '\u0016';
/** Characters per line: 6.5 inches at 10 characters per inch between 1-inch margins. */
export const WIDTH = 65;
/** Lines per page: 9 inches at 6 lines per inch. */
export const PAGE = 54;
const TAB = 5;
export interface Glyph {
  char: string;
  /** Index in the document of the token this cell shows. */
  index: number;
  col: number;
  bold: boolean;
  underline: boolean;
}
export interface Line {
  /** First and one-past-last document index covered by the line. */
  start: number;
  end: number;
  glyphs: Glyph[];
  /** Ended by a hard return [HRt] rather than word wrap [SRt]. */
  hard: boolean;
}
export type Token =
  | { kind: 'char'; start: number; end: number; char: string }
  | { kind: 'code'; start: number; end: number; code: string }
  | { kind: 'note'; start: number; end: number; text: string };
const names: Record<string, string> = {
  [BOLD]: 'BOLD',
  [BOLD_END]: 'bold',
  [UNDERLINE]: 'UND',
  [UNDERLINE_END]: 'und',
  '\n': 'HRt',
  '\t': 'Tab',
};
export const isCode = (char: string) => char in names;
/** Codes with no width on screen (style switches, comments); returns and tabs take space. */
const hidden = (token: Token) =>
  token.kind === 'note' || (token.kind === 'code' && token.code !== '\n' && token.code !== '\t');
/** The name WRITEPRO shows for a code in Reveal Codes, e.g. [BOLD]. */
export function codeName(token: Token) {
  if (token.kind === 'note') return `[Comment:${token.text}]`;
  if (token.kind === 'code') return `[${names[token.code]}]`;
  return token.char;
}
export class WpDocument {
  text: string;
  cursor = 0;
  dirty = false;
  private cached: { text: string; lines: Line[] } | null = null;
  constructor(text = '') {
    this.text = text.replace(/\r\n?/g, '\n');
  }
  /** The token that starts at `index` (a comment spans several characters). */
  token(index: number): Token | null {
    if (index < 0 || index >= this.text.length) return null;
    const char = this.text[index];
    if (char === NOTE) {
      const end = this.text.indexOf(NOTE_END, index);
      const stop = end < 0 ? this.text.length : end + 1;
      return { kind: 'note', start: index, end: stop, text: this.text.slice(index + 1, stop - 1) };
    }
    if (isCode(char)) return { kind: 'code', start: index, end: index + 1, code: char };
    return { kind: 'char', start: index, end: index + 1, char };
  }
  /** The token that ends at `index`. */
  before(index: number): Token | null {
    if (index <= 0) return null;
    if (this.text[index - 1] === NOTE_END) {
      const start = this.text.lastIndexOf(NOTE, index - 1);
      if (start >= 0) return this.token(start);
    }
    return this.token(index - 1);
  }
  tokens(): Token[] {
    const list: Token[] = [];
    for (let index = 0; index < this.text.length;) {
      const token = this.token(index)!;
      list.push(token);
      index = token.end;
    }
    return list;
  }
  /** Lays the document out in lines, wrapping words at the right margin. */
  layout(): Line[] {
    if (this.cached?.text === this.text) return this.cached.lines;
    const lines: Line[] = [];
    let bold = false,
      underline = false;
    let line: Line = { start: 0, end: 0, glyphs: [], hard: false };
    const width = () => (line.glyphs.length ? line.glyphs[line.glyphs.length - 1].col + 1 : 0);
    const finish = (end: number, hard: boolean) => {
      line.end = end;
      line.hard = hard;
      lines.push(line);
      line = { start: end, end, glyphs: [], hard: false };
    };
    for (const token of this.tokens()) {
      if (token.kind === 'code') {
        if (token.code === BOLD) bold = true;
        if (token.code === BOLD_END) bold = false;
        if (token.code === UNDERLINE) underline = true;
        if (token.code === UNDERLINE_END) underline = false;
        if (token.code === '\n') finish(token.end, true);
        if (token.code === '\t') {
          const stop = Math.min(WIDTH, (Math.floor(width() / TAB) + 1) * TAB);
          for (let col = width(); col < stop; col++)
            line.glyphs.push({ char: ' ', index: token.start, col, bold, underline });
        }
        continue;
      }
      if (token.kind === 'note') continue;
      if (width() >= WIDTH) {
        // A space at the margin stays, unseen, at the end of the line it ends.
        if (token.char === ' ') {
          line.glyphs.push({ char: ' ', index: token.start, col: width(), bold, underline });
          finish(token.end, false);
          continue;
        }
        // Word wrap: carry the unfinished word to a new line, leaving the space behind.
        const space = line.glyphs.map((g) => g.char).lastIndexOf(' ');
        const carried = space < 0 ? [] : line.glyphs.splice(space + 1);
        const breakAt = carried.length ? carried[0].index : token.start;
        finish(breakAt, false);
        carried.forEach((glyph, col) => line.glyphs.push({ ...glyph, col }));
      }
      line.glyphs.push({ char: token.char, index: token.start, col: width(), bold, underline });
    }
    finish(this.text.length, false);
    this.cached = { text: this.text, lines };
    return lines;
  }
  /** Line and column of an index. */
  locate(index = this.cursor) {
    const lines = this.layout();
    let row = lines.findIndex((line, n) => index < line.end || n === lines.length - 1);
    // An index at a soft break belongs to the start of the next line.
    if (row < lines.length - 1 && !lines[row].hard && index === lines[row].end) row++;
    const line = lines[row];
    const glyph = line.glyphs.find((g) => g.index >= index);
    const col = glyph
      ? glyph.col
      : line.glyphs.length
        ? line.glyphs[line.glyphs.length - 1].col + 1
        : 0;
    return { row, col };
  }
  /** The index nearest a column on a line. */
  indexAt(row: number, col: number) {
    const lines = this.layout();
    const line = lines[Math.max(0, Math.min(lines.length - 1, row))];
    const glyph = line.glyphs.find((g) => g.col >= col);
    if (glyph) return glyph.index;
    const last = line.hard ? line.end - 1 : line.end;
    return Math.max(line.start, last);
  }
  /** Bold and underline at the cursor, for the Pos indicator. */
  style(index = this.cursor) {
    let bold = false,
      underline = false;
    for (const token of this.tokens()) {
      if (token.start >= index) break;
      if (token.kind !== 'code') continue;
      if (token.code === BOLD) bold = true;
      if (token.code === BOLD_END) bold = false;
      if (token.code === UNDERLINE) underline = true;
      if (token.code === UNDERLINE_END) underline = false;
    }
    return { bold, underline };
  }
  /** Moves right past invisible codes and one visible character (or one token when revealed). */
  right(revealed = false) {
    let token = this.token(this.cursor);
    if (!revealed)
      while (token && hidden(token)) {
        this.cursor = token.end;
        token = this.token(this.cursor);
      }
    if (token) this.cursor = token.end;
  }
  left(revealed = false) {
    let token = this.before(this.cursor);
    if (!revealed)
      while (token && hidden(token)) {
        this.cursor = token.start;
        token = this.before(this.cursor);
      }
    if (token) this.cursor = token.start;
  }
  insert(text: string) {
    this.text = this.text.slice(0, this.cursor) + text + this.text.slice(this.cursor);
    this.cursor += text.length;
    this.dirty = true;
  }
  /** Removes the token at (forward) or before (backward) the cursor; returns it. */
  remove(forward: boolean): Token | null {
    const token = forward ? this.token(this.cursor) : this.before(this.cursor);
    if (!token) return null;
    this.text = this.text.slice(0, token.start) + this.text.slice(token.end);
    this.cursor = token.start;
    this.dirty = true;
    return token;
  }
  removeRange(from: number, to: number) {
    const [start, end] = from < to ? [from, to] : [to, from];
    this.text = this.text.slice(0, start) + this.text.slice(end);
    this.cursor = start;
    this.dirty = true;
  }
  /**
   * F6 / F8: inside a pair, jumps past its closing code; otherwise opens a new pair with the
   * cursor between the codes. With a block, wraps the block.
   */
  toggle(open: string, close: string, block?: [number, number]) {
    if (block) {
      const [start, end] = block[0] < block[1] ? block : [block[1], block[0]];
      this.text =
        this.text.slice(0, start) +
        open +
        this.text.slice(start, end) +
        close +
        this.text.slice(end);
      this.cursor = end + 2;
    } else if (this.text[this.cursor] === close) this.cursor++;
    else {
      this.insert(open + close);
      this.cursor--;
    }
    this.dirty = true;
  }
  /** Text without codes (hidden comments dropped): what prints and what search matches. */
  plain() {
    return this.tokens()
      .map((t) =>
        t.kind === 'char'
          ? t.char
          : t.kind === 'code' && t.code === '\n'
            ? '\n'
            : t.kind === 'code' && t.code === '\t'
              ? '\t'
              : '',
      )
      .join('');
  }
  /** Finds visible text forward or backward from the cursor, ignoring case. */
  find(needle: string, backward = false) {
    if (!needle) return false;
    const upper = this.text.toUpperCase(),
      wanted = needle.toUpperCase();
    const found = backward
      ? upper.lastIndexOf(wanted, this.cursor - 1)
      : upper.indexOf(wanted, this.cursor + 1);
    if (found < 0) return false;
    this.cursor = backward ? found : found + wanted.length;
    return true;
  }
}
