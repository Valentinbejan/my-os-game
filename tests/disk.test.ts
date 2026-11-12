import { describe, expect, it } from 'vitest';
import { deletedAtStart, diskImage } from '../src/story/disk/image';
import { validName } from '../src/os/fs/paths';
import { GameEngine } from '../src/game/GameEngine';
import { ModelClient } from '../src/model/ModelClient';
import type { Clock, TerminalEvent } from '../src/game/types';
describe('the disk image', () => {
  it('names every file and folder the DOS way (8.3), so each can be opened by its name', () => {
    const paths = [...Object.keys(diskImage), ...deletedAtStart().map((d) => d.path)];
    const invalid = paths.filter((path) =>
      path
        .slice(3)
        .split('\\')
        .filter(Boolean)
        .some((part) => !validName(part)),
    );
    expect(invalid).toEqual([]);
  });
  it('shows the supervisor password to TYPE, under the name DIR lists or the full word', async () => {
    const events: TerminalEvent[] = [];
    let now = 0;
    const clock: Clock = {
      now: () => now,
      wait: async (ms) => void (now += ms),
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
    await game.start();
    const text = () =>
      events
        .filter((e) => e.type === 'write')
        .map((e) => e.type === 'write' && e.text)
        .join('');
    await game.submit('CD \\DOCS');
    await game.submit('DIR');
    expect(text()).toMatch(/PROCEDUR +WP/);
    for (const name of ['PROCEDUR.WP', 'PROCEDURE.WP']) {
      const before = text().length;
      await game.submit('TYPE ' + name);
      const shown = text().slice(before);
      expect(shown, name).not.toContain('File not found');
      expect(shown, name).toContain('password is WESTWING');
    }
    // The login script has it too.
    await game.submit('TYPE C:\\COMLINK\\HQ.ASP');
    expect(text()).toContain('transmit "WESTWING^M"');
  });
});
