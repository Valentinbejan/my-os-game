import {
  COLUMNS,
  ERR,
  FormulaError,
  ROWS,
  address,
  columnIndex,
  evaluate,
  inRange,
  isError,
  isNumber,
  normalize,
  offset,
  parseFormula,
  parseRef,
  rewrite,
  type Node,
  type Range,
  type Ref,
  type RefRole,
  type Value,
} from './formula';
export interface Cell {
  /** As typed: a label with its prefix (' " ^ \), a number, or a formula. */
  input: string;
  /**
   * Display format such as F2, C0, P1, D1, T or H; absent for the global format. A blank
   * cell can keep a format for whatever is typed there later.
   */
  format?: string;
}
export const LABEL_PREFIXES = `'"^\\`;
/** First characters that make an entry a value rather than a label. */
export const VALUE_STARTS = '0123456789+-.(@#$';
export const MAX_WIDTH = 72;
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
export type CellKind = 'blank' | 'label' | 'number' | 'formula';
export const cellKind = (input: string): CellKind =>
  !input
    ? 'blank'
    : LABEL_PREFIXES.includes(input[0])
      ? 'label'
      : isNumber(input)
        ? 'number'
        : 'formula';
/**
 * Checks a value entry as 1-2-3 did on Enter: returns the stored text (formulas normalized)
 * or null when the formula does not parse.
 */
export function valueEntry(text: string): string | null {
  if (isNumber(text)) return String(Number(text));
  try {
    parseFormula(text);
    return normalize(text);
  } catch (error) {
    if (error instanceof FormulaError) return null;
    throw error;
  }
}
const key = (col: number, row: number) => row * COLUMNS + col;
const thousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function general(value: number, room: number) {
  if (Number.isInteger(value) && String(value).length <= room) return String(value);
  for (let decimals = Math.min(10, room); decimals >= 0; decimals--) {
    const fixed = value.toFixed(decimals);
    const text = decimals ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
    if (text.length <= room && (Number(text) !== 0 || value === 0)) return text;
  }
  for (let digits = room; digits >= 0; digits--) {
    const text = scientific(value, digits);
    if (text.length <= room) return text;
  }
  return '';
}
const scientific = (value: number, digits: number) =>
  value
    .toExponential(Math.min(15, digits))
    .toUpperCase()
    .replace(/E([-+])(\d)$/, 'E$10$2');
