import { describe, expect, it } from 'vitest';
import { TextEditor } from '../src/programs/edit/TextEditor';
import { MenuBar } from '../src/screen/widgets';
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
describe('EDIT text model', () => {
  it('pads with spaces when typing past the end of a line and keeps the indent on Enter', () => {
    const editor = new TextEditor('  FIRST\n');
    editor.move('End');
    editor.col += 3;
    editor.type('X');
    expect(editor.lines[0]).toBe('  FIRST   X');
    editor.enter();
    editor.type('NEXT');
    expect(editor.lines).toEqual(['  FIRST   X', '  NEXT']);
    expect(editor.text()).toBe('  FIRST   X\n  NEXT\n');
    expect(editor.dirty).toBe(true);
  });
  it('joins lines on Backspace, deletes a line with Ctrl+Y and overtypes in overwrite mode', () => {
    const editor = new TextEditor('ONE\nTWO\nTHREE');
    editor.move('ArrowDown');
    editor.move('Home');
    editor.backspace();
    expect(editor.lines).toEqual(['ONETWO', 'THREE']);
    expect(editor.deleteLine()).toBe('ONETWO');
    expect(editor.lines).toEqual(['THREE']);
    editor.insert = false;
    editor.type('F');
    expect(editor.lines[0]).toBe('FHREE');
  });
  it('selects across lines, replaces the selection and finds text with wrap-around', () => {
    const editor = new TextEditor('DEVICE=HIMEM.SYS\nDEVICE=LIMBIC.SYS\nFILES=30');
    editor.move('ArrowDown');
    for (let n = 0; n < 17; n++) editor.move('ArrowRight', true);
    expect(editor.selectedText()).toBe('DEVICE=LIMBIC.SYS');
    editor.type('REM');
    expect(editor.lines[1]).toBe('REM');
    editor.move('DocumentEnd');
    expect(editor.find('himem')).toBe(true);
    expect(editor.row).toBe(0);
    expect(editor.selectedText()).toBe('HIMEM');
    expect(editor.find('nowhere')).toBe(false);
  });
});
describe('menu bar', () => {
  it('opens with Alt+letter, moves between items and returns the chosen action', () => {
    const bar = new MenuBar([
      {
        title: 'File',
        hotkey: 'F',
        items: [
          { label: 'New', hotkey: 'N', action: 'new' },
          { label: '', action: '' },
          { label: 'Exit', hotkey: 'X', action: 'exit' },
        ],
      },
      { title: 'Help', hotkey: 'H', items: [{ label: 'About', hotkey: 'A', action: 'about' }] },
    ]);
    expect(bar.shortcut(key('f', { alt: true }))).toBe(true);
    expect(bar.key(key('ArrowDown'))).toBe('');
    expect(bar.item).toBe(2);
    expect(bar.key(key('Enter'))).toBe('exit');
    expect(bar.active).toBe(false);
    bar.activate();
    expect(bar.key(key('ArrowRight'))).toBe('');
    expect(bar.key(key('Enter'))).toBe('');
    expect(bar.key(key('a'))).toBe('about');
  });
});
