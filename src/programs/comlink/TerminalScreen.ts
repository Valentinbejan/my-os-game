/** One cell of the communications screen. */
export interface CommCell {
  char: string;
  /** Reverse video: the other one's voice on COM4. */
  inverse: boolean;
}
const blankCell = (): CommCell => ({ char: ' ', inverse: false });
/**
 * The 80x24 teletype page COMLINK draws remote output on: text wraps at the right edge and
 * scrolls off the top, as on a dumb terminal.
 */
export class TerminalScreen {
  static readonly COLUMNS = 80;
  static readonly ROWS = 24;
  lines: CommCell[][] = [];
  x = 0;
  y = 0;
  constructor(private bell: () => void = () => undefined) {
    this.clear();
  }
  clear() {
    this.lines = Array.from({ length: TerminalScreen.ROWS }, () =>
      Array.from({ length: TerminalScreen.COLUMNS }, blankCell),
    );
    this.x = 0;
    this.y = 0;
  }
  private newline() {
    this.x = 0;
    if (this.y < TerminalScreen.ROWS - 1) this.y++;
    else {
      this.lines.shift();
      this.lines.push(Array.from({ length: TerminalScreen.COLUMNS }, blankCell));
    }
  }
  /** Writes received characters: CR, LF (as CR LF), BS, BEL, FF and TAB are obeyed. */
  write(text: string, inverse = false) {
    for (const char of text) {
      if (char === '\r') this.x = 0;
      else if (char === '\n') this.newline();
      else if (char === '\b') this.x = Math.max(0, this.x - 1);
      else if (char === '\x07') this.bell();
      else if (char === '\f') this.clear();
      else if (char === '\t') this.x = Math.min(TerminalScreen.COLUMNS - 1, (this.x + 8) & ~7);
      else if (char >= ' ') {
        if (this.x >= TerminalScreen.COLUMNS) this.newline();
        this.lines[this.y][this.x++] = { char, inverse };
      }
    }
  }
  get text() {
    return this.lines
      .map((line) =>
        line
          .map((cell) => cell.char)
          .join('')
          .trimEnd(),
      )
      .join('\n');
  }
}