function dateText(serial: number, format: string) {
  const day = Math.floor(serial);
  const date = new Date(Date.UTC(1899, 11, 30) + day * 86_400_000);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const mmm = MONTHS.slice(date.getUTCMonth() * 3, date.getUTCMonth() * 3 + 3);
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const seconds = Math.round((serial - day) * 86400) % 86400;
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  const twelve = String(h % 12 || 12).padStart(2, '0');
  const half = h < 12 ? 'AM' : 'PM';
  switch (format) {
    case 'D1':
      return `${dd}-${mmm}-${yy}`;
    case 'D2':
      return `${dd}-${mmm}`;
    case 'D3':
      return `${mmm}-${yy}`;
    case 'D4':
      return `${mm}/${dd}/${yy}`;
    case 'D5':
      return `${mm}/${dd}`;
    case 'D6':
      return `${twelve}:${m}:${s} ${half}`;
    case 'D7':
      return `${twelve}:${m} ${half}`;
    case 'D8':
      return `${String(h).padStart(2, '0')}:${m}:${s}`;
    default:
      return `${String(h).padStart(2, '0')}:${m}`;
  }
}
/** A number in a display format, or null when the format does not apply. */
export function formatNumber(value: number, format: string, room: number): string {
  const kind = format[0];
  const decimals = Number(format.slice(1)) || 0;
  switch (kind) {
    case 'F':
      return value.toFixed(decimals);
    case 'S':
      return scientific(value, decimals);
    case ',':
    case 'C': {
      const [whole, fraction] = Math.abs(value).toFixed(decimals).split('.');
      const body = (kind === 'C' ? '$' : '') + thousands(whole) + (fraction ? '.' + fraction : '');
      return value < 0 ? `(${body})` : body;
    }
    case 'P':
      return (value * 100).toFixed(decimals) + '%';
    case '+': {
      const bars = Math.trunc(value);
      return bars > 0 ? '+'.repeat(bars) : bars < 0 ? '-'.repeat(-bars) : '.';
    }
    case 'D':
      return value < 0 ? '' : dateText(value, format);
    default:
      return general(value, room);
  }
}
/** A worksheet: cells, formats, widths and hidden columns and rows, recalculated on demand. */
export class Sheet {
  private cells = new Map<number, Cell>();
  widths = new Map<number, number>();
  hiddenColumns = new Set<number>();
  hiddenRows = new Set<number>();
  globalFormat = 'G';
  globalWidth = 9;
  labelPrefix = "'";
  /** The first cell found in a circular reference at the last recalculation. */
  circular: string | null = null;
  private values = new Map<number, Value>();
  private formulas = new Map<number, Node | null>();
  private visiting = new Set<number>();
  constructor(public now: () => number = () => 0) {}
  get(col: number, row: number): Cell | undefined {
    return this.cells.get(key(col, row));
  }
  set(col: number, row: number, input: string, format?: string) {
    const existing = this.get(col, row);
    const kept = format ?? existing?.format;
    if (input || kept) this.cells.set(key(col, row), kept ? { input, format: kept } : { input });
    else this.cells.delete(key(col, row));
    this.changed();
  }
  setFormat(range: Range, format: string | undefined) {
    this.each(range, (cell, col, row) => {
      const input = cell?.input ?? '';
      if (format) this.cells.set(key(col, row), { input, format });
      else if (input) this.cells.set(key(col, row), { input });
      else this.cells.delete(key(col, row));
    });
    this.changed();
  }
  /** Clears contents; formats stay, as with /Range Erase. */
  erase(range: Range) {
    this.each(range, (cell, col, row) => {
      if (cell?.format) this.cells.set(key(col, row), { input: '', format: cell.format });
      else this.cells.delete(key(col, row));
    });
    this.changed();
  }
  /** Calls `visit` for every cell in a range, blank ones included. */
  each(range: Range, visit: (cell: Cell | undefined, col: number, row: number) => void) {
    for (let row = range.r1; row <= range.r2; row++)
      for (let col = range.c1; col <= range.c2; col++) visit(this.get(col, row), col, row);
  }
  /** Every cell with contents, row by row. */
  entries(): Array<[number, number, Cell]> {
    return [...this.cells]
      .sort(([a], [b]) => a - b)
      .map(([k, cell]) => [k % COLUMNS, Math.floor(k / COLUMNS), cell]);
  }
  width(col: number) {
    return this.hiddenColumns.has(col) ? 0 : (this.widths.get(col) ?? this.globalWidth);
  }
  /** The bottom-right corner of everything entered (A1 on an empty sheet). */
  bounds(): Range {
    let c2 = 0;
    let r2 = 0;
    for (const k of this.cells.keys()) {
      c2 = Math.max(c2, k % COLUMNS);
      r2 = Math.max(r2, Math.floor(k / COLUMNS));
    }
    return { c1: 0, r1: 0, c2, r2 };
  }
  private changed() {
    this.values.clear();
    this.formulas.clear();
  }
  private formula(k: number, input: string) {
    if (!this.formulas.has(k)) {
      try {
        this.formulas.set(k, parseFormula(input));
      } catch {
        this.formulas.set(k, null);
      }
    }
    return this.formulas.get(k)!;
  }
  value(col: number, row: number): Value {
    const k = key(col, row);
    const cell = this.cells.get(k);
    if (!cell?.input) return null;
    const kind = cellKind(cell.input);
    if (kind === 'label') return cell.input.slice(1);
    if (kind === 'number') return Number(cell.input);
    if (this.values.has(k)) return this.values.get(k)!;
    if (this.visiting.has(k)) {
      this.circular ??= address(col, row);
      return ERR;
    }
    const node = this.formula(k, cell.input);
    this.visiting.add(k);
    const value = node ? evaluate(node, { value: (c, r) => this.value(c, r), now: this.now }) : ERR;
    this.visiting.delete(k);
    this.values.set(k, value);
    return value;
  }
  /** Recomputes every formula (F9, and after each change) and finds circular references. */
  recalc() {
    this.changed();
    this.circular = null;
    for (const [col, row, cell] of this.entries())
      if (cellKind(cell.input) === 'formula') this.value(col, row);
  }
  /**
   * The cell as drawn in a column of `width` characters: numbers right-aligned with a
   * space after, labels aligned by prefix. `spill` is label text that runs on into empty
   * cells to the right.
   */
  display(col: number, row: number, width: number): { text: string; spill: string } {
    const cell = this.get(col, row);
    const blank = { text: ' '.repeat(width), spill: '' };
    if (!cell?.input || width <= 0) return blank;
    const format = cell.format ?? this.globalFormat;
    if (format === 'H') return blank;
    const kind = cellKind(cell.input);
    if (kind === 'formula' && format === 'T') return this.label("'" + cell.input, width);
    if (kind === 'label') return this.label(cell.input, width);
    const value = this.value(col, row);
    if (typeof value === 'string') return { text: value.slice(0, width).padEnd(width), spill: '' };
    const room = width - 1;
    let text = isError(value) ? value.error : formatNumber(value ?? 0, format, room);
    if (!text || text.length > room) text = '*'.repeat(width);
    // Bar graphs grow from the left; other values line up on the right, one space in.
    if (format === '+' && !isError(value)) return { text: text.padEnd(width), spill: '' };
    return { text: text.padStart(room).padEnd(width), spill: '' };
  }
  private label(input: string, width: number) {
    const prefix = input[0];
    const body = input.slice(1);
    if (prefix === '\\')
      return { text: body ? body.repeat(width).slice(0, width) : ' '.repeat(width), spill: '' };
    if (body.length > width) return { text: body.slice(0, width), spill: body.slice(width) };
    // Right-aligned labels stop one space short of the edge, in line with the numbers.
    if (prefix === '"') return { text: body.padStart(width - 1).padEnd(width), spill: '' };
    if (prefix === '^') {
      const left = Math.floor((width - body.length) / 2);
      return { text: (' '.repeat(left) + body).padEnd(width), spill: '' };
    }
    return { text: body.padEnd(width), spill: '' };
  }
  /** Replaces every formula's references (used by the structural commands). */
  private remap(map: (ref: Ref, role: RefRole, col: number, row: number) => Ref | null) {
    for (const [col, row, cell] of this.entries())
      if (cellKind(cell.input) === 'formula')
        cell.input = rewrite(cell.input, (ref, role) => map(ref, role, col, row));
    this.changed();
  }
  /** /Copy: relative references follow the copy; a single cell or row fills the target. */
  copy(from: Range, to: Range, values = false) {
    const height = from.r2 - from.r1 + 1;
    const width = from.c2 - from.c1 + 1;
    const rows = height === 1 ? to.r2 - to.r1 + 1 : 1;
    const columns = width === 1 ? to.c2 - to.c1 + 1 : 1;
    const source: Array<[number, number, Cell | undefined, Value]> = [];
    this.each(from, (cell, col, row) =>
      source.push([col - from.c1, row - from.r1, cell && { ...cell }, this.value(col, row)]),
    );
    for (let across = 0; across < columns; across++)
      for (let down = 0; down < rows; down++) {
        const dc = to.c1 + across - from.c1;
        const dr = to.r1 + down - from.r1;
        for (const [x, y, cell, value] of source) {
          const col = from.c1 + x + dc;
          const row = from.r1 + y + dr;
          if (col >= COLUMNS || row >= ROWS) continue;
          if (!cell) {
            this.cells.delete(key(col, row));
            continue;
          }
          let input = cell.input;
          if (cellKind(input) === 'formula')
            input = values
              ? typeof value === 'string'
                ? "'" + value
                : typeof value === 'number'
                  ? String(value)
                  : '@ERR'
              : rewrite(input, (ref) => offset(ref, dc, dr));
          this.cells.set(key(col, row), cell.format ? { input, format: cell.format } : { input });
        }
      }
    this.changed();
  }
  /** /Move: the cells change place and every reference to them follows. */
  move(from: Range, to: { col: number; row: number }) {
    const dc = to.col - from.c1;
    const dr = to.row - from.r1;
    if (!dc && !dr) return;
    const moving: Array<[number, number, Cell]> = [];
    this.each(from, (cell, col, row) => {
      if (cell) moving.push([col, row, cell]);
      this.cells.delete(key(col, row));
    });
    for (const [col, row, cell] of moving)
      if (col + dc < COLUMNS && row + dr < ROWS) this.cells.set(key(col + dc, row + dr), cell);
    this.remap((ref) =>
      inRange(from, ref.col, ref.row) ? { ...ref, col: ref.col + dc, row: ref.row + dr } : ref,
    );
  }
  /** Inserts or deletes whole rows or columns (count < 0 deletes), fixing references. */
  shift(axis: 'row' | 'col', at: number, count: number) {
    const limit = axis === 'row' ? ROWS : COLUMNS;
    const coordinate = (col: number, row: number) => (axis === 'row' ? row : col);
    const moved = new Map<number, Cell>();
    for (const [col, row, cell] of this.entries()) {
      const n = coordinate(col, row);
      if (count < 0 && n >= at && n < at - count) continue;
      const next = n >= at ? n + count : n;
      if (next >= limit) continue;
      moved.set(axis === 'row' ? key(col, next) : key(next, row), cell);
    }
    this.cells = moved;
    const move = (set: Set<number>) =>
      new Set(
        [...set]
          .filter((n) => count > 0 || n < at || n >= at - count)
          .map((n) => (n >= at ? n + count : n))
          .filter((n) => n < limit),
      );
    if (axis === 'row') this.hiddenRows = move(this.hiddenRows);
    else {
      this.hiddenColumns = move(this.hiddenColumns);
      const widths = new Map<number, number>();
      for (const [col, width] of this.widths) {
        if (count < 0 && col >= at && col < at - count) continue;
        const next = col >= at ? col + count : col;
        if (next < limit) widths.set(next, width);
      }
      this.widths = widths;
    }
    this.remap((ref, role) => {
      const n = axis === 'row' ? ref.row : ref.col;
      let next = n;
      if (n >= at) {
        if (count < 0 && n < at - count) {
          if (role === 'single') return null;
          next = role === 'start' ? at : at - 1;
          if (next < 0) return null;
        } else next = n + count;
      }
      if (next >= limit) return null;
      return axis === 'row' ? { ...ref, row: next } : { ...ref, col: next };
    });
  }
  serialize(): string {
    const lines = [
      'CALCPLAN 2.3 WORKSHEET',
      `#GLOBAL ${this.globalFormat} ${this.globalWidth} ${this.labelPrefix}`,
    ];
    for (const [col, width] of [...this.widths].sort(([a], [b]) => a - b))
      lines.push(`#WIDTH ${address(col, 0).replace(/\d+$/, '')} ${width}`);
    for (const col of [...this.hiddenColumns].sort((a, b) => a - b))
      lines.push(`#HIDE ${address(col, 0).replace(/\d+$/, '')}`);
    for (const row of [...this.hiddenRows].sort((a, b) => a - b)) lines.push(`#HIDE ${row + 1}`);
    for (const [col, row, cell] of this.entries())
      lines.push(`${address(col, row)}|${cell.format ?? ''}|${cell.input}`);
    return lines.join('\n') + '\n';
  }
  /** Reads a worksheet file; lines it does not understand are skipped. */
  static parse(text: string, now?: () => number): Sheet {
    const sheet = new Sheet(now);
    for (const line of text.split('\n')) {
      const cell = /^([A-Z]{1,2}\d{1,4})\|([^|]{0,3})\|(.{0,240})$/.exec(line);
      if (cell && (cell[2] || cell[3])) {
        const ref = parseRef(cell[1]);
        if (ref)
          sheet.cells.set(
            key(ref.col, ref.row),
            cell[2] ? { input: cell[3], format: cell[2] } : { input: cell[3] },
          );
        continue;
      }
      const [word, a, b, c] = line.trim().split(' ');
      if (word === '#GLOBAL') {
        if (a) sheet.globalFormat = a;
        if (Number(b) >= 1 && Number(b) <= MAX_WIDTH) sheet.globalWidth = Number(b);
        if (c && LABEL_PREFIXES.slice(0, 3).includes(c)) sheet.labelPrefix = c;
      }
      const col = columnIndex(a ?? '');
      if (word === '#WIDTH' && col >= 0 && Number(b) >= 1 && Number(b) <= MAX_WIDTH)
        sheet.widths.set(col, Number(b));
      if (word === '#HIDE' && col >= 0) sheet.hiddenColumns.add(col);
      if (word === '#HIDE' && /^\d+$/.test(a ?? '') && Number(a) >= 1 && Number(a) <= ROWS)
        sheet.hiddenRows.add(Number(a) - 1);
    }
    return sheet;
  }
}
