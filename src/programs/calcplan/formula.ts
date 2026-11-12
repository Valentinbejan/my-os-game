/** Cell addresses, formula parsing and evaluation for CALCPLAN worksheets (1-2-3 rules). */
export const COLUMNS = 256;
export const ROWS = 8192;
export interface Ref {
  col: number;
  row: number;
  absCol: boolean;
  absRow: boolean;
}
export interface Range {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}
export interface CellError {
  error: 'ERR' | 'NA';
}
export const ERR: CellError = { error: 'ERR' };
export const NA: CellError = { error: 'NA' };
/** A cell's value: a number, a string, blank (null) or an error. */
export type Value = number | string | null | CellError;
export const isError = (value: Value): value is CellError =>
  typeof value === 'object' && value !== null;

export const columnName = (col: number) =>
  col < 26
    ? String.fromCharCode(65 + col)
    : String.fromCharCode(64 + Math.floor(col / 26)) + String.fromCharCode(65 + (col % 26));
/** 'A' -> 0, 'IV' -> 255; -1 for anything past the last column. */
export function columnIndex(name: string): number {
  const letters = name.toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(letters)) return -1;
  const index =
    letters.length === 1
      ? letters.charCodeAt(0) - 65
      : (letters.charCodeAt(0) - 64) * 26 + letters.charCodeAt(1) - 65;
  return index < COLUMNS ? index : -1;
}
export const address = (col: number, row: number) => columnName(col) + (row + 1);
export function parseRef(text: string): Ref | null {
  const match = /^(\$?)([A-Z]{1,2})(\$?)(\d{1,4})$/i.exec(text.trim());
  if (!match) return null;
  const col = columnIndex(match[2]);
  const row = Number(match[4]) - 1;
  if (col < 0 || row < 0 || row >= ROWS) return null;
  return { col, row, absCol: !!match[1], absRow: !!match[3] };
}
export const refText = (ref: Ref) =>
  (ref.absCol ? '$' : '') + columnName(ref.col) + (ref.absRow ? '$' : '') + (ref.row + 1);
/** Orders two corners into a range. */
export const span = (a: { col: number; row: number }, b: { col: number; row: number }): Range => ({
  c1: Math.min(a.col, b.col),
  r1: Math.min(a.row, b.row),
  c2: Math.max(a.col, b.col),
  r2: Math.max(a.row, b.row),
});
/** "A1", "A1..B5" or "A1.B5". */
export function parseRange(text: string): Range | null {
  const parts = text.trim().split(/\.{1,2}/);
  if (parts.length > 2) return null;
  const a = parseRef(parts[0]);
  const b = parseRef(parts[1] ?? parts[0]);
  return a && b ? span(a, b) : null;
}
export const rangeText = (range: Range) =>
  address(range.c1, range.r1) + '..' + address(range.c2, range.r2);
export const inRange = (range: Range, col: number, row: number) =>
  col >= range.c1 && col <= range.c2 && row >= range.r1 && row <= range.r2;

type Token =
  | { t: 'num'; v: number; text: string }
  | { t: 'str'; v: string }
  | { t: 'ref'; ref: Ref }
  | { t: 'range' }
  | { t: 'fn'; name: string }
  | { t: 'op'; v: string }
  | { t: '(' | ')' | ',' };
export class FormulaError extends Error {}
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  const rest = () => text.slice(at);
  while (at < text.length) {
    const char = text[at];
    if (char === ' ') {
      at++;
      continue;
    }
    const previous = tokens.at(-1);
    if (char === '.' && previous?.t === 'ref') {
      at += text[at + 1] === '.' ? 2 : 1;
      tokens.push({ t: 'range' });
      continue;
    }
    const number = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(rest());
    if (number) {
      tokens.push({ t: 'num', v: Number(number[0]), text: number[0].toUpperCase() });
      at += number[0].length;
      continue;
    }
    const ref = /^\$?[A-Z]{1,2}\$?\d{1,4}(?![A-Z0-9])/i.exec(rest());
    if (ref) {
      const parsed = parseRef(ref[0]);
      if (!parsed) throw new FormulaError(ref[0]);
      tokens.push({ t: 'ref', ref: parsed });
      at += ref[0].length;
      continue;
    }
    const fn = /^@([A-Z]+)/i.exec(rest());
    if (fn) {
      tokens.push({ t: 'fn', name: fn[1].toUpperCase() });
      at += fn[0].length;
      continue;
    }
    if (char === '"') {
      const end = text.indexOf('"', at + 1);
      if (end < 0) throw new FormulaError('string');
      tokens.push({ t: 'str', v: text.slice(at + 1, end) });
      at = end + 1;
      continue;
    }
    const logical = /^#(AND|OR|NOT)#/i.exec(rest());
    const op = logical?.[0].toUpperCase() ?? /^(<=|>=|<>|[-+*/^=<>&])/.exec(rest())?.[0];
    if (op) {
      tokens.push({ t: 'op', v: op });
      at += op.length;
      continue;
    }
    if (char === '(' || char === ')') tokens.push({ t: char });
    else if (char === ',' || char === ';') tokens.push({ t: ',' });
    else throw new FormulaError(char);
    at++;
  }
  return tokens;
}
const tokenText = (token: Token): string => {
  switch (token.t) {
    case 'num':
      return token.text;
    case 'str':
      return '"' + token.v + '"';
    case 'ref':
      return refText(token.ref);
    case 'range':
      return '..';
    case 'fn':
      return '@' + token.name;
    case 'op':
      return token.v;
    default:
      return token.t;
  }
};

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; ref: Ref }
  | { k: 'range'; a: Ref; b: Ref }
  | { k: 'un'; op: string; x: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };
