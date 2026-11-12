import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import { newGame, type Clock, type TerminalEvent } from '../src/game/types';
import { decodeSave } from '../src/game/saves';
import { ModelClient } from '../src/model/ModelClient';
import { AFTER_PHOTOGRAPH, ANDERSON } from '../src/story/director';
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
  const writes = () => events.flatMap((e) => (e.type === 'write' ? [e] : []));
  const text = () =>
    writes()
      .map((e) => e.text)
      .join('');
  return { game, events, text, writes };
}
describe('a night with or without the task line', () => {
  it('is guided unless the player chose to play on their own, and F2 keeps the choice', async () => {
    const { game } = night();
    await game.start();
    expect(game.status().guided).toBe(true);
    await game.restart(false);
    expect(game.state.flags.unguided).toBe(true);
    expect(game.status().guided).toBe(false);
    // F2 after an ending restarts the same kind of night.
    await game.restart();
    expect(game.status().guided).toBe(false);
    await game.restart(true);
    expect(game.state.flags.unguided).toBeUndefined();
    expect(game.status().guided).toBe(true);
  });
});
describe('the nudges an unguided night needs', () => {
  it('CONNECT 04 before the bus is checked says what to do first', async () => {
    const { game, text } = night();
    await game.start();
    await game.submit('CONNECT 04');
    expect(text()).toContain('CHANNEL NOT AVAILABLE. RUN STATUS TO CHECK THE BUS.');
    await game.submit('CONNECT 05');
    expect(text()).toMatch(/CHANNEL NOT AVAILABLE\s*$/m);
  });
  it('at the photograph Anderson tells the operator how to protect themselves', async () => {
    const { game, writes } = night();
    await game.start();
    await game.submit('STATUS');
    await game.submit('TYPE SHIFT_17.TXT');
    await game.submit('CONNECT 04');
    game.discover(['annaName', 'cars', 'effects', 'showers']);
    await game.submit('is your name anna?');
    game.discover(['incinerator']);
    await game.submit('the incinerator ran for fourteen hours');
    expect({
      act: game.state.act,
      phase: game.state.phase,
      photo: game.state.flags.photograph,
    }).toEqual({ act: 4, phase: 'final_choice', photo: true });
    // The terminal breaks lines with CR LF: find him by his last line.
    const warning = writes().find((e) => e.text.includes('PS. SUSPEND 05. 06. 03.'));
    expect(warning?.dim).toBe(true);
    expect(ANDERSON.photograph).toMatch(/PS\. SUSPEND 05\. 06\. 03\./);
    // His warning costs the operator nothing with her.
    expect(game.state.suspicion ?? 0).toBeLessThanOrEqual(AFTER_PHOTOGRAPH);
    // And his later warning names the processes too.
    expect(ANDERSON.warns).toMatch(/SUSPEND 05\. 06\. 03\./);
  });
  it('the override procedure says, in plain sight, where the password is', async () => {
    const { game, text } = night();
    await game.start();
    await game.submit('TYPE C:\\DOCS\\PROCEDUR.WP');
    expect(text()).toMatch(/The supervisor\s+password is in D\.H\.'s comment below/);
    expect(text()).toContain('(Reveal Codes, F11)');
  });
});
describe('the choice is remembered', () => {
  it('saves the last choice with the settings; an older save counts as guided', () => {
    const save = (settings: object) =>
      JSON.stringify({ version: 2, game: newGame(), settings, archive: {} });
    expect(decodeSave(save({ guided: false }))?.settings.guided).toBe(false);
    expect(decodeSave(save({}))?.settings.guided).toBe(true);
  });
});
