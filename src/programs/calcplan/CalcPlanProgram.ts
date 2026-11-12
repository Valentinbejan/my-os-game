import type { Screen } from '../../screen/Screen';
import { TerminalInput } from '../../terminal/TerminalInput';
import { baseName, join, parent, resolvePath } from '../../os/fs/paths';
import type { KeyEvent, Program, ProgramSystem } from '../Program';
import {
  COLUMNS,
  ROWS,
  address,
  columnName,
  dateSerial,
  parseRange,
  parseRef,
  rangeText,
  inRange,
  span,
  type Range,
} from './formula';
import { LABEL_PREFIXES, MAX_WIDTH, Sheet, VALUE_STARTS, cellKind, valueEntry } from './Sheet';
/** Screen rows: control panel 0-2, column border 3, worksheet 4-23, status 24. */
const TOP = 4;
const SHOWN = 20;
const BORDER = 5;
const AREA = 80 - BORDER;
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
interface Pos {
  col: number;
  row: number;
}
interface MenuItem {
  name: string;
  /** Second control-panel line; a submenu shows its own item names instead. */
  help?: string;
  items?: () => MenuItem[];
  run?: () => void;
}
interface MenuState {
  items: MenuItem[];
  pick: number;
  back: Array<{ items: MenuItem[]; pick: number }>;
  mode?: 'FIND';
}
type Prompt =
  | {
      kind: 'text';
      label: string;
      field: TerminalInput;
      /** The suggested text is replaced by the first key typed. */
      fresh: boolean;
      then: (value: string) => void;
    }
  | {
      kind: 'range';
      label: string;
      anchor: Pos | null;
      origin: Pos;
      /** Typed instead of pointed. */
      field: TerminalInput | null;
      /** Hidden rows or columns show (marked *) while choosing which to redisplay. */
      reveal?: 'row' | 'col';
      then: (range: Range) => void;
    }
  | {
      kind: 'files';
      label: string;
      directory: string;
      names: string[];
      pick: number;
      field: TerminalInput;
      fresh: boolean;
      then: (path: string) => void;
    };