const BINARY: Record<string, number> = {
  '^': 7,
  '*': 5,
  '/': 5,
  '+': 4,
  '-': 4,
  '=': 3,
  '<>': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '#AND#': 1,
  '#OR#': 1,
  '&': 1,
};
/** Functions that take lists of ranges and values. */
const LISTS = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']);
const ARITY: Record<string, number> = {
  IF: 3,
  ROUND: 2,
  ABS: 1,
  INT: 1,
  SQRT: 1,
  MOD: 2,
  PI: 0,
  TRUE: 0,
  FALSE: 0,
  ERR: 0,
  NA: 0,
  ISERR: 1,
  ISNA: 1,
  ISNUMBER: 1,
  ISSTRING: 1,
  DATE: 3,
  TIME: 3,
  NOW: 0,
  LEFT: 2,
  RIGHT: 2,
  LENGTH: 1,
  UPPER: 1,
  LOWER: 1,
  STRING: 2,
};
export const FUNCTIONS = [...LISTS, ...Object.keys(ARITY)].sort();
function parseTokens(tokens: Token[]): Node {
  let at = 0;
  const peek = () => tokens[at];
  const next = () => {
    const token = tokens[at++];
    if (!token) throw new FormulaError('end');
    return token;
  };
  const expect = (t: Token['t']) => {
    if (next().t !== t) throw new FormulaError(t);
  };
  const expression = (min: number): Node => {
    let left = prefix();
    for (;;) {
      const token = peek();
      if (token?.t !== 'op' || !(token.v in BINARY) || BINARY[token.v] < min) return left;
      at++;
      left = { k: 'bin', op: token.v, a: left, b: expression(BINARY[token.v] + 1) };
    }
  };
  const prefix = (): Node => {
    const token = next();
    if (token.t === 'op' && (token.v === '-' || token.v === '+'))
      return { k: 'un', op: token.v, x: expression(6) };
    if (token.t === 'op' && token.v === '#NOT#') return { k: 'un', op: token.v, x: expression(2) };
    if (token.t === 'num') return { k: 'num', v: token.v };
    if (token.t === 'str') return { k: 'str', v: token.v };
    if (token.t === 'ref') {
      if (peek()?.t !== 'range') return { k: 'ref', ref: token.ref };
      at++;
      const end = next();
      if (end.t !== 'ref') throw new FormulaError('range');
      return { k: 'range', a: token.ref, b: end.ref };
    }
    if (token.t === 'fn') {
      const list = LISTS.has(token.name);
      if (!list && !(token.name in ARITY)) throw new FormulaError('@' + token.name);
      const args: Node[] = [];
      if (peek()?.t === '(') {
        at++;
        for (;;) {
          args.push(expression(0));
          const separator = next();
          if (separator.t === ')') break;
          if (separator.t !== ',') throw new FormulaError(',');
        }
      }
      if (list ? args.length === 0 : args.length !== ARITY[token.name])
        throw new FormulaError('@' + token.name);
      return { k: 'call', name: token.name, args };
    }
    if (token.t === '(') {
      const inner = expression(0);
      expect(')');
      return inner;
    }
    throw new FormulaError(tokenText(token));
  };
  const node = expression(0);
  if (at < tokens.length) throw new FormulaError(tokenText(tokens[at]));
  ranges(node, false);
  return node;
}
/** Ranges are only allowed as arguments of the list functions (@SUM(A1..A3)). */
function ranges(node: Node, allowed: boolean) {
  if (node.k === 'range' && !allowed) throw new FormulaError('range');
  if (node.k === 'un') ranges(node.x, false);
  if (node.k === 'bin') {
    ranges(node.a, false);
    ranges(node.b, false);
  }
  if (node.k === 'call') for (const arg of node.args) ranges(arg, LISTS.has(node.name));
}
export const parseFormula = (text: string) => parseTokens(tokenize(text));
/** The formula as the control panel shows it: upper case, no spaces, ranges with "..". */
export const normalize = (text: string) => tokenize(text).map(tokenText).join('');
/** Numbers as typed into a cell (no formula needed). */
export const isNumber = (text: string) => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text);

