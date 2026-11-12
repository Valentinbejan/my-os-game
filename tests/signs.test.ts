import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import type { Clock, TerminalEvent } from '../src/game/types';
import { ModelClient } from '../src/model/ModelClient';
import {
  ANDERSON_MURMURS,
  PHANTOMS,
  PROMPT_MASKS,
  SignDeck,
  personalLine,
  signsFor,
  type Sign,
} from '../src/story/director';
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
  return { game, events, text, writes, advance: (ms: number) => (now += ms) };
}
const log = (game: GameEngine) => game.fs.get('C:\\AEGIS\\LOGS\\EVENTS.LOG')!.content;

describe('her signs: what she can do, and when', () => {
  it('grows with her light; the ones that need the prompt wait outside programs', () => {
    const watching = signsFor('WATCHING', {}, { atPrompt: true, idle: true });
    expect(watching).toEqual(
      expect.arrayContaining(['line', 'personal', 'glass', 'prompt', 'clock']),
    );
    for (const later of ['phantom', 'flash', 'brownout', 'file', 'anderson'] as Sign[])
      expect(watching).not.toContain(later);
    // Anderson murmurs once the donor record has woken him; the clock slips once a night.
    expect(
      signsFor('WATCHING', { 'anderson:wakes': true }, { atPrompt: true, idle: true }),
    ).toContain('anderson');
    expect(
      signsFor('WATCHING', { 'sign:clock': true }, { atPrompt: true, idle: true }),
    ).not.toContain('clock');
    const recording = signsFor('RECORDING', {}, { atPrompt: true, idle: true });
    expect(recording).toEqual(expect.arrayContaining(['phantom', 'flash', 'brownout', 'file']));
    // The phantom command waits until the operator has stopped typing.
    expect(signsFor('RECORDING', {}, { atPrompt: true, idle: false })).not.toContain('phantom');
    // Inside a program only what works over it.
    const inProgram = signsFor(
      'TRACKING',
      { 'anderson:wakes': true },
      { atPrompt: false, idle: true },
    );
    expect([...inProgram].sort()).toEqual(['brownout', 'file', 'glass', 'line', 'personal']);
  });
  it('draws from a shuffled deck: nothing repeats until every kind has come up', () => {
    const deck = new SignDeck(() => 0.37);
    const allowed: Sign[] = ['line', 'personal', 'glass', 'prompt', 'clock'];
    const drawn = allowed.map(() => deck.draw(allowed));
    expect(new Set(drawn).size).toBe(allowed.length);
    // Kinds not allowed now stay in the deck for later.
    const next = deck.draw(['glass', 'line']);
    expect(['glass', 'line']).toContain(next);
  });
  it('lines about the operator use what the machine knows about them', () => {
    const facts = { name: 'MARIA', time: '03:12', lastFile: 'DONOR.TXT', clues: 7, total: 25 };
    const lines = [0, 1, 2, 3].map((n) => personalLine(facts, n));
    expect(lines.join('\n')).toContain('MARIA');
    expect(lines.join('\n')).toContain('03:12');
    expect(lines.join('\n')).toContain('DONOR.TXT');
    expect(lines.join('\n')).toMatch(/\b7\b/);
    // Without a name, the other things.
    const nameless = [0, 1, 2, 3].map((n) => personalLine({ ...facts, name: null }, n));
    expect(nameless.join('\n')).not.toContain('MARIA');
    expect(nameless.every(Boolean)).toBe(true);
  });
});

describe('her signs, each one', () => {
  it('a line about you, with the name signed on the handover form', async () => {
    const { game, text } = night();
    await game.start();
    const form = game.fs.get('C:\\DOCS\\HANDOVER.WP')!;
    game.fs.write('C:\\DOCS\\HANDOVER.WP', {
      ...form,
      content: form.content.replace('RELIEVED BY:', 'RELIEVED BY: Maria Voss'),
    });
    await game.sign('personal');
    expect(text()).toContain('MARIA VOSS');
  });
  it('a file about you, listing what you read tonight', async () => {
    const { game } = night();
    await game.start();
    await game.submit('TYPE SHIFT_17.TXT');
    await game.sign('file');
    const file = game.fs.get('C:\\AEGIS\\OPERATOR.LOG');
    expect(file?.content).toMatch(/\d\d:\d\d +SHIFT_17\.TXT/);
    expect(log(game)).toContain('WROTE C:\\AEGIS\\OPERATOR.LOG');
  });
  it('the prompt changes until the next command', async () => {
    const { game } = night();
    await game.start();
    await game.sign('prompt');
    expect(PROMPT_MASKS.map((m) => m + ' ')).toContain(game.prompt);
    await game.submit('VER');
    expect(game.prompt).toBe('C:\\AEGIS> ');
  });
  it('the clock slips back to the evening it happened, for one command', async () => {
    const { game, text } = night();
    await game.start();
    await game.sign('clock');
    expect(text()).toContain('SYSTEM DATE: 31-OCT-1991  18:06:11');
    expect(game.state.flags['sign:clock']).toBe(true);
    // DATE, as on DOS, then asks for a new one: Enter keeps it.
    const date = async () => {
      const asked = game.submit('DATE');
      await vi.waitFor(() => expect(game.canInput).toBe(true));
      await game.submit('');
      await asked;
    };
    await date();
    expect(text()).toMatch(/Current date is \w+ 10-31-1991/);
    const before = text().length;
    await date();
    expect(text().slice(before)).toMatch(/Current date is \w+ 12-08-1991/);
  });
  it('a phantom command types itself and runs', async () => {
    const { game, text } = night();
    await game.start();
    await game.sign('phantom');
    expect(text().replace(/\r?\n/g, '\n')).toContain('C:\\AEGIS> ' + PHANTOMS[0]);
  });
  it('Anderson murmurs, only once he has woken', async () => {
    const { game, writes } = night();
    await game.start();
    await game.sign('anderson');
    expect(writes().some((w) => ANDERSON_MURMURS.some((m) => w.text.includes(m)))).toBe(false);
    game.state.flags['anderson:wakes'] = true;
    await game.sign('anderson');
    const murmur = writes().find((w) => ANDERSON_MURMURS.some((m) => w.text.includes(m)));
    expect(murmur?.dim).toBe(true);
  });
  it('a brownout: the tube re-warms and the log records the dip', async () => {
    const { game, events } = night();
    await game.start();
    await game.sign('brownout');
    expect(events).toContainEqual({ type: 'brownout' });
    expect(log(game)).toContain('BUS VOLTAGE DIP');
  });
  it('a subliminal flash of the scream, a quarter of a second', async () => {
    const { game } = night();
    await game.start();
    const at = performance.now();
    await game.sign('flash');
    expect(game.portrait.frame(at + 100)).toMatch(/^video,/);
    expect(game.portrait.frame(at + 2000)).not.toMatch(/^video,/);
  });
});

describe('after an ending', () => {
  it('the credits are called for after the epilogue', async () => {
    const { game, events } = night();
    await game.start();
    game.machine.state.cell = 0;
    game.pulse();
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (let n = 0; n < 50 && !events.some((e) => e.type === 'credits'); n++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    const credits = events.findIndex((e) => e.type === 'credits');
    const epilogue = events.findIndex(
      (e) => e.type === 'write' && e.text.includes('SHE NEVER LEARNED HER NAME'),
    );
    expect(epilogue).toBeGreaterThan(-1);
    expect(credits).toBeGreaterThan(epilogue);
  });
});
