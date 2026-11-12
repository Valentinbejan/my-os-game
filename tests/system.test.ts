import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import type { Clock, TerminalEvent } from '../src/game/types';
import { ModelClient } from '../src/model/ModelClient';
import { Machine, newMachine } from '../src/os/system/Machine';
describe('auxiliary bus', () => {
  it('drains the cell by load and stretches the runtime when processes are suspended', () => {
    const machine = new Machine(newMachine());
    expect(machine.load()).toBeCloseTo(1.05);
    expect(machine.runtime()).toBeCloseTo(78.57, 1);
    machine.drain(60 * 60);
    expect(machine.state.cell).toBeCloseTo(11 - 8.4, 1);
    expect(machine.suspend('04')).toBe('suspended');
    expect(machine.suspend('04')).toBe('already');
    expect(machine.suspend('02')).toBe('offline');
    expect(machine.load()).toBeCloseTo(0.19);
    expect(machine.runtime()).toBeGreaterThan(80);
  });
  it('protects the operator once the units, the air and the doors are off the bus', () => {
    const machine = new Machine(newMachine());
    expect(machine.login('SUPERVISOR', 'nope')).toBe(false);
    expect(machine.login('supervisor', 'westwing')).toBe(true);
    expect(machine.protected).toBe(false);
    machine.suspend('05');
    machine.suspend('06');
    expect(machine.protected).toBe(false);
    machine.suspend('03');
    expect(machine.protected).toBe(true);
    // A restart puts them all back on the bus.
    machine.boot(true);
    expect(machine.protected).toBe(false);
    expect(machine.state.user).toBe('OP-17');
  });
});
function setup() {
  const events: TerminalEvent[] = [];
  let now = 0;
  const clock: Clock = {
    now: () => now,
    wait: async (ms, signal) => {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      now += ms;
    },
  };
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
  const settle = async () => {
    for (let n = 0; n < 50; n++) await new Promise((r) => setTimeout(r, 0));
  };
  return {
    game,
    advance: (ms: number) => (now += ms),
    text: () =>
      events
        .filter((e) => e.type === 'write')
        .map((e) => (e as { text: string }).text)
        .join(''),
    /** Runs a command that asks for input, answering each question in turn. */
    async answer(command: string, ...replies: string[]) {
      const running = game.submit(command);
      for (const reply of replies) {
        await settle();
        if (game.waitingForKey) game.key(reply);
        else await game.submit(reply);
      }
      await running;
    },
  };
}
describe('system administration', () => {
  it('gates supervisor files behind a password typed without echo', async () => {
    const { game, text, answer } = setup();
    await game.start();
    await game.submit('TYPE \\LIMBIC\\OPERATE.LOG');
    expect(text()).toContain('Access denied');
    expect(text()).not.toContain('SOURCE BODY NOT SUSTAINED');
    await answer('LOGIN SUPERVISOR', 'guess');
    expect(text()).toContain('LOGIN INCORRECT.');
    await answer('LOGIN SUPERVISOR', 'westwing');
    expect(text()).toContain('SUPERVISOR AUTHORITY GRANTED.');
    expect(text()).not.toContain('westwing');
    await game.submit('TYPE \\LIMBIC\\OPERATE.LOG');
    expect(text()).toContain('SOURCE BODY NOT SUSTAINED');
    await game.submit('LOG');
    expect(text()).toContain('SUPERVISOR LOGIN');
  });
  it('recovers a bad sector on retry and a deleted letter with UNDELETE', async () => {
    const { game, text, answer } = setup();
    await game.start();
    await answer('TYPE \\DOCS\\CONSENT\\LIND.WP', 'I');
    expect(text()).toContain('Data error reading drive C');
    expect(text()).toContain('0'.repeat(64));
    expect(text()).not.toContain('LIND, ANNA M.');
    await answer('TYPE \\DOCS\\CONSENT\\LIND.WP', 'R');
    expect(text()).toContain('LIND, ANNA M.');
    await answer('UNDELETE \\DOCS\\OP17', 'Y', 'L');
    expect(text()).toContain('?ETTER');
    expect(text()).toContain('File successfully undeleted.');
    await game.submit('TYPE \\DOCS\\OP17\\LETTER.WP');
    expect(text()).toContain('I have told Halloran twice.');
  });
  it('sets the clock, suspends the limbic process and reboots without its driver', async () => {
    const { game, text, answer, advance } = setup();
    await game.start();
    await answer('TIME', '25:00', '3:05p');
    expect(text()).toContain('Invalid time');
    expect(game.state.flags.clockSet).toBe(true);
    advance(1000);
    await answer('TIME', '');
    expect(text()).toMatch(/Current time is 3:05:0\d\.00p/);
    await game.submit('SUSPEND 04');
    await game.submit('STATUS');
    await game.submit('CONNECT 04');
    expect(text()).toContain('PROCESS 04 IS SUSPENDED. USE RESUME 04.');
    const config = game.fs.get('C:\\CONFIG.SYS')!;
    game.fs.write('C:\\CONFIG.SYS', {
      ...config,
      content: config.content.replace(/^DEVICE=C:\\LIMBIC.*$/m, 'REM LIMBIC REMOVED'),
    });
    await answer('REBOOT', 'Y');
    expect(game.machine.state.processes['04']).toBe('offline');
    expect(game.fs.get('C:\\AEGIS\\LOGS\\EVENTS.LOG')!.content).toContain('WORKSTATION RESTART');
    // Restarting without LIMBIC.SYS is the silent purge.
    expect(game.state.ending).toBe('purge');
    expect(game.state.flags.silentPurge).toBe(true);
    expect(text()).toContain('NOBODY SAYS GOODNIGHT.');
    expect(text()).toContain('GONE FROM CONFIG.SYS. NOBODY ASKS WHO TOOK IT OUT.');
  });
  it('lists every bus process and reports the doors', async () => {
    const { game, text } = setup();
    await game.start();
    await game.submit('PS');
    expect(text()).toMatch(/05 +MAINTENANCE UNITS +RUNNING +0\.06 kW/);
    expect(text()).toMatch(/06 +VENTILATION +RUNNING +0\.08 kW/);
    await game.submit('DOORS');
    expect(text()).toMatch(/CORRIDOR B-3 \.+ LOCKED/);
    await game.submit('SUSPEND 03');
    await game.submit('DOORS');
    expect(text()).toContain('EVERY DOOR OPENS BY HAND.');
  });
  it('warns when a surface repair runs through the limbic bus', async () => {
    const { game, text } = setup();
    await game.start();
    await game.submit('CHKDSK');
    expect(text()).toContain('Errors found, F parameter not specified');
    await game.submit('CHKDSK /F');
    expect(text()).toContain('IMAGE BLOCKS RELOCATED: 212');
    expect(game.state.flags.surfaceRepair).toBe(true);
    expect(game.fs.get('C:\\DOCS\\CONSENT\\LIND.WP')!.damaged).toBe(false);
  });
});