interface Entry {
  field: TerminalInput;
  mode: 'LABEL' | 'VALUE' | 'EDIT';
  /** Pointing at cells to put their address into a formula. */
  point: { start: number; anchor: Pos | null; at: Pos } | null;
}
/** The keys, as F1 shows them (and the operator manual repeats them). */
export const HELP = [
  'Arrows        Move the cell pointer     /          Main menu',
  'PgUp/PgDn     Up / down one screen      F1         This help',
  'Tab/Shift+Tab Right / left one screen   F2         Edit the current cell',
  'Home          Cell A1                   F5         Go to a cell',
  'End, arrow    Jump to the next edge     F9         Recalculate',
  'Del           Erase the current cell    Esc        Back up; at READY, quit',
  '',
  'Labels start with a letter or a prefix:  \' left   " right   ^ centre   \\ repeat',
  'Values start with a digit or + - . ( @ # $     e.g.  +B4*2   @SUM(B4..B9)',
  'While typing a formula after an operator, arrows point at cells;',
  '. anchors a range.  Functions: @SUM @AVG @COUNT @MIN @MAX @IF @ROUND',
  '@ABS @INT @SQRT @MOD @DATE @TIME @NOW @LEFT @RIGHT @LENGTH @UPPER @STRING',
];
const pointable = (text: string) => /([-+*/^(,=<>&]|\.\.|#(AND|OR|NOT)#)$/i.test(text);
const same = (a: Pos, b: Pos) => a.col === b.col && a.row === b.row;
/** CALCPLAN 2.3: the spreadsheet, with 1-2-3's control panel, slash menus and keys. */
export class CalcPlanProgram implements Program {
  private sheet: Sheet;
  private path: string | null = null;
  private directory: string;
  private dirty = false;
  private at: Pos = { col: 0, row: 0 };
  private view: Pos = { col: 0, row: 0 };
  private entry: Entry | null = null;
  private menu: MenuState | null = null;
  private prompt: Prompt | null = null;
  private error: string | null = null;
  private end = false;
  private page: 'sheet' | 'help' | 'status' | 'list' = 'sheet';
  private listing: { names: string[]; pick: number } | null = null;
  private found: { matches: Pos[]; index: number } | null = null;
  private revision = 0;
  /** Rows the file kept hidden; showing one is something the operator has now seen. */
  private secret = new Set<number>();
  constructor(
    private system: ProgramSystem,
    path: string | null,
  ) {
    this.sheet = new Sheet(this.clock);
    this.directory = system.stat('C:\\SHEETS')?.dir ? 'C:\\SHEETS' : system.cwd;
    if (path) {
      this.directory = parent(path);
      this.retrieve(path, true);
    }
  }
  private clock = () => {
    const now = this.system.now();
    const [mm, dd, yy] = now.date.split('-').map(Number);
    const [h, m, s] = now.time.split(':').map(Number);
    return dateSerial(1900 + yy, mm, dd) + (h * 3600 + m * 60 + s) / 86400;
  };
  frame() {
    // A cell the other one fills in by herself, two rows under the last one used.
    const whisper = this.system.whisper?.();
    if (whisper) {
      this.sheet.set(0, this.sheet.bounds().r2 + 2, "'" + whisper);
      this.revision++;
    }
    return `${this.revision}:${this.system.now().time.slice(0, 5)}`;
  }

  // ----- files -----
  private retrieve(path: string, fresh = false) {
    const result = this.system.read(path);
    if (result === 'missing') {
      if (fresh) this.path = path;
      else this.fail('File does not exist');
      return;
    }
    if (result === 'denied') return this.fail('Access denied');
    if (result === 'damaged') return this.fail('Disk error');
    if (result.entry.kind !== 'sheet') return this.fail('Not a worksheet file');
    if (!fresh) this.system.disk();
    this.sheet = Sheet.parse(result.entry.content, this.clock);
    this.sheet.recalc();
    this.secret = new Set(this.sheet.hiddenRows);
    this.path = path;
    this.directory = parent(path);
    this.dirty = false;
    this.at = { col: 0, row: 0 };
    this.view = { col: 0, row: 0 };
    this.settle();
  }
  private save(path: string) {
    const result = this.system.write(path, this.sheet.serialize(), 'sheet');
    if (result !== 'ok')
      return this.fail(result === 'denied' ? 'Access denied' : 'Cannot create file');
    this.system.disk();
    this.system.cue('saved');
    this.path = path;
    this.directory = parent(path);
    this.dirty = false;
  }
  /** A typed file name, relative to the current directory, with a default extension. */
  private fileName(text: string, extension: string) {
    const path = resolvePath(this.directory, text);
    if (!path) return null;
    return baseName(path).includes('.') ? path : path + extension;
  }
  private worksheets(directory: string) {
    return this.system.list(directory, '*.WK1').sort();
  }

  // ----- helpers -----
  private fail(message: string) {
    this.error = message;
    // A refusal (the disk, the printer) sounds harder than a mistyped key.
    if (/denied|Cannot|printer|Printer/.test(message)) this.system.cue('denied');
    else this.system.beep();
  }
  private changed() {
    this.sheet.recalc();
    this.dirty = true;
  }
  private hiddenRow(row: number) {
    return (
      this.sheet.hiddenRows.has(row) &&
      !(this.prompt?.kind === 'range' && this.prompt.reveal === 'row')
    );
  }
  private hiddenColumn(col: number) {
    return (
      this.sheet.hiddenColumns.has(col) &&
      !(this.prompt?.kind === 'range' && this.prompt.reveal === 'col')
    );
  }
  private columnWidth(col: number) {
    return this.hiddenColumn(col) ? 0 : (this.sheet.widths.get(col) ?? this.sheet.globalWidth);
  }
  /** One cell over, skipping hidden rows and columns; stays put at the edge. */
  private step(pos: Pos, dc: number, dr: number, count = 1): Pos {
    let { col, row } = pos;
    for (let n = 0; n < count; n++) {
      let c = col + dc;
      let r = row + dr;
      const hidden = () => (dc !== 0 && this.hiddenColumn(c)) || (dr !== 0 && this.hiddenRow(r));
      while (c >= 0 && c < COLUMNS && r >= 0 && r < ROWS && hidden()) {
        c += dc;
        r += dr;
      }
      if (c < 0 || c >= COLUMNS || r < 0 || r >= ROWS) break;
      col = c;
      row = r;
    }
    return { col, row };
  }
  /** End + arrow: to the far side of a block of entries, or to the next entry. */
  private jump(pos: Pos, dc: number, dr: number): Pos {
    const filled = (p: Pos) => !!this.sheet.get(p.col, p.row)?.input;
    let next = this.step(pos, dc, dr);
    if (same(next, pos)) return pos;
    const inside = filled(pos) && filled(next);
    for (;;) {
      if (!inside && filled(next)) return next;
      const after = this.step(next, dc, dr);
      if (same(after, next) || (inside && !filled(after))) return next;
      next = after;
    }
  }
  /** Moves the given position for a cursor key; returns false for other keys. */
  private moveKey(event: KeyEvent, pos: Pos, set: (pos: Pos) => void): boolean {
    const { key, ctrl, shift } = event;
    if (key === 'End' && !ctrl) {
      this.end = !this.end;
      return true;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    let next: Pos | null = null;
    if (key in arrows && !ctrl) {
      const [dc, dr] = arrows[key];
      next = this.end ? this.jump(pos, dc, dr) : this.step(pos, dc, dr);
    } else if (key === 'Home') {
      const bounds = this.sheet.bounds();
      next = this.end
        ? { col: bounds.c2, row: bounds.r2 }
        : {
            col: this.step({ col: -1, row: 0 }, 1, 0).col,
            row: this.step({ col: 0, row: -1 }, 0, 1).row,
          };
    } else if (key === 'PageDown' || key === 'PageUp') {
      const dr = key === 'PageDown' ? 1 : -1;
      next = this.step(pos, 0, dr, SHOWN);
      this.view = this.step(this.view, 0, dr, SHOWN);
    } else if (key === 'Tab' || ((key === 'ArrowRight' || key === 'ArrowLeft') && ctrl)) {
      const dc = (key === 'Tab' && shift) || key === 'ArrowLeft' ? -1 : 1;
      const count = Math.max(1, this.columns().length);
      next = this.step(pos, dc, 0, count);
      this.view = this.step(this.view, dc, 0, count);
    }
    if (!next) return false;
    this.end = false;
    set(next);
    this.scrollTo(next);
    return true;
  }
  /** Columns that fit on screen from the left edge of the view. */
  private columns(): number[] {
    const shown: number[] = [];
    let used = 0;
    for (let col = this.view.col; col < COLUMNS; col++) {
      const width = this.columnWidth(col);
      if (!width) continue;
      if (used + width > AREA && shown.length) break;
      shown.push(col);
      used += width;
    }
    return shown;
  }
  private rows(): number[] {
    const shown: number[] = [];
    for (let row = this.view.row; row < ROWS && shown.length < SHOWN; row++)
      if (!this.hiddenRow(row)) shown.push(row);
    return shown;
  }
  /** Scrolls the view the least needed to show a cell. */
  private scrollTo(pos: Pos) {
    if (pos.row < this.view.row) this.view.row = pos.row;
    else if (!this.rows().includes(pos.row)) {
      let row = pos.row;
      for (let count = 1; count < SHOWN && row > 0;) {
        row--;
        if (!this.hiddenRow(row)) count++;
      }
      this.view.row = row;
    }
    if (pos.col < this.view.col) this.view.col = pos.col;
    else if (!this.columns().includes(pos.col)) {
      let col = pos.col;
      let used = this.columnWidth(col);
      while (col > 0 && used + this.columnWidth(col - 1) <= AREA) used += this.columnWidth(--col);
      this.view.col = col;
    }
  }
  /** Moves the pointer off a hidden row or column after hiding it. */
  private settle() {
    if (this.hiddenRow(this.at.row)) {
      const down = this.step(this.at, 0, 1);
      this.at = down.row !== this.at.row ? down : this.step(this.at, 0, -1);
    }
    if (this.hiddenColumn(this.at.col)) {
      const right = this.step(this.at, 1, 0);
      this.at = right.col !== this.at.col ? right : this.step(this.at, -1, 0);
    }
    this.scrollTo(this.at);
  }

  // ----- prompts -----
  private ask(label: string, value: string, then: (value: string) => void, fresh = !!value) {
    const field = new TerminalInput();
    field.insert(value, 240);
    this.prompt = { kind: 'text', label, field, fresh, then };
  }
  private askRange(
    label: string,
    then: (range: Range) => void,
    options: { anchored?: boolean; preset?: Range; reveal?: 'row' | 'col' } = {},
  ) {
    const origin = { ...this.at };
    let anchor: Pos | null = options.anchored === false ? null : { ...origin };
    if (options.preset) {
      anchor = { col: options.preset.c1, row: options.preset.r1 };
      this.at = { col: options.preset.c2, row: options.preset.r2 };
    }
    this.prompt = {
      kind: 'range',
      label,
      anchor,
      origin,
      field: null,
      reveal: options.reveal,
      then,
    };
    this.scrollTo(this.at);
  }
  private askFile(label: string, then: (path: string) => void) {
    const names = this.worksheets(this.directory);
    const field = new TerminalInput();
    field.insert(join(this.directory, '*.WK1'), 240);
    this.prompt = {
      kind: 'files',
      label,
      directory: this.directory,
      names,
      pick: 0,
      field,
      fresh: true,
      then,
    };
  }
  private cancel() {
    if (this.prompt?.kind === 'range') {
      this.at = this.prompt.origin;
      this.scrollTo(this.at);
    }
    this.prompt = null;
  }
  private promptKey(event: KeyEvent) {
    const prompt = this.prompt!;
    const { key, ctrl, alt } = event;
    const typed = key.length === 1 && !ctrl && !alt;
    const edit = (field: TerminalInput, fresh: boolean) => {
      if (typed) {
        if (fresh) field.reset();
        field.insert(key, 240);
        return true;
      }
      if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        field.key(key);
        return true;
      }
      return false;
    };
    if (prompt.kind === 'text') {
      if (key === 'Enter') {
        this.prompt = null;
        prompt.then(prompt.field.value.trim());
      } else if (key === 'Escape') this.cancel();
      else if (edit(prompt.field, prompt.fresh)) prompt.fresh = false;
      return;
    }
    if (prompt.kind === 'files') {
      if (key === 'Enter') {
        const text = prompt.field.value.trim();
        this.prompt = null;
        if (!prompt.fresh && text && !/[*?]/.test(text)) {
          const path = this.fileName(text, '.WK1');
          return path ? prompt.then(path) : this.fail('Invalid file name');
        }
        const name = prompt.names[prompt.pick];
        return name ? prompt.then(join(prompt.directory, name)) : this.fail('No worksheet files');
      }
      if (key === 'Escape') return this.cancel();
      const count = prompt.names.length;
      if (count && (key === 'ArrowRight' || key === 'ArrowDown') && prompt.fresh)
        prompt.pick = (prompt.pick + 1) % count;
      else if (count && (key === 'ArrowLeft' || key === 'ArrowUp') && prompt.fresh)
        prompt.pick = (prompt.pick + count - 1) % count;
      else if (edit(prompt.field, prompt.fresh)) prompt.fresh = false;
      return;
    }
    if (prompt.field) {
      if (key === 'Enter') {
        const range = parseRange(prompt.field.value);
        if (!range) return this.fail('Invalid cell or range address');
        this.cancel();
        return prompt.then(range);
      }
      if (key === 'Escape') prompt.field = null;
      else edit(prompt.field, false);
      return;
    }
    if (this.moveKey(event, this.at, (pos) => (this.at = pos))) return;
    if (key === 'Enter') {
      const range = prompt.anchor ? span(prompt.anchor, this.at) : span(this.at, this.at);
      this.cancel();
      return prompt.then(range);
    }
    if (key === '.') {
      prompt.anchor ??= { ...this.at };
      return;
    }
    if (key === 'Escape' || key === 'Backspace') {
      if (!prompt.anchor) return this.cancel();
      this.at = key === 'Escape' ? prompt.anchor : prompt.origin;
      prompt.anchor = null;
      return this.scrollTo(this.at);
    }
    if (typed && /[A-Z0-9$]/i.test(key)) {
      prompt.field = new TerminalInput();
      prompt.field.insert(key);
    }
  }

  // ----- menus -----
  private openMenu(items = this.mainMenu(), mode?: 'FIND') {
    this.menu = { items, pick: 0, back: [], mode };
    this.system.cue('menu-open');
  }
  private menuKey(event: KeyEvent) {
    const menu = this.menu!;
    const { key } = event;
    const count = menu.items.length;
    const pick = menu.pick;
    if (key === 'ArrowRight' || key === 'ArrowDown') menu.pick = (menu.pick + 1) % count;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') menu.pick = (menu.pick + count - 1) % count;
    else if (key === 'Home') menu.pick = 0;
    else if (key === 'End') menu.pick = count - 1;
    else if (key === 'Enter') this.choose(menu.items[menu.pick]);
    else if (key === 'Escape') {
      const back = menu.back.pop();
      this.system.cue('menu-close');
      if (back) Object.assign(menu, back);
      else this.menu = null;
    } else if (key.length === 1 && !event.ctrl && !event.alt) {
      const item = menu.items.find((i) => i.name[0].toUpperCase() === key.toUpperCase());
      if (item) this.choose(item);
    }
    const moving = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(key);
    if (moving && menu.pick !== pick) this.system.cue('menu-move');
  }
  private choose(item: MenuItem) {
    const menu = this.menu!;
    if (item.items) {
      menu.back.push({ items: menu.items, pick: menu.pick });
      menu.items = item.items();
      menu.pick = 0;
      this.system.cue('menu-open');
      return;
    }
    this.menu = null;
    this.system.cue('menu-close');
    item.run?.();
  }
  private confirm(question: string, then: () => void): MenuItem[] {
    return [
      { name: 'No', help: question, run: () => undefined },
      { name: 'Yes', help: question, run: then },
    ];
  }
  /** Asks again before throwing away unsaved changes. */
  private discard(verb: string, then: () => void) {
    if (!this.dirty) return then();
    this.openMenu(this.confirm(`WORKSHEET CHANGES NOT SAVED! ${verb} anyway?`, then));
  }
  private mainMenu(): MenuItem[] {
    return [
      { name: 'Worksheet', items: () => this.worksheetMenu() },
      { name: 'Range', items: () => this.rangeMenu() },
      {
        name: 'Copy',
        help: 'Copy a cell or range of cells',
        run: () =>
          this.askRange('Enter range to copy FROM:', (from) =>
            this.askRange(
              'Enter range to copy TO:',
              (to) => {
                this.sheet.copy(from, to);
                this.changed();
              },
              { anchored: false },
            ),
          ),
      },
      {
        name: 'Move',
        help: 'Move a cell or range of cells',
        run: () =>
          this.askRange('Enter range to move FROM:', (from) =>
            this.askRange(
              'Enter range to move TO:',
              (to) => {
                this.sheet.move(from, { col: to.c1, row: to.r1 });
                this.changed();
              },
              { anchored: false },
            ),
          ),
      },
      { name: 'File', items: () => this.fileMenu() },
      { name: 'Print', items: () => this.printMenu() },
      {
        name: 'Graph',
        help: 'Create a graph',
        run: () => this.fail('Graphics display not available on this terminal'),
      },
      {
        name: 'Quit',
        help: 'End the CALCPLAN session',
        items: () =>
          this.confirm('End CALCPLAN and return to DOS?', () =>
            this.discard('End CALCPLAN', () => this.system.exit()),
          ),
      },
    ];
  }
  private formatMenu(apply: (format: string | undefined) => void, global = false): MenuItem[] {
    const decimals = (letter: string) => () =>
      this.ask('Enter number of decimal places (0..15):', '2', (text) => {
        if (!/^\d{1,2}$/.test(text) || Number(text) > 15)
          return this.fail('Invalid number of decimal places');
        apply(letter + Number(text));
      });
    const dates: MenuItem[] = [
      { name: '1', help: 'Lotus standard long form (DD-MMM-YY)', run: () => apply('D1') },
      { name: '2', help: 'Lotus standard short form (DD-MMM)', run: () => apply('D2') },
      { name: '3', help: 'Month and year (MMM-YY)', run: () => apply('D3') },
      { name: '4', help: 'Full international date (MM/DD/YY)', run: () => apply('D4') },
      { name: '5', help: 'Partial international date (MM/DD)', run: () => apply('D5') },
      {
        name: 'Time',
        items: () => [
          { name: '1', help: '(HH:MM:SS AM/PM)', run: () => apply('D6') },
          { name: '2', help: '(HH:MM AM/PM)', run: () => apply('D7') },
          { name: '3', help: 'Full international time (HH:MM:SS 24-hour)', run: () => apply('D8') },
          { name: '4', help: 'Partial international time (HH:MM 24-hour)', run: () => apply('D9') },
        ],
      },
    ];
    const items: MenuItem[] = [
      { name: 'Fixed', help: 'Fixed number of decimal places (x.xx)', run: decimals('F') },
      { name: 'Sci', help: 'Exponential format (x.xxE+xx)', run: decimals('S') },
      { name: 'Currency', help: 'Currency format ($x,xxx.xx)', run: decimals('C') },
      { name: ',', help: 'Comma format (x,xxx.xx)', run: decimals(',') },
      { name: 'General', help: 'Standard format (x.xx or x.xxE+xx)', run: () => apply('G') },
      { name: '+/-', help: 'Horizontal bar graph format (+++ or ---)', run: () => apply('+') },
      { name: 'Percent', help: 'Percent format (x.xx%)', run: decimals('P') },
      { name: 'Date', items: () => dates },
      { name: 'Text', help: 'Display formulas instead of their values', run: () => apply('T') },
      { name: 'Hidden', help: 'Do not display cell contents', run: () => apply('H') },
    ];
    if (!global)
      items.push({
        name: 'Reset',
        help: 'Return cells to the global format',
        run: () => apply(undefined),
      });
    return items;
  }
  private worksheetMenu(): MenuItem[] {
    const lines = (axis: 'row' | 'col', insert: boolean) => () =>
      this.askRange(
        insert
          ? `Enter ${axis === 'row' ? 'row' : 'column'} insert range:`
          : `Enter range of ${axis === 'row' ? 'rows' : 'columns'} to delete:`,
        (range) => {
          const at = axis === 'row' ? range.r1 : range.c1;
          const count = axis === 'row' ? range.r2 - range.r1 + 1 : range.c2 - range.c1 + 1;
          this.sheet.shift(axis, at, insert ? count : -count);
          this.changed();
          this.settle();
        },
      );
    const hide = (axis: 'row' | 'col', show: boolean) => () =>
      this.askRange(
        show
          ? `Specify hidden ${axis === 'row' ? 'rows' : 'columns'} to redisplay:`
          : `Specify ${axis === 'row' ? 'rows' : 'columns'} to hide:`,
        (range) => {
          const set = axis === 'row' ? this.sheet.hiddenRows : this.sheet.hiddenColumns;
          const [from, to] = axis === 'row' ? [range.r1, range.r2] : [range.c1, range.c2];
          for (let n = from; n <= to; n++) {
            if (show) set.delete(n);
            else set.add(n);
          }
          this.dirty = true;
          this.settle();
        },
        { reveal: show ? axis : undefined },
      );
    const prefixes = (apply: (prefix: string) => void): MenuItem[] => [
      { name: 'Left', help: 'Left-align labels', run: () => apply("'") },
      { name: 'Right', help: 'Right-align labels', run: () => apply('"') },
      { name: 'Center', help: 'Center labels', run: () => apply('^') },
    ];
    const width = (current: number, apply: (width: number) => void) => () =>
      this.ask(`Enter column width (1..${MAX_WIDTH}):`, String(current), (text) => {
        const value = Number(text);
        if (!/^\d+$/.test(text) || value < 1 || value > MAX_WIDTH)
          return this.fail('Invalid column width');
        apply(value);
      });
    return [
      {
        name: 'Global',
        items: () => [
          {
            name: 'Format',
            items: () =>
              this.formatMenu((format) => {
                this.sheet.globalFormat = format ?? 'G';
                this.changed();
              }, true),
          },
          {
            name: 'Label-Prefix',
            items: () =>
              prefixes((prefix) => {
                this.sheet.labelPrefix = prefix;
                this.dirty = true;
              }),
          },
          {
            name: 'Column-Width',
            help: 'Set the width of every column without its own width',
            run: width(this.sheet.globalWidth, (value) => {
              this.sheet.globalWidth = value;
              this.dirty = true;
            }),
          },
        ],
      },
      {
        name: 'Insert',
        items: () => [
          { name: 'Column', help: 'Insert one or more blank columns', run: lines('col', true) },
          { name: 'Row', help: 'Insert one or more blank rows', run: lines('row', true) },
        ],
      },
      {
        name: 'Delete',
        items: () => [
          { name: 'Column', help: 'Delete one or more columns', run: lines('col', false) },
          { name: 'Row', help: 'Delete one or more rows', run: lines('row', false) },
        ],
      },
      {
        name: 'Column',
        items: () => [
          {
            name: 'Set-Width',
            help: 'Specify the width of the current column',
            run: width(this.columnWidth(this.at.col), (value) => {
              this.sheet.widths.set(this.at.col, value);
              this.dirty = true;
              this.scrollTo(this.at);
            }),
          },
          {
            name: 'Reset-Width',
            help: 'Return the current column to the global width',
            run: () => {
              this.sheet.widths.delete(this.at.col);
              this.dirty = true;
            },
          },
          { name: 'Hide', help: 'Hide one or more columns', run: hide('col', false) },
          { name: 'Display', help: 'Redisplay hidden columns', run: hide('col', true) },
        ],
      },
      {
        name: 'Row',
        items: () => [
          { name: 'Hide', help: 'Hide one or more rows', run: hide('row', false) },
          { name: 'Display', help: 'Redisplay hidden rows', run: hide('row', true) },
        ],
      },
      {
        name: 'Erase',
        items: () =>
          this.confirm('Erase the entire worksheet from memory?', () =>
            this.discard('Erase worksheet', () => {
              this.sheet = new Sheet(this.clock);
              this.path = null;
              this.dirty = false;
              this.at = { col: 0, row: 0 };
              this.view = { col: 0, row: 0 };
            }),
          ),
      },
      { name: 'Status', help: 'Display worksheet settings', run: () => (this.page = 'status') },
    ];
  }
  private rangeMenu(): MenuItem[] {
    return [
      {
        name: 'Format',
        items: () =>
          this.formatMenu((format) =>
            this.askRange('Enter range to format:', (range) => {
              this.sheet.setFormat(range, format);
              this.changed();
            }),
          ),
      },
      {
        name: 'Label',
        items: () =>
          (['Left', 'Right', 'Center'] as const).map((name, n) => ({
            name,
            help: `${name === 'Center' ? 'Center' : name + '-align'} labels in a range`,
            run: () =>
              this.askRange('Enter range of labels:', (range) => {
                this.sheet.each(range, (cell, col, row) => {
                  if (cell && cellKind(cell.input) === 'label')
                    this.sheet.set(col, row, `'"^`[n] + cell.input.slice(1));
                });
                this.changed();
              }),
          })),
      },
      {
        name: 'Erase',
        help: 'Erase a cell or range of cells',
        run: () =>
          this.askRange('Enter range to erase:', (range) => {
            this.sheet.erase(range);
            this.changed();
          }),
      },
      {
        name: 'Search',
        help: 'Find a string in labels or formulas',
        run: () =>
          this.askRange(
            'Enter range to search:',
            (range) =>
              this.ask('Enter string to search for:', '', (needle) => {
                if (!needle) return;
                const where = (labels: boolean, formulas: boolean) => () =>
                  this.search(range, needle, labels, formulas);
                this.openMenu([
                  { name: 'Formulas', help: 'Search formulas only', run: where(false, true) },
                  { name: 'Labels', help: 'Search labels only', run: where(true, false) },
                  { name: 'Both', help: 'Search labels and formulas', run: where(true, true) },
                ]);
              }),
            { preset: this.sheet.bounds() },
          ),
      },
      {
        name: 'Value',
        help: 'Copy a range, converting formulas to their current values',
        run: () =>
          this.askRange('Enter range to copy FROM:', (from) =>
            this.askRange(
              'Enter range to copy TO:',
              (to) => {
                this.sheet.copy(from, to, true);
                this.changed();
              },
              { anchored: false },
            ),
          ),
      },
    ];
  }
  private search(range: Range, needle: string, labels: boolean, formulas: boolean) {
    const matches: Pos[] = [];
    const wanted = needle.toUpperCase();
    this.sheet.each(range, (cell, col, row) => {
      if (!cell?.input || this.hiddenRow(row) || this.hiddenColumn(col)) return;
      const kind = cellKind(cell.input);
      const text =
        kind === 'label' && labels
          ? cell.input.slice(1)
          : kind === 'formula' && formulas
            ? cell.input
            : '';
      if (text.toUpperCase().includes(wanted)) matches.push({ col, row });
    });
    if (!matches.length) return this.fail('No matching strings found');
    this.found = { matches, index: 0 };
    this.showFound();
  }
  private showFound() {
    const found = this.found!;
    this.at = found.matches[found.index];
    this.scrollTo(this.at);
    this.openMenu(
      [
        {
          name: 'Next',
          help: 'Find the next matching string',
          run: () => {
            if (found.index + 1 >= found.matches.length)
              return this.fail('No more matching strings');
            found.index++;
            this.showFound();
          },
        },
        { name: 'Quit', help: 'End the search', run: () => undefined },
      ],
      'FIND',
    );
  }
  private fileMenu(): MenuItem[] {
    return [
      {
        name: 'Retrieve',
        help: 'Erase the current worksheet and display the selected worksheet',
        run: () =>
          this.discard('Retrieve file', () =>
            this.askFile('Name of file to retrieve:', (path) => this.retrieve(path)),
          ),
      },
      {
        name: 'Save',
        help: 'Store the entire worksheet in a worksheet file',
        run: () =>
          this.ask(
            'Enter name of file to save:',
            this.path ?? join(this.directory, ''),
            (text) => {
              const path = text && this.fileName(text, '.WK1');
              if (!path) return this.fail('Invalid file name');
              if (!this.system.stat(path)) return this.save(path);
              this.openMenu([
                {
                  name: 'Cancel',
                  help: 'Cancel command -- do not save worksheet',
                  run: () => undefined,
                },
                {
                  name: 'Replace',
                  help: 'Replace the existing file on disk',
                  run: () => this.save(path),
                },
                {
                  name: 'Backup',
                  help: 'Rename the existing file with a .BAK extension and save',
                  run: () => {
                    const old = this.system.read(path);
                    if (typeof old === 'object')
                      this.system.write(
                        path.replace(/\.[^.\\]*$/, '') + '.BAK',
                        old.entry.content,
                        'sheet',
                      );
                    this.save(path);
                  },
                },
              ]);
            },
            !!this.path,
          ),
      },
      {
        name: 'List',
        help: 'Display the names of worksheet files in the current directory',
        run: () => {
          this.listing = { names: this.worksheets(this.directory), pick: 0 };
          this.page = 'list';
        },
      },
      {
        name: 'Directory',
        help: 'Display and/or set the current directory',
        run: () =>
          this.ask('Enter current directory:', this.directory, (text) => {
            const path = text && resolvePath(this.directory, text);
            if (!path || !this.system.stat(path)?.dir) return this.fail('Directory does not exist');
            this.directory = path;
          }),
      },
    ];
  }
  private printMenu(): MenuItem[] {
    return [
      {
        name: 'Printer',
        help: 'Send print output directly to a printer',
        run: () => this.fail('Printer error: LPT1 not responding'),
      },
      {
        name: 'File',
        help: 'Send print output to a text file (.PRN)',
        run: () =>
          this.ask('Enter print file name:', '', (text) => {
            const path = text && this.fileName(text, '.PRN');
            if (!path) return this.fail('Invalid file name');
            this.askRange('Enter print range:', (range) => this.printTo(path, range), {
              preset: this.sheet.bounds(),
            });
          }),
      },
    ];
  }
  /** Writes a range as the screen shows it (hidden rows and columns left out). */
  private printTo(path: string, range: Range) {
    const lines: string[] = [];
    for (let row = range.r1; row <= range.r2; row++) {
      if (this.sheet.hiddenRows.has(row)) continue;
      let line = '';
      let spill = '';
      for (let col = range.c1; col <= range.c2; col++) {
        const width = this.sheet.width(col);
        if (!width) continue;
        const shown = this.cellText(col, row, width, spill);
        line += shown.text;
        spill = shown.spill;
      }
      lines.push(line.trimEnd());
    }
    const result = this.system.write(path, lines.join('\n') + '\n', 'text');
    if (result !== 'ok') return this.fail('Cannot create file');
    this.system.disk();
  }
  /** A cell's text, or the part of a long label from the left that runs over it. */
  private cellText(col: number, row: number, width: number, spill: string) {
    const cell = this.sheet.get(col, row);
    if (spill && !cell?.input)
      return { text: spill.slice(0, width).padEnd(width), spill: spill.slice(width) };
    return this.sheet.display(col, row, width);
  }

  // ----- keys -----
  key(event: KeyEvent) {
    this.revision++;
    if (this.error) {
      this.error = null;
      return true;
    }
    if (this.page !== 'sheet') {
      this.pageKey(event);
      return true;
    }
    if (this.menu) this.menuKey(event);
    else if (this.prompt) this.promptKey(event);
    else if (this.entry) this.entryKey(event);
    else return this.readyKey(event);
    return true;
  }
  private pageKey(event: KeyEvent) {
    const listing = this.listing;
    if (this.page === 'list' && listing && listing.names.length) {
      const count = listing.names.length;
      const moves: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: 5,
        ArrowUp: -5,
      };
      if (event.key in moves) {
        listing.pick = Math.max(0, Math.min(count - 1, listing.pick + moves[event.key]));
        return;
      }
    }
    this.page = 'sheet';
  }
  private readyKey(event: KeyEvent) {
    const { key, ctrl, alt } = event;
    if (this.moveKey(event, this.at, (pos) => (this.at = pos))) return true;
    this.end = false;
    switch (key) {
      case '/':
      case '<':
        this.openMenu();
        return true;
      case 'F1':
        this.page = 'help';
        return true;
      case 'Escape':
        // Esc at READY asks to leave, as /Quit does.
        this.openMenu(
          this.confirm('End CALCPLAN and return to DOS?', () =>
            this.discard('End CALCPLAN', () => this.system.exit()),
          ),
        );
        return true;
      case 'F2': {
        const field = new TerminalInput();
        field.insert(this.sheet.get(this.at.col, this.at.row)?.input ?? '', 240);
        this.entry = { field, mode: 'EDIT', point: null };
        return true;
      }
      case 'F5':
        this.ask('Enter address to go to:', address(this.at.col, this.at.row), (text) => {
          const ref = parseRef(text);
          if (!ref) return this.fail('Invalid cell or range address');
          this.at = { col: ref.col, row: ref.row };
          this.settle();
        });
        return true;
      case 'F9':
        this.sheet.recalc();
        return true;
      case 'Delete':
        if (this.sheet.get(this.at.col, this.at.row)?.input) {
          this.sheet.erase(span(this.at, this.at));
          this.changed();
        }
        return true;
    }
    if (key.length === 1 && !ctrl && !alt) {
      const field = new TerminalInput();
      field.insert(key);
      this.entry = { field, mode: VALUE_STARTS.includes(key) ? 'VALUE' : 'LABEL', point: null };
      return true;
    }
    return key !== 'Escape' && key !== 'Enter' ? false : true;
  }
  /** Stores the entry in the current cell; a bad formula beeps and goes to EDIT mode. */
  private commit(): boolean {
    const entry = this.entry!;
    const text = entry.field.value;
    const first = text[0];
    let input: string | null;
    if (!text.trim()) input = '';
    else if (LABEL_PREFIXES.includes(first)) input = text;
    else if (VALUE_STARTS.includes(first)) input = valueEntry(text.trim());
    else input = this.sheet.labelPrefix + text;
    if (input === null) {
      this.system.beep();
      entry.mode = 'EDIT';
      entry.field.cursor = entry.field.value.length;
      return false;
    }
    this.entry = null;
    if (!text.trim() && entry.mode !== 'EDIT') return true;
    this.sheet.set(this.at.col, this.at.row, input);
    this.changed();
    return true;
  }
  private entryKey(event: KeyEvent) {
    const entry = this.entry!;
    const { key, ctrl, alt } = event;
    if (entry.point) return this.pointKey(event);
    const moving =
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Tab'].includes(key) ||
      (entry.mode !== 'EDIT' && (key === 'ArrowLeft' || key === 'ArrowRight'));
    if (moving) {
      if (entry.mode === 'VALUE' && pointable(entry.field.value) && key.startsWith('Arrow')) {
        entry.point = { start: entry.field.value.length, anchor: null, at: { ...this.at } };
        return this.pointKey(event);
      }
      if (this.commit()) this.moveKey(event, this.at, (pos) => (this.at = pos));
      return;
    }
    if (key === 'Enter') this.commit();
    else if (key === 'Escape') {
      if (entry.field.value) entry.field.reset();
      else this.entry = null;
    } else if (key === 'F2')
      entry.mode =
        entry.mode !== 'EDIT'
          ? 'EDIT'
          : VALUE_STARTS.includes(entry.field.value[0] ?? '')
            ? 'VALUE'
            : 'LABEL';
    else if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key))
      entry.field.key(key);
    else if (key.length === 1 && !ctrl && !alt) entry.field.insert(key, 240);
  }
  private pointKey(event: KeyEvent) {
    const entry = this.entry!;
    const point = entry.point!;
    const { key, ctrl, alt } = event;
    const text = () => {
      entry.field.value =
        entry.field.value.slice(0, point.start) +
        (point.anchor
          ? rangeText(span(point.anchor, point.at))
          : address(point.at.col, point.at.row));
      entry.field.cursor = entry.field.value.length;
    };
    const stop = (keep: boolean) => {
      if (!keep) {
        entry.field.value = entry.field.value.slice(0, point.start);
        entry.field.cursor = entry.field.value.length;
      }
      entry.point = null;
      this.scrollTo(this.at);
    };
    if (this.moveKey(event, point.at, (pos) => (point.at = pos))) return text();
    if (key === '.') {
      point.anchor ??= { ...point.at };
      return text();
    }
    if (key === 'Escape') {
      if (!point.anchor) return stop(false);
      point.anchor = null;
      return text();
    }
    if (key === 'Backspace') return stop(false);
    if (key === 'Enter') {
      stop(true);
      this.commit();
      return;
    }
    if (key.length === 1 && !ctrl && !alt) {
      stop(true);
      entry.field.insert(key, 240);
    }
  }
  paste(text: string) {
    this.revision++;
    const line = text.replace(/\r?\n[\s\S]*$/, '');
    if (!line) return false;
    const field =
      this.prompt?.kind === 'text' || this.prompt?.kind === 'files'
        ? this.prompt.field
        : this.prompt?.kind === 'range'
          ? this.prompt.field
          : this.entry?.field;
    if (field) {
      if (this.prompt && 'fresh' in this.prompt && this.prompt.fresh) {
        field.reset();
        this.prompt.fresh = false;
      }
      field.insert(line, 240);
      return true;
    }
    if (this.menu || this.prompt || this.page !== 'sheet') return false;
    const entry = new TerminalInput();
    entry.insert(line, 240);
    this.entry = {
      field: entry,
      mode: VALUE_STARTS.includes(line[0]) ? 'VALUE' : 'LABEL',
      point: null,
    };
    return true;
  }

  // ----- screen -----
  private get mode(): string {
    if (this.error) return 'ERROR';
    if (this.page === 'help') return 'HELP';
    if (this.page === 'status') return 'STAT';
    if (this.page === 'list') return 'FILES';
    if (this.menu) return this.menu.mode ?? 'MENU';
    if (this.prompt?.kind === 'range') return this.prompt.field ? 'EDIT' : 'POINT';
    if (this.prompt) return this.prompt.kind === 'files' ? 'FILES' : 'EDIT';
    if (this.entry) return this.entry.point ? 'POINT' : this.entry.mode;
    return 'READY';
  }
  render(screen: Screen) {
    screen.clear();
    screen.put(80 - 7, 0, ' ' + this.mode.padEnd(5) + ' ', {
      inverse: true,
      blink: this.mode === 'ERROR',
    });
    if (this.page === 'help') return this.renderHelp(screen);
    if (this.page === 'status') return this.renderStatus(screen);
    if (this.page === 'list') return this.renderList(screen);
    this.renderPanel(screen);
    this.renderSheet(screen);
    this.renderStatusLine(screen);
  }
  /** Line 1 of the control panel: the cell's address, format, width and contents. */
  private cellLine(pos: Pos) {
    const cell = this.sheet.get(pos.col, pos.row);
    const width = this.sheet.widths.get(pos.col);
    return (
      address(pos.col, pos.row) +
      ': ' +
      (cell?.format ? `(${cell.format}) ` : '') +
      (width ? `[W${width}] ` : '') +
      (cell?.input ?? '')
    );
  }
  private renderPanel(screen: Screen) {
    const pointing = this.entry?.point?.at;
    screen.put(0, 0, this.cellLine(pointing ?? this.at).slice(0, 72));
    const line = (text: string, cursor: number) => {
      const shift = Math.max(0, cursor - 79);
      screen.put(0, 1, text.slice(shift, shift + 80));
      screen.cursor = { x: cursor - shift, y: 1, shape: 'underline' };
    };
    if (this.menu) {
      const menu = this.menu;
      let x = 0;
      menu.items.forEach((item, n) => {
        screen.put(x, 1, item.name, { inverse: n === menu.pick });
        x += item.name.length + 2;
      });
      const item = menu.items[menu.pick];
      const help = item.items
        ? item
            .items()
            .map((i) => i.name)
            .join('  ')
        : (item.help ?? '');
      screen.put(0, 2, help.slice(0, 80));
      return;
    }
    const prompt = this.prompt;
    if (prompt?.kind === 'text') {
      line(prompt.label + ' ' + prompt.field.value, prompt.label.length + 1 + prompt.field.cursor);
    } else if (prompt?.kind === 'range') {
      const value = prompt.field
        ? prompt.field.value
        : prompt.anchor
          ? rangeText(span(prompt.anchor, this.at))
          : address(this.at.col, this.at.row);
      const cursor = prompt.field ? prompt.field.cursor : value.length;
      line(prompt.label + ' ' + value, prompt.label.length + 1 + cursor);
    } else if (prompt?.kind === 'files') {
      line(prompt.label + ' ' + prompt.field.value, prompt.label.length + 1 + prompt.field.cursor);
      const width = 14;
      const first = Math.floor(prompt.pick / 5) * 5;
      prompt.names
        .slice(first, first + 5)
        .forEach((name, n) =>
          screen.put(n * width, 2, name, { inverse: prompt.fresh && first + n === prompt.pick }),
        );
    } else if (this.entry) {
      line(this.entry.field.value, this.entry.field.cursor);
    }
  }
  private highlight(): Range {
    const point = this.entry?.point;
    if (point) return point.anchor ? span(point.anchor, point.at) : span(point.at, point.at);
    if (this.prompt?.kind === 'range' && !this.prompt.field && this.prompt.anchor)
      return span(this.prompt.anchor, this.at);
    return span(this.at, this.at);
  }
  private renderSheet(screen: Screen) {
    const columns = this.columns();
    const rows = this.rows();
    const lit = this.highlight();
    const shows = (hidden: Set<number>, n: number) => (hidden.has(n) ? '*' : '');
    screen.put(0, TOP - 1, ' '.repeat(BORDER), { inverse: true });
    let x = BORDER;
    for (const col of columns) {
      const width = this.columnWidth(col);
      const name = columnName(col) + shows(this.sheet.hiddenColumns, col);
      const left = Math.floor((width - name.length) / 2);
      screen.put(x, TOP - 1, (' '.repeat(Math.max(0, left)) + name).padEnd(width).slice(0, width), {
        inverse: true,
      });
      x += width;
    }
    rows.forEach((row, n) => {
      const y = TOP + n;
      if (this.secret.delete(row) && this.path)
        this.system.note(`revealed:${this.path}:${row + 1}`);
      // Row numbers in plain dim video: a solid inverse column blooms into the cells on a CRT.
      screen.put(0, y, String(row + 1) + shows(this.sheet.hiddenRows, row), { intensity: 0 });
      let x = BORDER;
      let spill = '';
      for (const col of columns) {
        const width = this.columnWidth(col);
        const shown = this.cellText(col, row, width, spill);
        spill = shown.spill;
        screen.put(x, y, shown.text, { inverse: inRange(lit, col, row) });
        x += width;
      }
    });
  }
  private renderStatusLine(screen: Screen) {
    if (this.error) {
      screen.put(0, 24, this.error);
    } else {
      const now = this.system.now();
      const [mm, dd, yy] = now.date.split('-');
      const hour = Number(now.time.slice(0, 2));
      const month = MONTHS.slice((Number(mm) - 1) * 3, Number(mm) * 3);
      screen.put(
        0,
        24,
        `${dd}-${month}-${yy}  ${String(hour % 12 || 12).padStart(2, '0')}:${now.time.slice(3, 5)} ${hour < 12 ? 'AM' : 'PM'}`,
      );
      screen.put(24, 24, '/ Menu   F1 Help   Esc Quit');
    }
    const flags = [this.sheet.circular && 'CIRC', this.end && 'END'].filter(Boolean) as string[];
    let x = 80;
    for (const flag of flags.reverse()) {
      x -= flag.length + 1;
      screen.put(x, 24, flag, { inverse: true });
    }
  }
  private renderHelp(screen: Screen) {
    screen.box(0, 2, 80, HELP.length + 4, 'double');
    screen.put(26, 2, ' CALCPLAN 2.3  KEYBOARD HELP ');
    HELP.forEach((text, n) => screen.put(2, 4 + n, text));
    screen.put(0, 24, 'Press any key to return to the worksheet.');
  }
  private renderStatus(screen: Screen) {
    const sheet = this.sheet;
    const used = sheet.entries().length;
    const lines = [
      'Available memory:',
      `   Conventional...  ${String(262144 - used * 64).padStart(7)} of 262144 Bytes`,
      '',
      'Math co-processor:    (None)',
      '',
      'Recalculation:',
      '   Method.........  Automatic',
      '   Order..........  Natural',
      '',
      `Circular reference:   ${sheet.circular ?? '(None)'}`,
      '',
      'Cell display:',
      `   Format.........  (${sheet.globalFormat})`,
      `   Label prefix...  ${sheet.labelPrefix} (${{ "'": 'left', '"': 'right', '^': 'center' }[sheet.labelPrefix] ?? 'left'})`,
      `   Column width...  ${sheet.globalWidth}`,
      '',
      `File:                 ${this.path ?? '(none)'}`,
    ];
    lines.forEach((text, n) => screen.put(0, 2 + n, text));
    screen.put(0, 24, 'Press any key to return to the worksheet.');
  }
  private renderList(screen: Screen) {
    const listing = this.listing!;
    const name = listing.names[listing.pick];
    if (name) {
      const path = join(this.directory, name);
      const stat = this.system.stat(path);
      screen.put(0, 1, `${path}   ${stat?.date ?? ''} ${stat?.time ?? ''}   ${stat?.size ?? 0}`);
    } else screen.put(0, 1, `${join(this.directory, '*.WK1')}   No worksheet files`);
    listing.names.forEach((file, n) =>
      screen.put((n % 5) * 16, 3 + Math.floor(n / 5), file, { inverse: n === listing.pick }),
    );
    screen.put(0, 24, 'Press Enter to return to the worksheet.');
  }
}