export type RefRole = 'single' | 'start' | 'end';
/**
 * Rewrites every cell reference in a formula (for copy, move, insert and delete); a
 * reference mapped to null becomes @ERR, as 1-2-3 did for cells that no longer exist.
 */
export function rewrite(text: string, map: (ref: Ref, role: RefRole) => Ref | null): string {
  const tokens = tokenize(text);
  const out: string[] = [];
  for (let n = 0; n < tokens.length; n++) {
    const token = tokens[n];
    const end = tokens[n + 2];
    if (token.t === 'ref' && tokens[n + 1]?.t === 'range' && end?.t === 'ref') {
      const a = map(token.ref, 'start');
      const b = map(end.ref, 'end');
      out.push(
        a && b && a.col <= b.col && a.row <= b.row ? refText(a) + '..' + refText(b) : '@ERR',
      );
      n += 2;
    } else if (token.t === 'ref') {
      const ref = map(token.ref, 'single');
      out.push(ref ? refText(ref) : '@ERR');
    } else out.push(tokenText(token));
  }
  return out.join('');
}
/** Moves a reference as a relative copy does: `$` parts stay put. */
export function offset(ref: Ref, dc: number, dr: number): Ref | null {
  const col = ref.absCol ? ref.col : ref.col + dc;
  const row = ref.absRow ? ref.row : ref.row + dr;
  return col < 0 || col >= COLUMNS || row < 0 || row >= ROWS ? null : { ...ref, col, row };
}

