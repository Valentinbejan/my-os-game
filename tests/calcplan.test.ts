import { describe, expect, it } from 'vitest';
import {
  normalize,
  parseFormula,
  parseRange,
  rewrite,
  offset,
  columnName,
  columnIndex,
} from '../src/programs/calcplan/formula';
import { Sheet, formatNumber, valueEntry } from '../src/programs/calcplan/Sheet';
import { CalcPlanProgram } from '../src/programs/calcplan/CalcPlanProgram';
import type { ProgramSystem } from '../src/programs/Program';
import type { FileKind } from '../src/os/fs/FileSystem';
import { Screen } from '../src/screen/Screen';
import { Portrait } from '../src/screen/face';
const key = (
  key: string,
  extra: Partial<{ alt: boolean; ctrl: boolean; shift: boolean }> = {},
) => ({
  key,
  alt: false,
  ctrl: false,
  shift: false,
  ...extra,
});
const at = (sheet: Sheet, ref: string) => {
  const range = parseRange(ref)!;
  return sheet.value(range.c1, range.r1);
};
const put = (sheet: Sheet, ref: string, input: string) => {
  const range = parseRange(ref)!;
  sheet.set(range.c1, range.r1, input);
};
describe('CALCPLAN formulas', () => {
  it('names columns A..IV and reads ranges typed either way', () => {
    expect([0, 25, 26, 255].map(columnName)).toEqual(['A', 'Z', 'AA', 'IV']);
    expect(columnIndex('IV')).toBe(255);
    expect(columnIndex('IW')).toBe(-1);
    expect(parseRange('b5.a1')).toEqual({ c1: 0, r1: 0, c2: 1, r2: 4 });
    expect(parseRange('A1..A0')).toBeNull();
  });
  it('normalizes entries as 1-2-3 stored them and rejects bad formulas', () => {
    expect(normalize('@sum(a1.a3) * 2')).toBe('@SUM(A1..A3)*2');
    expect(valueEntry('+b1 #and# c1')).toBe('+B1#AND#C1');
    expect(valueEntry('1.50')).toBe('1.5');
    expect(valueEntry('+A1+')).toBeNull();
    expect(valueEntry('@NOPE(1)')).toBeNull();
    expect(valueEntry('@IF(1,2)')).toBeNull();
    expect(valueEntry('+A1..A3')).toBeNull();
    expect(() => parseFormula('@ROUND(A1..A2,1)')).toThrow();
  });
  it('follows 1-2-3 precedence', () => {
    const sheet = new Sheet();
    put(sheet, 'A1', '-2^2');
    put(sheet, 'A2', '2+3*4');
    put(sheet, 'A3', '1+1=2#AND#3>2');
    put(sheet, 'A4', '(2+3)*4');
    expect([at(sheet, 'A1'), at(sheet, 'A2'), at(sheet, 'A3'), at(sheet, 'A4')]).toEqual([
      -4, 14, 1, 20,
    ]);
  });
  it('evaluates functions over ranges, labels count as entries but not as numbers', () => {
    const sheet = new Sheet();
    put(sheet, 'A1', "'NAME");
    put(sheet, 'A2', '10');
    put(sheet, 'A3', '20');
    put(sheet, 'A5', '@SUM(A1..A4)');
    put(sheet, 'A6', '@COUNT(A1..A4)');
    put(sheet, 'A7', '@AVG(A2..A3)');
    put(sheet, 'A8', '@IF(A5>25,"OVER","UNDER")');
    put(sheet, 'A9', '+A2/0');
    put(sheet, 'A10', '@ROUND(2/3,2)');
    put(sheet, 'A11', '+A1&" LIST"');
    expect(at(sheet, 'A5')).toBe(30);
    expect(at(sheet, 'A6')).toBe(3);
    expect(at(sheet, 'A7')).toBe(15);
    expect(at(sheet, 'A8')).toBe('OVER');
    expect(at(sheet, 'A9')).toEqual({ error: 'ERR' });
    expect(at(sheet, 'A10')).toBe(0.67);
    expect(at(sheet, 'A11')).toBe('NAME LIST');
  });
  it('reports circular references and recovers when they are broken', () => {
    const sheet = new Sheet();
    put(sheet, 'A1', '+B1+1');
    put(sheet, 'B1', '+A1');
    sheet.recalc();
    expect(sheet.circular).not.toBeNull();
    expect(at(sheet, 'A1')).toEqual({ error: 'ERR' });
    put(sheet, 'B1', '5');
    sheet.recalc();
    expect(sheet.circular).toBeNull();
    expect(at(sheet, 'A1')).toBe(6);
  });
  it('shifts relative references and keeps absolute ones', () => {
    expect(rewrite('+A1+$B$2+C$3', (ref) => offset(ref, 1, 2))).toBe('+B3+$B$2+D$3');
    expect(rewrite('+A1', (ref) => offset(ref, -1, 0))).toBe('+@ERR');
  });
});
describe('CALCPLAN worksheet', () => {
  it('formats numbers the way the column shows them', () => {
    expect(formatNumber(1234.5, 'C2', 12)).toBe('$1,234.50');
    expect(formatNumber(-1234.5, ',0', 12)).toBe('(1,235)');
    expect(formatNumber(0.125, 'P1', 8)).toBe('12.5%');
    expect(formatNumber(1 / 3, 'G', 8)).toBe('0.333333');
    expect(formatNumber(100, 'G', 8)).toBe('100');
    expect(formatNumber(123456789012, 'G', 8)).toBe('1.23E+11');
    expect(formatNumber(33542 + (18 * 3600 + 13 * 60 + 9) / 86400, 'D8', 9)).toBe('18:13:09');
    expect(formatNumber(33542, 'D1', 9)).toBe('31-Oct-91');
    const sheet = new Sheet();
    put(sheet, 'A1', '123456789');
    expect(sheet.display(0, 0, 9).text).toBe('1.23E+08 ');
    put(sheet, 'A2', "'A LABEL LONGER THAN THE CELL");
    expect(sheet.display(0, 1, 9)).toEqual({ text: 'A LABEL L', spill: 'ONGER THAN THE CELL' });
    put(sheet, 'A3', '"R');
    put(sheet, 'A4', '\\-');
    expect(sheet.display(0, 2, 5).text).toBe('   R ');
    expect(sheet.display(0, 3, 5).text).toBe('-----');
  });
  it('copies formulas relatively and fills a range from one cell', () => {
    const sheet = new Sheet();
    put(sheet, 'A1', '1');
    put(sheet, 'A2', '2');
    put(sheet, 'B1', '+A1*10');
    sheet.copy(parseRange('B1')!, parseRange('B2..B3')!);
    expect(sheet.get(1, 1)?.input).toBe('+A2*10');
    expect(sheet.get(1, 2)?.input).toBe('+A3*10');
    expect(at(sheet, 'B2')).toBe(20);
  });
  it('moves cells and updates the formulas that point at them', () => {
    const sheet = new Sheet();
    put(sheet, 'A1', '7');
    put(sheet, 'C1', '+A1*2');
    sheet.move(parseRange('A1')!, { col: 0, row: 9 });
    expect(sheet.get(2, 0)?.input).toBe('+A10*2');
    expect(at(sheet, 'C1')).toBe(14);
  });
  it('inserts and deletes rows, fixing references and hidden rows', () => {
    const sheet = new Sheet();
    put(sheet, 'A1', '1');
    put(sheet, 'A2', '2');
    put(sheet, 'A3', '3');
    put(sheet, 'A5', '@SUM(A1..A3)');
    sheet.hiddenRows.add(2);
    sheet.shift('row', 1, 2);
    expect(sheet.get(0, 6)?.input).toBe('@SUM(A1..A5)');
    expect(sheet.hiddenRows.has(4)).toBe(true);
    sheet.shift('row', 1, -2);
    expect(sheet.get(0, 4)?.input).toBe('@SUM(A1..A3)');
    put(sheet, 'B1', '+A2');
    sheet.shift('row', 1, -1);
    expect(sheet.get(1, 0)?.input).toBe('+@ERR');
    expect(sheet.get(0, 3)?.input).toBe('@SUM(A1..A2)');
  });
  it('saves and reads back widths, hidden rows and columns, formats and cells', () => {
    const sheet = new Sheet();
    sheet.widths.set(0, 14);
    sheet.hiddenRows.add(16);
    sheet.hiddenColumns.add(3);
    put(sheet, 'A17', "'LIND, A.|W-2");
    sheet.setFormat(parseRange('B2')!, 'F2');
    put(sheet, 'B2', '@SUM(B3..B4)');
    const copy = Sheet.parse(sheet.serialize());
    expect(copy.serialize()).toBe(sheet.serialize());
    expect(copy.get(0, 16)?.input).toBe("'LIND, A.|W-2");
    expect(copy.get(1, 1)).toEqual({ input: '@SUM(B3..B4)', format: 'F2' });
    expect(copy.width(3)).toBe(0);
  });
});
describe('CALCPLAN program', () => {
  const files = new Map<string, { content: string; kind: FileKind }>();
  const system = (): ProgramSystem => ({
    cwd: 'C:\\SHEETS',
    resolve: (path) => 'C:\\SHEETS\\' + path.toUpperCase(),
    read: (path) => {
      const file = files.get(path);
      return file
        ? { path, entry: { ...file, date: '11-03-91', time: '02:14', attrs: 'A' } }
        : 'missing';
    },
    write: (path, content, kind) => {
      files.set(path, { content, kind });
      return 'ok';
    },
    list: () => [...files.keys()].map((path) => path.slice(path.lastIndexOf('\\') + 1)),
    folders: () => [],
    stat: (path) =>
      path === 'C:\\SHEETS'
        ? { size: 0, date: '', time: '', dir: true }
        : files.has(path)
          ? { size: 10, date: '11-03-91', time: '02:14', dir: false }
          : null,
    now: () => ({ date: '11-03-91', time: '02:14:00', weekday: 'Sun' }),
    disk: () => undefined,
    beep: () => undefined,
    sound: () => undefined,
    cue: () => undefined,
    loop: () => undefined,
    note: () => undefined,
    comm: {
      dial: () => 'NO ANSWER',
      openBus: () => ({ error: 'none' }),
      talk: async () => ({ reply: '' }),
      distort: () => undefined,
      ringing: () => false,
      pickUp: () => '',
      nudge: () => null,
      portrait: new Portrait(),
      closeBus: () => undefined,
    },
    exit: () => undefined,
  });
  const type = (program: CalcPlanProgram, text: string) => {
    for (const char of text) program.key(key(char));
  };
  const show = (program: CalcPlanProgram) => {
    const screen = new Screen();
    program.render(screen);
    return screen.text.split('\n');
  };
  it('enters labels and values, points at cells while typing a formula, and saves', () => {
    files.clear();
    const program = new CalcPlanProgram(system(), null);
    type(program, 'Night');
    expect(show(program)[0]).toMatch(/LABEL/);
    program.key(key('ArrowDown'));
    type(program, '12');
    program.key(key('ArrowDown'));
    type(program, '30');
    program.key(key('ArrowDown'));
    type(program, '@SUM(');
    program.key(key('ArrowUp'));
    program.key(key('ArrowUp'));
    program.key(key('.'));
    program.key(key('ArrowDown'));
    expect(show(program)[1]).toBe('@SUM(A2..A3');
    type(program, ')');
    program.key(key('Enter'));
    const screen = show(program);
    expect(screen[0]).toMatch(/^A4: @SUM\(A2\.\.A3\)/);
    expect(screen[4]).toMatch(/^1 +Night/);
    expect(screen[7]).toMatch(/^4 +42/);
    type(program, '/FS');
    expect(show(program)[1]).toBe('Enter name of file to save: C:\\SHEETS\\');
    type(program, 'NOTES');
    program.key(key('Enter'));
    expect(files.get('C:\\SHEETS\\NOTES.WK1')?.content).toContain('A4||@SUM(A2..A3)');
  });
  it('hides a row, shows its contents in the control panel only, and redisplays it', () => {
    files.clear();
    const sheet = new Sheet();
    put(sheet, 'A1', "'FIRST");
    put(sheet, 'A2', "'SECRET");
    put(sheet, 'A3', "'THIRD");
    sheet.hiddenRows.add(1);
    sheet.setFormat(parseRange('A3')!, 'H');
    files.set('C:\\SHEETS\\R.WK1', { content: sheet.serialize(), kind: 'sheet' });
    const program = new CalcPlanProgram(system(), 'C:\\SHEETS\\R.WK1');
    let screen = show(program);
    expect(screen[4]).toMatch(/^1 +FIRST/);
    expect(screen[5]).toMatch(/^3\s*$/);
    program.key(key('ArrowDown'));
    expect(show(program)[0]).toMatch(/^A3: \(H\) 'THIRD/);
    type(program, '/WRD');
    screen = show(program);
    expect(screen[5]).toMatch(/^2\* +SECRET/);
    program.key(key('ArrowUp'));
    program.key(key('Enter'));
    screen = show(program);
    expect(screen[5]).toMatch(/^2 +SECRET/);
    expect(screen[0]).toMatch(/READY/);
  });
  it('turns a bad formula into EDIT mode instead of storing it', () => {
    files.clear();
    const program = new CalcPlanProgram(system(), null);
    type(program, '3 Nov');
    program.key(key('Enter'));
    expect(show(program)[0]).toMatch(/EDIT/);
    program.key(key('Home'));
    type(program, "'");
    program.key(key('Enter'));
    expect(show(program)[4]).toMatch(/^1 +3 Nov/);
  });
});
