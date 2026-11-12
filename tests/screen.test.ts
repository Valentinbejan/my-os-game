import { describe, expect, it } from 'vitest';
import { Screen } from '../src/screen/Screen';
import { ProgramHost, type Program } from '../src/programs/Program';
describe('text-mode page', () => {
  it('clips writes to the 80x25 page and keeps attributes per cell', () => {
    const screen = new Screen();
    screen.put(78, 0, 'ABCD', { inverse: true });
    screen.put(-2, 1, 'XYZ');
    screen.put(0, 25, 'LOST');
    expect(screen.text.split('\n')[0]).toBe(' '.repeat(78) + 'AB');
    expect(screen.cells[79].inverse).toBe(true);
    expect(screen.text.split('\n')[1]).toBe('Z');
    expect(screen.cells).toHaveLength(2000);
  });
  it('draws frames with their corners and clears the interior', () => {
    const screen = new Screen();
    screen.fill(0, 0, 10, 4, '#');
    screen.box(0, 0, 10, 4, 'double');
    expect(screen.text.split('\n').slice(0, 4)).toEqual([
      '╔════════╗',
      '║        ║',
      '║        ║',
      '╚════════╝',
    ]);
    screen.box(0, 0, 6, 3, 'mixed');
    expect(screen.text.split('\n')[0].slice(0, 6)).toBe('╒════╕');
  });
});
describe('program host', () => {
  const program = (name: string, picture: () => string): Program & { keys: string[] } => {
    const keys: string[] = [];
    return {
      keys,
      frame: picture,
      render: (screen) => {
        screen.clear();
        screen.put(0, 0, name + ' ' + picture());
      },
      key: (event) => (keys.push(event.key), true),
    };
  };
  it('repaints only when the active picture changes and routes keys to the top program', () => {
    const host = new ProgramHost();
    let version = 1;
    const shell = program('SHELL', () => String(version));
    host.push(shell);
    const first = host.frame();
    expect(host.frame()).toBe(first);
    version++;
    expect(host.frame()).not.toBe(first);
    expect(host.screen.text.split('\n')[0]).toBe('SHELL 2');
    const editor = program('EDIT', () => 'x');
    host.push(editor);
    host.frame();
    expect(host.screen.text.split('\n')[0]).toBe('EDIT x');
    host.key({ key: 'F10', ctrl: false, alt: false, shift: false });
    expect(editor.keys).toEqual(['F10']);
    host.exit(editor);
    host.frame();
    expect(host.screen.text.split('\n')[0]).toBe('SHELL 2');
    expect(shell.keys).toEqual([]);
  });
});