/** Days since 30 Dec 1899, the 1-2-3 date numbering (which counts 1900 as a leap year). */
export const dateSerial = (year: number, month: number, day: number) =>
  (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
export interface Context {
  value(col: number, row: number): Value;
  now(): number;
}
const num = (value: Value): number | CellError =>
  isError(value) ? value : typeof value === 'number' ? value : 0;
const text = (value: Value): string | CellError =>
  isError(value) ? value : typeof value === 'string' ? value : ERR;
function* cells(node: Node, context: Context): Generator<Value> {
  if (node.k !== 'range') {
    yield evaluate(node, context);
    return;
  }
  const range = span(node.a, node.b);
  for (let row = range.r1; row <= range.r2; row++)
    for (let col = range.c1; col <= range.c2; col++) yield context.value(col, row);
}
function list(name: string, args: Node[], context: Context): Value {
  const numbers: number[] = [];
  let count = 0;
  for (const arg of args)
    for (const value of cells(arg, context)) {
      if (isError(value)) return value;
      if (value === null) continue;
      count++;
      if (typeof value === 'number') numbers.push(value);
    }
  switch (name) {
    case 'SUM':
      return numbers.reduce((a, b) => a + b, 0);
    case 'COUNT':
      return count;
    case 'AVG':
      return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : ERR;
    case 'MIN':
      return numbers.length ? Math.min(...numbers) : 0;
    default:
      return numbers.length ? Math.max(...numbers) : 0;
  }
}
function call(name: string, args: Node[], context: Context): Value {
  if (LISTS.has(name)) return list(name, args, context);
  const values = args.map((arg) => evaluate(arg, context));
  const [a, b, c] = values;
  const numbers = (...picked: Value[]): number[] | CellError => {
    const out = picked.map(num);
    return out.find(isError) ?? (out as number[]);
  };
  const math = (fn: (...n: number[]) => number): Value => {
    const n = numbers(...values);
    if (!Array.isArray(n)) return n;
    const result = fn(...n);
    return Number.isFinite(result) ? result : ERR;
  };
  switch (name) {
    case 'IF': {
      const test = num(a);
      return isError(test) ? test : test !== 0 ? b : c;
    }
    case 'ROUND':
      return math(
        (x, digits) => Math.round(x * 10 ** Math.trunc(digits)) / 10 ** Math.trunc(digits),
      );
    case 'ABS':
      return math(Math.abs);
    case 'INT':
      return math(Math.trunc);
    case 'SQRT':
      return math((x) => (x < 0 ? NaN : Math.sqrt(x)));
    case 'MOD':
      return math((x, y) => (y === 0 ? NaN : x % y));
    case 'PI':
      return Math.PI;
    case 'TRUE':
      return 1;
    case 'FALSE':
      return 0;
    case 'ERR':
      return ERR;
    case 'NA':
      return NA;
    case 'ISERR':
      return isError(a) && a.error === 'ERR' ? 1 : 0;
    case 'ISNA':
      return isError(a) && a.error === 'NA' ? 1 : 0;
    case 'ISNUMBER':
      return typeof a === 'number' || a === null ? 1 : 0;
    case 'ISSTRING':
      return typeof a === 'string' ? 1 : 0;
    case 'DATE':
      return math((y, m, d) =>
        m < 1 || m > 12 || d < 1 || d > 31 ? NaN : dateSerial(1900 + Math.trunc(y), m, d),
      );
    case 'TIME':
      return math((h, m, s) =>
        h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59
          ? NaN
          : (h * 3600 + m * 60 + s) / 86400,
      );
    case 'NOW':
      return context.now();
    case 'LEFT':
    case 'RIGHT': {
      const s = text(a);
      const n = num(b);
      if (isError(s)) return s;
      if (isError(n) || n < 0) return ERR;
      return name === 'LEFT' ? s.slice(0, n) : n ? s.slice(-n) : '';
    }
    case 'LENGTH': {
      const s = text(a);
      return isError(s) ? s : s.length;
    }
    case 'UPPER':
    case 'LOWER': {
      const s = text(a);
      return isError(s) ? s : name === 'UPPER' ? s.toUpperCase() : s.toLowerCase();
    }
    case 'STRING': {
      const n = numbers(a, b);
      if (!Array.isArray(n)) return n;
      const [x, digits] = n;
      return digits < 0 || digits > 15 ? ERR : x.toFixed(Math.trunc(digits));
    }
  }
  return ERR;
}
function compare(op: string, a: Value, b: Value): Value {
  let order: number;
  if (typeof a === 'string' && typeof b === 'string')
    order = a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0;
  else {
    const x = num(a);
    const y = num(b);
    if (isError(x)) return x;
    if (isError(y)) return y;
    order = Math.sign(x - y);
  }
  const results: Record<string, boolean> = {
    '=': order === 0,
    '<>': order !== 0,
    '<': order < 0,
    '<=': order <= 0,
    '>': order > 0,
    '>=': order >= 0,
  };
  return results[op] ? 1 : 0;
}
export function evaluate(node: Node, context: Context): Value {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'str':
      return node.v;
    case 'ref': {
      const value = context.value(node.ref.col, node.ref.row);
      return value === null ? 0 : value;
    }
    case 'range':
      return ERR;
    case 'call':
      return call(node.name, node.args, context);
    case 'un': {
      // A leading + leaves strings alone: +A1&" "&B1 is a string formula.
      if (node.op === '+') return evaluate(node.x, context);
      const x = num(evaluate(node.x, context));
      if (isError(x)) return x;
      return node.op === '-' ? -x : x === 0 ? 1 : 0;
    }
    case 'bin': {
      const a = evaluate(node.a, context);
      const b = evaluate(node.b, context);
      if (node.op === '&') {
        const x = text(a);
        const y = text(b);
        return isError(x) ? x : isError(y) ? y : x + y;
      }
      if (node.op in { '=': 1, '<>': 1, '<': 1, '<=': 1, '>': 1, '>=': 1 })
        return compare(node.op, a, b);
      const x = num(a);
      const y = num(b);
      if (isError(x)) return x;
      if (isError(y)) return y;
      let result: number;
      switch (node.op) {
        case '+':
          result = x + y;
          break;
        case '-':
          result = x - y;
          break;
        case '*':
          result = x * y;
          break;
        case '/':
          result = y === 0 ? NaN : x / y;
          break;
        case '^':
          result = x ** y;
          break;
        case '#AND#':
          result = x !== 0 && y !== 0 ? 1 : 0;
          break;
        default:
          result = x !== 0 || y !== 0 ? 1 : 0;
      }
      return Number.isFinite(result) ? result : ERR;
    }
  }
}
