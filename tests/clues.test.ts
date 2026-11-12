import { describe, expect, it } from 'vitest';
import { CLUES, markClues } from '../src/story/clues';
import { Screen } from '../src/screen/Screen';
import { diskImage, deletedAtStart } from '../src/story/disk/image';
import type { FileEntry } from '../src/os/fs/FileSystem';
import type { ProgramSystem } from '../src/programs/Program';
import { WriteProProgram } from '../src/programs/writepro/WriteProProgram';
import { CalcPlanProgram } from '../src/programs/calcplan/CalcPlanProgram';
import { FreeNetHost } from '../src/story/hosts/freenet';
import { HqHost } from '../src/story/hosts/hq';
import type { HostLink } from '../src/programs/comlink/host';
import { Portrait } from '../src/screen/face';
import { CamsProgram } from '../src/programs/cams/CamsProgram';
import { ARCHIVE } from '../src/programs/cams/cameras';
import { loadPictures } from '../src/programs/cams/pictures';
const key = (key: string) => ({ key, alt: false, ctrl: false, shift: false });
describe('red clues', () => {
  it('turns every phrase on the page red, and says which clues were shown', () => {
    const screen = new Screen();
    screen.put(0, 3, 'LEVEL B2: 14 cars still parked. Nobody drove out.');
    screen.put(2, 9, 'MSG #262  HE NEVER CAME HOME');
    expect(markClues(screen.cells).sort()).toEqual(['cars', 'neverHome']);
    const red = (row: number) =>
      screen.cells
        .slice(row * 80, row * 80 + 80)
        .filter((cell) => cell.palette === 'red')
        .map((cell) => cell.char)
        .join('');
    expect(red(3)).toBe('14 cars still parked');
    expect(red(9)).toBe('HE NEVER CAME HOME');
    expect(red(0)).toBe('');
  });
  it('does not count a phrase split across two lines', () => {
    const screen = new Screen();
    screen.put(70, 5, 'MY SISTER');
    screen.put(0, 6, 'ANNA');
    expect(markClues(screen.cells)).toEqual([]);
    expect(screen.cells.some((cell) => cell.palette === 'red')).toBe(false);
  });
  it('has 25 clues with unique ids and phrases', () => {
    expect(CLUES).toHaveLength(25);
    expect(new Set(CLUES.map((c) => c.id)).size).toBe(25);
    const phrases = CLUES.flatMap((c) => c.phrases.map((p) => p.toLowerCase()));
    expect(new Set(phrases).size).toBe(phrases.length);
    expect(CLUES.filter((c) => c.crack)).toHaveLength(5);
  });
});
/** Every page of a text file as TYPE leaves it on the 80-column terminal. */
function typed(content: string): string[] {
  const rows = content
    .split('\n')
    .flatMap((line) => (line.length ? line.match(/.{1,80}/g)! : ['']));
  const seen = new Set<string>();
  for (let top = 0; top < rows.length; top += 20) {
    const screen = new Screen();
    rows.slice(top, top + 25).forEach((row, y) => screen.put(0, y, row));
    markClues(screen.cells).forEach((id) => seen.add(id));
  }
  return [...seen];
}
function system(files: Map<string, FileEntry>): ProgramSystem {
  return {
    cwd: 'C:\\',
    resolve: (path) => path,
    read: (path) => {
      const entry = files.get(path);
      return entry ? { path, entry: { ...entry, damaged: false } } : 'missing';
    },
    write: () => 'ok',
    list: () => [],
    folders: () => [],
    stat: (path) => (files.has(path) ? { size: 1, date: '', time: '', dir: false } : null),
    now: () => ({ date: '12-08-91', time: '02:20:00', weekday: 'Sun' }),
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
  };
}
/** Pages through a program, key by key, and collects the clues each page showed. */
function paged(program: WriteProProgram | CalcPlanProgram, keys: string[]): string[] {
  const seen = new Set<string>();
  const look = () => {
    const screen = new Screen();
    program.render(screen);
    markClues(screen.cells).forEach((id) => seen.add(id));
  };
  look();
  for (const name of keys) {
    program.key(key(name));
    look();
  }
  return [...seen];
}
/** What a caller sees reading every bulletin and every post on a remote system. */
function remote(host: FreeNetHost | HqHost, script: string[]): string[] {
  let text = '';
  const link: HostLink = {
    send: (chunk) => (text += chunk),
    hangup: () => undefined,
    offer: () => undefined,
    expectUpload: () => undefined,
  };
  host.connect(link);
  for (const line of script) {
    for (const char of line) host.key(char);
    host.key('\r');
  }
  return typed(text.replace(/\r/g, ''));
}
describe('every clue can be found', () => {
  it('whole, on one line, in the program that shows it or on a remote system', async () => {
    const files = new Map<string, FileEntry>(Object.entries(diskImage));
    for (const { path, entry } of deletedAtStart()) files.set(path, entry);
    const seen = new Map<string, string>();
    const record = (ids: string[], where: string) =>
      ids.forEach((id) => seen.set(id, seen.get(id) ?? where));
    for (const [path, entry] of files) {
      if (entry.kind === 'text') record(typed(entry.content), path);
      if (entry.kind === 'wp') {
        const lines = entry.content.split('\n').length;
        record(
          paged(new WriteProProgram(system(files), path), Array(lines + 25).fill('ArrowDown')),
          path,
        );
      }
      if (entry.kind === 'sheet') {
        const down = Array(45).fill('ArrowDown');
        const across = Array(10).fill('ArrowRight');
        record(
          paged(new CalcPlanProgram(system(files), path), [...down, 'Home', ...across, ...down]),
          path,
        );
      }
    }
    // The camera pictures, each viewed until it has loaded.
    await loadPictures();
    ARCHIVE.forEach((camera, n) => {
      let now = 0;
      const cams = new CamsProgram(system(files), null, () => now);
      for (let step = 0; step < n; step++) cams.key(key('ArrowDown'));
      cams.key(key('Enter'));
      now = 60_000;
      cams.frame();
      const screen = new Screen();
      cams.render(screen);
      record(markClues(screen.cells), 'CAMS ' + camera.camera);
    });
    const read = (boards: number[][]) =>
      boards.flatMap(([board, posts]) => [
        String(board),
        ...Array.from({ length: posts }, (_, n) => [String(n + 1), 'Q']).flat(),
        '',
      ]);
    const context = {
      now: () => ({ date: '12-08-91', time: '02:31:00', weekday: 'Sun' }),
      note: () => undefined,
      uploaded: () => undefined,
      posted: () => undefined,
    };
    record(
      remote(new FreeNetHost(context), [
        'guest',
        'B',
        '1',
        '2',
        '3',
        '',
        'M',
        ...read([
          [1, 3],
          [2, 6],
          [3, 3],
        ]),
      ]),
      'FREE-NET',
    );
    const missing = CLUES.filter((c) => !seen.has(c.id)).map((c) => `${c.id} (${c.where})`);
    expect(missing).toEqual([]);
  });
});
