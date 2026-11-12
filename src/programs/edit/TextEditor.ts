/** The text being edited in EDIT: lines, a cursor that may stand past line ends, a selection. */
export interface Position {
  row: number;
  col: number;
}
export const MAX_LINE = 255;
const before = (a: Position, b: Position) => a.row < b.row || (a.row === b.row && a.col < b.col);
export class TextEditor {
  lines: string[];
  row = 0;
  col = 0;
  /** Where a Shift-selection started; null when nothing is selected. */
  anchor: Position | null = null;
  insert = true;
  dirty = false;
  constructor(text = '') {
    const normalized = text.replace(/\r\n?/g, '\n').replace(/\t/g, '        ');
    this.lines = (normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized).split('\n');
  }
  text() {
    return this.lines.map((line) => line.trimEnd()).join('\n') + '\n';
  }
  get line() {
    return this.lines[this.row];
  }
  private set line(value: string) {
    this.lines[this.row] = value;
  }
  selection(): { start: Position; end: Position } | null {
    if (!this.anchor) return null;
    const here = { row: this.row, col: this.col };
    if (this.anchor.row === here.row && this.anchor.col === here.col) return null;
    return before(this.anchor, here)
      ? { start: this.anchor, end: here }
      : { start: here, end: this.anchor };
  }
  selectedText() {
    const range = this.selection();
    if (!range) return '';
    const { start, end } = range;
    if (start.row === end.row) return this.lines[start.row].slice(start.col, end.col);
    return [
      this.lines[start.row].slice(start.col),
      ...this.lines.slice(start.row + 1, end.row),
      this.lines[end.row].slice(0, end.col),
    ].join('\n');
  }
  deleteSelection() {
    const range = this.selection();
    this.anchor = null;
    if (!range) return false;
    const { start, end } = range;
    const head = this.lines[start.row].padEnd(start.col).slice(0, start.col);
    const tail = this.lines[end.row].slice(end.col);
    this.lines.splice(start.row, end.row - start.row + 1, head + tail);
    this.row = start.row;
    this.col = start.col;
    this.dirty = true;
    return true;
  }
  /** Cursor movement. With `select`, the selection grows from where it started. */
  move(key: string, select = false, page = 20) {
    if (select && !this.anchor) this.anchor = { row: this.row, col: this.col };
    if (!select) this.anchor = null;
    const last = this.lines.length - 1;
    switch (key) {
      case 'ArrowLeft':
        if (this.col > 0) this.col--;
        else if (this.row > 0) {
          this.row--;
          this.col = this.line.length;
        }
        break;
      case 'ArrowRight':
        if (this.col < MAX_LINE) this.col++;
        break;
      case 'ArrowUp':
        this.row = Math.max(0, this.row - 1);
        break;
      case 'ArrowDown':
        this.row = Math.min(last, this.row + 1);
        break;
      case 'Home':
        this.col =
          this.line.length - this.line.trimStart().length === this.col
            ? 0
            : this.line.length - this.line.trimStart().length;
        break;
      case 'End':
        this.col = this.line.trimEnd().length;
        break;
      case 'PageUp':
        this.row = Math.max(0, this.row - page);
        break;
      case 'PageDown':
        this.row = Math.min(last, this.row + page);
        break;
      case 'DocumentStart':
        this.row = 0;
        this.col = 0;
        break;
      case 'DocumentEnd':
        this.row = last;
        this.col = this.lines[last].length;
        break;
      case 'WordLeft': {
        const text = this.line.slice(0, Math.min(this.col, this.line.length));
        const match = /\S+\s*$/.exec(text);
        this.col = match ? match.index : 0;
        break;
      }
      case 'WordRight': {
        const match = /^\S*\s+/.exec(this.line.slice(this.col));
        this.col = match ? this.col + match[0].length : this.line.length;
        break;
      }
    }
  }
  /** Types characters at the cursor, padding with spaces when the cursor is past the line end. */
  type(text: string) {
    this.deleteSelection();
    for (const char of text) {
      if (char === '\n') {
        this.enter();
        continue;
      }
      const line = this.line.padEnd(this.col);
      if (line.length >= MAX_LINE && this.insert) return;
      this.line = line.slice(0, this.col) + char + line.slice(this.col + (this.insert ? 0 : 1));
      this.col = Math.min(MAX_LINE, this.col + 1);
      this.dirty = true;
    }
  }
  /** Splits the line; the new line keeps the indentation of the one above, as EDIT does. */
  enter() {
    this.deleteSelection();
    const line = this.line;
    const indent = line.length - line.trimStart().length;
    const tail = line.slice(this.col);
    this.line = line.slice(0, this.col).trimEnd();
    const kept = line.trim() ? Math.min(indent, this.col) : 0;
    this.lines.splice(this.row + 1, 0, ' '.repeat(kept) + tail.trimStart());
    this.row++;
    this.col = kept;
    this.dirty = true;
  }
  backspace() {
    if (this.deleteSelection()) return;
    if (this.col > this.line.length) {
      this.col--;
      return;
    }
    if (this.col > 0) {
      this.line = this.line.slice(0, this.col - 1) + this.line.slice(this.col);
      this.col--;
    } else if (this.row > 0) {
      const joined = this.line;
      this.lines.splice(this.row, 1);
      this.row--;
      this.col = this.line.length;
      this.line += joined;
    } else return;
    this.dirty = true;
  }
  delete() {
    if (this.deleteSelection()) return;
    if (this.col < this.line.length)
      this.line = this.line.slice(0, this.col) + this.line.slice(this.col + 1);
    else if (this.row < this.lines.length - 1) {
      this.line = this.line.padEnd(this.col) + this.lines[this.row + 1];
      this.lines.splice(this.row + 1, 1);
    } else return;
    this.dirty = true;
  }
  tab() {
    this.type(' '.repeat(8 - (this.col % 8)));
  }
  /** Ctrl+Y: removes the whole line and returns it. */
  deleteLine() {
    this.anchor = null;
    const removed = this.line;
    if (this.lines.length === 1) this.lines[0] = '';
    else this.lines.splice(this.row, 1);
    this.row = Math.min(this.row, this.lines.length - 1);
    this.col = 0;
    this.dirty = true;
    return removed;
  }
  /** Finds text after the cursor, wrapping to the top. Selects the match; false when absent. */
  find(needle: string, matchCase = false) {
    if (!needle) return false;
    const fold = (value: string) => (matchCase ? value : value.toUpperCase());
    const wanted = fold(needle);
    for (let step = 0; step <= this.lines.length; step++) {
      const row = (this.row + step) % this.lines.length;
      const from = step === 0 ? this.col + (this.selection() ? 1 : 0) : 0;
      const found = fold(this.lines[row]).indexOf(wanted, from);
      if (found >= 0) {
        this.anchor = { row, col: found };
        this.row = row;
        this.col = found + needle.length;
        return true;
      }
    }
    return false;
  }
}
