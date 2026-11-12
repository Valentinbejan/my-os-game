export interface TerminalCell {
  char: string;
  intensity: 0 | 1 | 2;
  palette: 'amber' | 'red';
  inverse: boolean;
  underline: boolean;
  blink: boolean;
  corruptUntilMs: number;
}
export const blank = (): TerminalCell => ({
  char: ' ',
  intensity: 1,
  palette: 'amber',
  inverse: false,
  underline: false,
  blink: false,
  corruptUntilMs: 0,
});
export class TerminalBuffer {
  readonly columns = 80;
  readonly rows = 25;
  cells: TerminalCell[] = Array.from({ length: 2000 }, blank);
  scrollback: string[] = [];
  x = 0;
  y = 0;
  revision = 0;
  private pendingWrap = false;
  private archiveTop() {
    this.scrollback.push(
      this.cells
        .slice(0, 80)
        .map((c) => c.char)
        .join('')
        .trimEnd(),
    );
    if (this.scrollback.length > 2000) this.scrollback.shift();
  }
  scroll() {
    this.archiveTop();
    this.cells.copyWithin(0, 80);
    for (let n = 1920; n < 2000; n++) this.cells[n] = blank();
    this.y = Math.max(0, this.y - 1);
    this.revision++;
  }
  clear() {
    for (let row = 0; row <= this.y; row++)
      this.scrollback.push(
        this.cells
          .slice(row * 80, row * 80 + 80)
          .map((c) => c.char)
          .join('')
          .trimEnd(),
      );
    this.scrollback = this.scrollback.slice(-2000);
    for (let n = 0; n < 2000; n++) this.cells[n] = blank();
    this.x = this.y = 0;
    this.pendingWrap = false;
    this.revision++;
  }
  write(text: string, palette: 'amber' | 'red' = 'amber', dim = false, inverse = false) {
    for (const char of text) {
      if (char === '\r') {
        this.x = 0;
        this.pendingWrap = false;
        continue;
      }
      if (char === '\n') {
        this.x = 0;
        this.y++;
        this.pendingWrap = false;
      } else {
        if (this.pendingWrap) {
          this.x = 0;
          this.y++;
          this.pendingWrap = false;
        }
        while (this.y >= 25) this.scroll();
        this.cells[this.y * 80 + this.x] = {
          ...blank(),
          char,
          palette,
          intensity: dim ? 0 : 1,
          inverse,
        };
        if (this.x === 79) this.pendingWrap = true;
        else this.x++;
      }
      while (this.y >= 25) this.scroll();
    }
    this.revision++;
  }
  reserveInput(length: number) {
    const needed = Math.floor((this.x + length) / 80);
    while (this.y + needed >= 25) this.scroll();
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
