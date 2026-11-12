import { describe, expect, it } from 'vitest';
import { wrapText, terminalSafe } from '../src/terminal/wrapText';
import { TerminalBuffer } from '../src/terminal/TerminalBuffer';
import { TerminalInput } from '../src/terminal/TerminalInput';
import { parseCommand, availableCommands } from '../src/game/commands';
import { newGame } from '../src/game/types';
describe('fixed terminal', () => {
  it('wraps at exactly 80 columns without extra lines', () => {
    expect(wrapText('X'.repeat(80))).toEqual(['X'.repeat(80)]);
    expect(wrapText('X'.repeat(81))).toEqual(['X'.repeat(80), 'X']);
    expect(wrapText('ABC DEF', 4)).toEqual(['ABC', 'DEF']);
    expect(wrapText('A\r\nB\rC\n')).toEqual(['A', 'B', 'C', '']);
    expect(wrapText('😀'.repeat(81))[0]).toHaveLength(160);
  });
  it('keeps exactly 2000 cells and treats CR as carriage return', () => {
    const b = new TerminalBuffer();
    b.write('X'.repeat(80) + '\r\nY');
    expect(b.y).toBe(1);
    expect(b.cells[80].char).toBe('Y');
    expect(b.cells.length).toBe(2000);
    b.write('\rZ');
    expect(b.cells[80].char).toBe('Z');
    for (let n = 0; n < 50; n++) b.write('\r\nLINE');
    expect(b.y).toBe(24);
    expect(b.scrollback.length).toBeGreaterThan(0);
    const history = b.scrollback.length;
    b.clear();
    expect(b.scrollback.length).toBeGreaterThanOrEqual(history);
    expect(b.cells.every((c) => c.palette === 'amber' && c.char === ' ')).toBe(true);
  });
  it('reserves enough visible rows for a long input', () => {
    const b = new TerminalBuffer();
    b.write('\n'.repeat(24));
    b.reserveInput(520);
    expect(b.y + Math.floor(520 / 80)).toBeLessThan(25);
  });
  it('edits at boundaries and restores a draft after history navigation', () => {
    const i = new TerminalInput();
    i.key('Backspace');
    i.key('Delete');
    expect(i.value).toBe('');
    i.insert('ABC');
    i.key('Home');
    i.key('Delete');
    expect(i.value).toBe('BC');
    i.key('End');
    i.key('ArrowLeft');
    i.key('Backspace');
    expect(i.value).toBe('C');
    i.submit();
    i.insert('DRAFT');
    i.key('ArrowUp');
    expect(i.value).toBe('C');
    i.key('ArrowDown');
    expect(i.value).toBe('DRAFT');
    i.key('End');
    i.insert('\x1b[31m\nHELLO\u0000');
    expect([...i.value].every((char) => char.charCodeAt(0) >= 32)).toBe(true);
  });
  it('normalizes commands and hides locked actions', () => {
    expect(parseCommand('  cOnNeCt   04 ')).toEqual({ name: 'CONNECT', args: ['04'] });
    expect(parseCommand('/exit')).toEqual({ name: 'DISCONNECT', args: [] });
    expect(parseCommand('who are you')).toBeNull();
    expect(availableCommands(newGame())).not.toContain('PURGE 04');
    expect(terminalSafe('“YES”—\u0007')).toBe('"YES"-');
  });
});
