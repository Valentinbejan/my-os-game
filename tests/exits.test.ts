import { describe, expect, it } from 'vitest';
import type { KeyEvent, ProgramSystem } from '../src/programs/Program';
import { EditProgram } from '../src/programs/edit/EditProgram';
import { WriteProProgram } from '../src/programs/writepro/WriteProProgram';
import { CalcPlanProgram } from '../src/programs/calcplan/CalcPlanProgram';
import { ComLinkProgram } from '../src/programs/comlink/ComLinkProgram';
import { CamsProgram } from '../src/programs/cams/CamsProgram';
import { CHAT_BAR, ShellProgram } from '../src/programs/ShellProgram';
import { Portrait } from '../src/screen/face';
import { Screen } from '../src/screen/Screen';
import { GameEngine } from '../src/game/GameEngine';
import { ModelClient } from '../src/model/ModelClient';
import { TerminalBuffer } from '../src/terminal/TerminalBuffer';
import { TerminalInput } from '../src/terminal/TerminalInput';
import type { Clock, TerminalEvent } from '../src/game/types';
const key = (name: string): KeyEvent => ({ key: name, ctrl: false, alt: false, shift: false });
/** A workstation with nothing on it that counts how often a program asks to leave. */
function system() {
  const left = { count: 0 };
  const stub: ProgramSystem = {
    cwd: 'C:\\',
    resolve: (path) => 'C:\\' + path.toUpperCase(),
    read: () => 'missing',
    write: () => 'ok',
    list: () => [],
    folders: () => [],
    stat: () => null,
    now: () => ({ date: '12-08-91', time: '02:14:00', weekday: 'Sun' }),
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
    exit: () => void left.count++,
  };
  return { stub, left };
}
const bottom = (program: { render(screen: Screen): void }) => {
  const screen = new Screen();
  program.render(screen);
  return screen.text.split('\n')[24] ?? '';
};
describe('Esc leaves every program, and each one says so on its screen', () => {
  it('EDIT', () => {
    const { stub, left } = system();
    const program = new EditProgram(stub, null);
    expect(bottom(program)).toContain('<Esc=Exit>');
    program.key(key('Escape'));
    expect(left.count).toBe(1);
  });
  it('WRITEPRO asks about saving, then whether to leave', () => {
    const { stub, left } = system();
    const program = new WriteProProgram(stub, null);
    expect(bottom(program)).toContain('Esc or F7 Exit');
    program.key(key('Escape'));
    expect(bottom(program)).toContain('Save document?');
    program.key(key('n'));
    expect(bottom(program)).toContain('Exit WRITEPRO?');
    program.key(key('y'));
    expect(left.count).toBe(1);
  });
  it('CALCPLAN asks, as /Quit does', () => {
    const { stub, left } = system();
    const program = new CalcPlanProgram(stub, null);
    expect(bottom(program)).toContain('Esc Quit');
    program.key(key('Escape'));
    const screen = new Screen();
    program.render(screen);
    expect(screen.text).toContain('End CALCPLAN and return to DOS?');
    program.key(key('Y'));
    expect(left.count).toBe(1);
  });
  it('COMLINK asks, and shows F3 while a line is up', () => {
    const { stub, left } = system();
    const program = new ComLinkProgram(stub, null, () => 0);
    expect(bottom(program)).toContain('ESC EXIT');
    expect(bottom(program)).not.toContain('F3 HANG UP');
    program.key(key('Escape'));
    const screen = new Screen();
    program.render(screen);
    expect(screen.text).toContain('Exit COMLINK PLUS?');
    program.key(key('y'));
    expect(left.count).toBe(1);
  });
  it('CAMS: from a picture back to the list, then out', () => {
    const { stub, left } = system();
    const program = new CamsProgram(stub, null, () => 0);
    expect(bottom(program)).toContain('ESC EXIT');
    program.key(key('Enter'));
    program.key(key('Escape'));
    expect(left.count).toBe(0);
    program.key(key('Escape'));
    expect(left.count).toBe(1);
  });
});
describe('the channel says how to leave it', () => {
  function night() {
    const events: TerminalEvent[] = [];
    let now = 0;
    const clock: Clock = { now: () => now, wait: async (ms) => void (now += ms) };
    const model = new ModelClient(
      { health: async () => false, stream: async () => undefined },
      'test',
      true,
    );
    const game = new GameEngine(
      async (e) => void events.push(e),
      model,
      () => undefined,
      clock,
    );
    const text = () =>
      events
        .filter((e) => e.type === 'write')
        .map((e) => e.type === 'write' && e.text)
        .join('');
    return { game, text };
  }
  it('EXIT, QUIT or /EXIT close it; a sentence with "exit" in it is still talk', async () => {
    const { game, text } = night();
    await game.start();
    await game.submit('STATUS');
    await game.submit('TYPE SHIFT_17.TXT');
    for (const leave of ['exit', 'QUIT', '/EXIT', '/quit', 'DISCONNECT']) {
      await game.submit('CONNECT 04');
      expect(text()).toContain('CHANNEL 04 OPEN. TYPE TO TALK; ESC OR EXIT CLOSES IT.');
      expect(game.state.connected).toBe(true);
      await game.submit(leave);
      expect(game.state.connected, leave).toBe(false);
    }
    await game.submit('CONNECT 04');
    await game.submit('where is the exit?');
    expect(game.state.connected).toBe(true);
  });
  it('a bar at the foot of the screen, only while the channel is open', async () => {
    const { game } = night();
    const shell = new ShellProgram({
      buffer: new TerminalBuffer(),
      input: new TerminalInput(),
      engine: () => game,
      typed: () => undefined,
      refresh: () => undefined,
    });
    await game.start();
    await game.submit('STATUS');
    expect(bottom(shell)).not.toContain('CHANNEL 04');
    await game.submit('CONNECT 04');
    expect(bottom(shell)).toBe(CHAT_BAR.trimEnd());
    expect(CHAT_BAR).toContain('ESC OR EXIT CLOSES THE CHANNEL');
    await game.submit('EXIT');
    expect(bottom(shell)).not.toContain('CHANNEL 04');
  });
});
