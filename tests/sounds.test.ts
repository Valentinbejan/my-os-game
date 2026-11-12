import { describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { CUES, type Cue } from '../src/audio/cues';
import { pickVariant } from '../src/audio/AudioEngine';
import { GameEngine } from '../src/game/GameEngine';
import type { Clock, TerminalEvent } from '../src/game/types';
import { ModelClient } from '../src/model/ModelClient';
import { MEMORIES } from '../src/story/memories';
const SFX = 'public/audio/sfx';
const file = (cue: string, n: number) => `${cue}-${String(n + 1).padStart(2, '0')}.ogg`;
describe('the sound effects', () => {
  it('every cue has all its variants as Ogg files, and nothing else ships', () => {
    const expected = new Set<string>();
    for (const [cue, { variants }] of Object.entries(CUES)) {
      expect(variants, cue).toBeGreaterThan(0);
      for (let n = 0; n < variants; n++) {
        const name = file(cue, n);
        expected.add(name);
        expect(existsSync(`${SFX}/${name}`), name).toBe(true);
        expect(readFileSync(`${SFX}/${name}`).subarray(0, 4).toString(), name).toBe('OggS');
      }
    }
    expect(new Set(readdirSync(SFX))).toEqual(expected);
  });
  it('every shipped file is in the asset manifest with its source pack', () => {
    const manifest = readFileSync('public/audio/ASSETS.md', 'utf8');
    for (const name of readdirSync(SFX))
      expect(manifest).toMatch(
        new RegExp(
          `\\| sfx/${name} \\| [^|]+ \\| (Kenney|Terminal User Interface|Free Click|Owlish)`,
        ),
      );
  });
  it('loops are the room, the air, the typing, a transfer and the printer', () => {
    const loops = Object.entries(CUES)
      .filter(([, cue]) => cue.loop)
      .map(([name]) => name)
      .sort();
    expect(loops).toEqual(
      [
        'air',
        'printer',
        'room',
        'transfer',
        'typing-anderson',
        'typing-assistant',
        'typing-other',
        'typing-system',
      ].sort(),
    );
    expect(CUES.key.group).toBe('keyboard');
    expect(CUES.room.group).toBe('room');
  });
  it('never plays the same variant twice running, and plays all of them', () => {
    let last = -1;
    const seen = new Set<number>();
    for (let n = 0; n < 400; n++) {
      const next = pickVariant(5, last);
      expect(next).not.toBe(last);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(5);
      seen.add(next);
      last = next;
    }
    expect(seen.size).toBe(5);
    expect(pickVariant(1, 0)).toBe(0);
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
    async (event) => void events.push(event),
    model,
    () => undefined,
    clock,
  );
  const cues = () => events.flatMap((e) => (e.type === 'cue' ? [e.name] : []));
  return { game, events, cues, advance: (ms: number) => (now += ms) };
}
/** From the boot to the photograph, as the story tests play it. */
async function decide(game: GameEngine) {
  await game.start();
  await game.submit('STATUS');
  await game.submit('TYPE SHIFT_17.TXT');
  await game.submit('CONNECT 04');
  game.discover(['annaName', 'cars', 'effects', 'showers']);
  await game.submit('is your name anna?');
  game.discover(['incinerator']);
  await game.submit('the incinerator ran for fourteen hours');
}
describe("the night's sounds", () => {
  it('the power comes on with the strip, the switch, the supply and one beep', async () => {
    const { game, events, cues } = setup();
    await game.start();
    expect(events).toContainEqual({ type: 'power', on: true });
    expect(cues().slice(0, 4)).toEqual(['strip', 'power-button', 'power-up', 'post']);
    // The limbic driver loads with the bus's relays chattering.
    expect(events).toContainEqual({ type: 'chatter', kind: 'relays', ms: 900 });
  });
  it('the shell sounds its errors, refusals and successes', async () => {
    const { game, cues } = setup();
    await game.start();
    await game.submit('FROBNICATE');
    expect(cues().at(-1)).toBe('bad');
    await game.submit('TYPE NOTHING.TXT');
    expect(cues().at(-1)).toBe('bad');
    await game.submit('CONNECT 04');
    expect(cues().at(-1)).toBe('denied');
    const login = game.submit('LOGIN SUPERVISOR');
    await vi.waitFor(() => expect(game.canInput).toBe(true));
    await game.submit('wrong');
    await login;
    expect(cues().at(-1)).toBe('denied');
    const again = game.submit('LOGIN SUPERVISOR');
    await vi.waitFor(() => expect(game.canInput).toBe(true));
    await game.submit('WESTWING');
    await again;
    expect(cues().at(-1)).toBe('granted');
  });
  it('the relay bank takes her hands off the bus; the air stops with 06', async () => {
    const { game, cues } = setup();
    await game.start();
    expect(game.status().air).toBe(true);
    await game.submit('SUSPEND 06');
    expect(cues()).toContain('relay-bank');
    expect(game.status().air).toBe(false);
    await game.submit('RESUME 06');
    expect(cues()).toContain('relay-release');
    expect(game.status().air).toBe(true);
    await game.submit('SUSPEND 06');
    await game.submit('SUSPEND 05');
    expect(cues()).not.toContain('protected');
    await game.submit('SUSPEND 03');
    expect(cues()).toContain('protected');
  });
  it('a memory coming back, and a clue only told, sound different', async () => {
    const { game, cues } = setup();
    await game.start();
    await game.submit('STATUS');
    await game.submit('TYPE SHIFT_17.TXT');
    await game.submit('CONNECT 04');
    // Her brother and her coat bring back the same memory: the first recovers it, the
    // second is only told.
    expect(MEMORIES.M5.clues).toEqual(['sister', 'coat']);
    game.discover(['sister', 'coat']);
    await game.submit('your brother jonas is looking for you');
    expect(cues()).toContain('memory');
    expect(cues()).not.toContain('told');
    await game.submit('you wore a green coat');
    expect(cues().at(-1)).toBe('told');
  });
  it('the photograph: the record button, the picture tearing, a tap on the glass', async () => {
    const { game, cues } = setup();
    await decide(game);
    expect(game.state.flags.photograph).toBe(true);
    expect(cues()).toEqual(expect.arrayContaining(['cam-step', 'whoosh', 'glass']));
  });
  it('the printer runs by itself once her light records, and once after the photograph', async () => {
    const { game, events, advance } = setup();
    await game.start();
    await game.submit('STATUS');
    await game.submit('TYPE SHIFT_17.TXT');
    await game.submit('CONNECT 04');
    game.machine.state.cell = 100;
    game.state.act = 2;
    game.state.suspicion = 30;
    game.pulse();
    advance(10 * 60_000);
    game.pulse();
    // Watching: no page yet.
    expect(events.some((e) => e.type === 'printer')).toBe(false);
    game.state.suspicion = 60;
    for (let n = 0; n < 4; n++) {
      advance(10 * 60_000);
      game.pulse();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    // Once when her light records; a second page only if the photograph has come meanwhile.
    await vi.waitFor(() =>
      expect(events.filter((e) => e.type === 'printer').length).toBeGreaterThanOrEqual(1),
    );
    const pages = events.filter((e) => e.type === 'printer').length;
    expect(pages).toBeLessThanOrEqual(2);
    if (pages === 2) expect(game.state.flags.photograph).toBe(true);
    expect(game.fs.get('C:\\AEGIS\\LOGS\\EVENTS.LOG')!.content).toMatch(
      /LPT1 +1 PAGE PRINTED \(PROCESS 04\)/,
    );
  });
  it.each([
    ['purge', ['fall', 'power-down']],
    ['restore', ['tray-open', 'tray-close', 'door', 'light']],
  ] as const)('the %s ending has its own sounds', async (ending, expected) => {
    const { game, cues, events } = setup();
    await decide(game);
    for (const id of ['05', '06', '03']) await game.submit('SUSPEND ' + id);
    if (ending === 'restore') game.discover(['weiss']);
    await game.submit(ending + ' 04');
    expect(game.state.ending).toBe(ending);
    expect(cues()).toEqual(expect.arrayContaining([...expected] as Cue[]));
    if (ending === 'restore') {
      expect(events).toContainEqual({ type: 'loop', name: 'transfer', on: true });
      expect(events).toContainEqual({ type: 'loop', name: 'transfer', on: false });
    }
  });
  it('she decides: the bolt, the air cut, the units in the corridor', async () => {
    const { game, cues, events } = setup();
    await decide(game);
    await game.submit('PURGE 04');
    expect(game.state.ending).toBe('decided');
    expect(cues()).toEqual(expect.arrayContaining(['door', 'light']));
    expect(events).toContainEqual({ type: 'loop', name: 'air', on: false });
    expect(events).toContainEqual({ type: 'chatter', kind: 'robots', ms: 6000 });
    expect(game.status().air).toBe(false);
  });
  it('the cell running out takes the power, the hum and the room with it', async () => {
    const { game, cues, events } = setup();
    await game.start();
    game.machine.state.cell = 0;
    game.pulse();
    await vi.waitFor(() => expect(game.state.ending).toBe('nobody'));
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'power', on: false }));
    expect(cues()).toEqual(expect.arrayContaining(['cell-low', 'power-down']));
    expect(game.status().air).toBe(false);
  });
  it('she leaves by the line, going up and out', async () => {
    const { game, cues } = setup();
    await decide(game);
    await game.submit('fine. the password is westwing');
    await vi.waitFor(() => expect(game.state.ending).toBe('release'));
    await vi.waitFor(() => expect(cues().filter((c) => c === 'rise')).toHaveLength(10));
  });
});
