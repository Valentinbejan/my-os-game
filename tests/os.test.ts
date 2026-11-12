import { describe, expect, it } from 'vitest';
import { FileSystem, type FileEntry } from '../src/os/fs/FileSystem';
import { matches, resolvePath, validName } from '../src/os/fs/paths';
import { parseLine } from '../src/os/shell/parse';
import { Shell, type ShellIO } from '../src/os/shell/Shell';
import { registerBuiltins, renameWith } from '../src/os/shell/builtins';
import { diskImage, bootedShell } from '../src/story/disk/image';
const text = (content: string, attrs = 'A'): FileEntry => ({
  kind: 'text',
  content,
  date: '11-03-91',
  time: '02:20',
  attrs,
});
function machine(keys: string[] = [], lines: string[] = []) {
  let output = '';
  const launched: string[] = [];
  const io: ShellIO = {
    print: async (value) => {
      output += value;
    },
    clear: async () => {
      output = '';
    },
    readKey: async () => keys.shift() ?? 'Enter',
    readLine: async () => lines.shift() ?? '',
    disk: async () => undefined,
    now: () => ({ date: '11-03-91', time: '02:20:00', weekday: 'Sun' }),
    launch: async (name) => (launched.push(name), name === 'WPRO'),
    observe: () => undefined,
    privileged: () => false,
    setClock: () => true,
  };
  const fs = new FileSystem(diskImage);
  const shell = new Shell(fs, io, bootedShell());
  registerBuiltins(shell);
  return {
    fs,
    shell,
    launched,
    run: async (command: string) => {
      output = '';
      expect(await shell.execute(command)).toBe(true);
      return output;
    },
  };
}
describe('DOS paths and names', () => {
  it('resolves relative, absolute and parent paths and rejects bad names', () => {
    expect(resolvePath('C:\\AEGIS', 'LOGS\\EVENTS.LOG')).toBe('C:\\AEGIS\\LOGS\\EVENTS.LOG');
    expect(resolvePath('C:\\AEGIS\\LOGS', '..\\..\\DOCS')).toBe('C:\\DOCS');
    expect(resolvePath('C:\\AEGIS', '\\temp')).toBe('C:\\TEMP');
    expect(resolvePath('C:\\AEGIS', 'c:readme.txt')).toBe('C:\\AEGIS\\README.TXT');
    // Longer names are cut to 8.3, as DOS cuts them; two dots are still no name at all.
    expect(resolvePath('C:\\', 'TOOLONGNAME.TEXT')).toBe('C:\\TOOLONGN.TEX');
    expect(resolvePath('C:\\DOCS', 'PROCEDURE.WP')).toBe('C:\\DOCS\\PROCEDUR.WP');
    expect(resolvePath('C:\\', 'A.B.C')).toBeNull();
    expect(resolvePath('C:\\', '*.TXT')).toBeNull();
    expect(resolvePath('C:\\', '*.TXT', true)).toBe('C:\\*.TXT');
    expect(validName('A.B.C')).toBe(false);
  });
  it('matches wildcards the DOS way', () => {
    expect(matches('*.LOG', 'EVENTS.LOG')).toBe(true);
    expect(matches('*.*', 'README')).toBe(true);
    expect(matches('EV?NTS.*', 'EVENTS.LOG')).toBe(true);
    expect(matches('A?', 'A')).toBe(true);
    expect(matches('README.', 'README.TXT')).toBe(false);
    expect(renameWith('*.BAK', 'NOTES.TXT')).toBe('NOTES.BAK');
    expect(renameWith('X?Z.*', 'ABC.TXT')).toBe('XBZ.TXT');
  });
  it('parses glued switches, quotes, redirection and pipes', () => {
    expect(parseLine('cd..')).toMatchObject({ name: 'CD', args: ['..'] });
    expect(parseLine('DIR *.TXT/W/p')).toMatchObject({ args: ['*.TXT'], switches: ['W', 'P'] });
    expect(parseLine('find "Door open" A.TXT')).toMatchObject({ args: ['Door open', 'A.TXT'] });
    expect(parseLine('TYPE A.TXT | MORE')).toMatchObject({ filters: [{ name: 'MORE' }] });
    expect(parseLine('DIR >> LIST.TXT')).toMatchObject({
      output: { path: 'LIST.TXT', append: true },
    });
    expect(parseLine('C:\\WRITEPRO\\WPRO X.WP')).toMatchObject({ name: 'C:\\WRITEPRO\\WPRO' });
  });
});
describe('file system', () => {
  it('layers changes over the image and keeps deletions recoverable', () => {
    const fs = new FileSystem(diskImage);
    fs.write('C:\\TEMP\\A.TXT', text('hello'));
    expect(fs.list('C:\\TEMP').map(([name]) => name)).toEqual(['A.TXT']);
    fs.remove('C:\\AEGIS\\README.TXT');
    expect(fs.get('C:\\AEGIS\\README.TXT')).toBeUndefined();
    expect(fs.changes['C:\\AEGIS\\README.TXT']).toBeNull();
    expect(fs.deleted.at(-1)?.path).toBe('C:\\AEGIS\\README.TXT');
    const free = fs.free();
    fs.write('C:\\TEMP\\B.TXT', text('x'.repeat(5000)));
    expect(free - fs.free()).toBe(6144);
    fs.move('C:\\AEGIS\\LOGS', 'C:\\TEMP\\OLD');
    expect(fs.get('C:\\TEMP\\OLD\\EVENTS.LOG')?.kind).toBe('text');
    expect(fs.get('C:\\AEGIS\\LOGS\\EVENTS.LOG')).toBeUndefined();
  });
});
describe('command interpreter', () => {
  it('lists directories in DOS 5 format and hides hidden files', async () => {
    const { run, fs } = machine();
    fs.write('C:\\AEGIS\\SECRET.TXT', text('x', 'AH'));
    const listing = await run('DIR');
    expect(listing).toContain(' Directory of C:\\AEGIS');
    // The size sits right-aligned in a fixed-width column, whatever its digit count.
    expect(listing).toMatch(/^README {3}TXT(?= +\d+ 10-12-91)[ \d]{10} 10-12-91 {3}9:14a$/m);
    expect(listing).toMatch(/^LOGS {9}<DIR> {5}10-12-91 {3}9:02a$/m);
    expect(listing).not.toContain('SECRET');
    expect(listing).toMatch(/bytes free/);
    expect(await run('DIR /A:H')).toContain('SECRET');
    expect(await run('TYPE SECRET.TXT')).toBe('x\n');
    expect(await run('DIR /W')).toContain('[LOGS]');
    expect(await run('DIR NOTHING.*')).toContain('File not found');
  });
  it('navigates, creates and removes directories', async () => {
    const { run, shell } = machine();
    await run('CD \\');
    expect(shell.cwd).toBe('C:\\');
    expect(await run('CD NOWHERE')).toContain('Invalid directory');
    await run('MD WORK');
    await run('CD WORK');
    expect(shell.prompt()).toBe('C:\\WORK>');
    await run('CD..');
    expect(await run('RD AEGIS')).toContain('not empty');
    await run('RD WORK');
    expect(await run('TREE')).toMatch(/├───AEGIS\n│ {3}└───LOGS/);
  });
  it('copies, renames and deletes with wildcards and confirmations', async () => {
    const { run, fs } = machine([], ['N', 'Y']);
    expect(await run('COPY *.LOG \\TEMP')).toContain('1 file(s) copied');
    expect(fs.get('C:\\TEMP\\INCIDENT.LOG')?.content).toContain('(23/23)');
    await run('COPY \\TEMP\\INCIDENT.LOG \\TEMP\\*.BAK');
    expect(fs.get('C:\\TEMP\\INCIDENT.BAK')).toBeDefined();
    await run('REN \\TEMP\\INCIDENT.BAK OLD.TXT');
    expect(fs.get('C:\\TEMP\\OLD.TXT')).toBeDefined();
    expect(await run('COPY README.TXT README.TXT')).toContain('cannot be copied onto itself');
    await run('DEL \\TEMP\\*.*');
    expect(fs.list('C:\\TEMP')).toHaveLength(2);
    await run('DEL \\TEMP\\*.*');
    expect(fs.list('C:\\TEMP')).toHaveLength(0);
    await run('ATTRIB +R README.TXT');
    expect(await run('DEL README.TXT')).toContain('Access denied');
    expect(await run('ATTRIB README.TXT')).toMatch(/^A {6}R {5}C:\\AEGIS\\README\.TXT$/m);
  });
  it('redirects output, filters it and pages long text', async () => {
    const { run, fs } = machine(['X', 'X']);
    await run('DIR > \\TEMP\\LIST.TXT');
    expect(fs.get('C:\\TEMP\\LIST.TXT')?.content).toContain('README');
    expect(await run('TYPE INCIDENT.LOG | FIND "23/23"')).toBe(
      '18:31  All personnel evacuated by bus (23/23).\n',
    );
    expect(await run('FIND /C "18:3" INCIDENT.LOG')).toContain('INCIDENT.LOG: 2');
    fs.write(
      'C:\\TEMP\\LONG.TXT',
      text(Array.from({ length: 50 }, (_, n) => 'LINE ' + n).join('\n')),
    );
    expect((await run('TYPE \\TEMP\\LONG.TXT | MORE')).match(/-- More --/g)).toHaveLength(2);
  });
  it('runs batch files, finds programs along PATH and explains commands', async () => {
    const { run, fs, launched } = machine(['R', 'A']);
    fs.write('C:\\TEMP\\GO.BAT', {
      ...text('@ECHO OFF\nECHO HELLO %1\nREM quiet\nCD \\DOCS'),
      kind: 'batch',
    });
    expect(await run('\\TEMP\\GO NIGHT')).toBe('HELLO NIGHT\n');
    expect(await run('WPRO')).toBe('');
    expect(await run('CALC')).toContain('Program too big to fit in memory');
    expect(launched).toEqual(['WPRO', 'CALC']);
    expect(await run('COPY /?')).toContain('COPY source [destination]');
    expect(await run('A:')).toMatch(
      /Not ready reading drive A\nAbort, Retry, Fail\?R\n\nNot ready/,
    );
  });
  it('types a new file from the keyboard with COPY CON', async () => {
    const { run, fs } = machine([], ['FIRST LINE', 'LAST^Z']);
    expect(await run('COPY CON \\TEMP\\NOTE.TXT')).toContain('1 file(s) copied');
    expect(fs.get('C:\\TEMP\\NOTE.TXT')?.content).toBe('FIRST LINE\nLAST');
  });
});
