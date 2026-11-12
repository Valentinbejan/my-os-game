import { describe, expect, it } from 'vitest';
import { Modem } from '../src/programs/comlink/Modem';
import { TerminalScreen } from '../src/programs/comlink/TerminalScreen';
import { ComLinkProgram } from '../src/programs/comlink/ComLinkProgram';
import type { HostLink, OfferedFile } from '../src/programs/comlink/host';
import type { CommSystem, ProgramSystem } from '../src/programs/Program';
import type { FileKind } from '../src/os/fs/FileSystem';
import { HqHost } from '../src/story/hosts/hq';
import { FreeNetHost } from '../src/story/hosts/freenet';
import { answer, type HostContext } from '../src/story/hosts';
import { Screen } from '../src/screen/Screen';
import { GameEngine } from '../src/game/GameEngine';
import type { Clock, TerminalEvent } from '../src/game/types';
import { ModelClient } from '../src/model/ModelClient';
import { Portrait } from '../src/screen/face';
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
function context() {
  const notes: string[] = [];
  const uploads: Array<[string, string]> = [];
  const posts: Array<[string, string]> = [];
  const ctx: HostContext = {
    now: () => ({ date: '11-03-91', time: '02:31:00', weekday: 'Sun' }),
    note: (event) => notes.push(event),
    uploaded: (name, content) => uploads.push([name, content]),
    posted: (to, text) => posts.push([to, text]),
  };
  return { ctx, notes, uploads, posts };
}
function link() {
  const out = {
    text: '',
    hung: false,
    offers: [] as OfferedFile[],
    upload: null as null | ((n: string, c: string) => void),
  };
  const hostLink: HostLink = {
    send: (text) => (out.text += text),
    hangup: () => (out.hung = true),
    offer: (file) => out.offers.push(file),
    expectUpload: (receive) => (out.upload = receive),
  };
  return { out, hostLink };
}
const typeLine = (host: { key(char: string): void }, text: string) => {
  for (const char of text) host.key(char);
  host.key('\r');
};

describe('COMLINK modem and screen', () => {
  it('answers Hayes commands and returns the dial action', () => {
    const modem = new Modem();
    expect(modem.command('AT').reply).toBe('\r\nOK\r\n');
    expect(modem.command('ATDT 555-0100')).toEqual({
      reply: '',
      action: { kind: 'dial', number: '5550100' },
    });
    expect(modem.command('ATI2').reply).toContain('AEGIS DATAMODEM 2400');
    expect(modem.command('ATE0').reply).toContain('OK');
    expect(modem.echo).toBe(false);
    expect(modem.command('HELLO').reply).toContain('ERROR');
    expect(modem.command('AT%Q').reply).toContain('ERROR');
    expect(modem.command('ATH0').action).toEqual({ kind: 'hangup' });
    modem.command('ATV0');
    expect(modem.result('BUSY')).toBe('7\r');
    expect(modem.command('A/').reply).toBe('0\r');
  });
  it('wraps, scrolls and obeys backspace and form feed', () => {
    const screen = new TerminalScreen();
    screen.write('X'.repeat(85));
    expect(screen.y).toBe(1);
    expect(screen.x).toBe(5);
    screen.write('\b\bAB\r\n');
    expect(screen.text.split('\n')[1]).toBe('XXXAB');
    for (let n = 0; n < 30; n++) screen.write(`LINE ${n}\r\n`);
    expect(screen.text.split('\n')[0]).toBe('LINE 7');
    screen.write('\f');
    expect(screen.text.trim()).toBe('');
  });
});

describe('remote systems', () => {
  it('HQ refuses a bad login, then shows mail, tickets and files, and takes an upload', () => {
    const { ctx, notes, uploads } = context();
    const { out, hostLink } = link();
    const hq = new HqHost(ctx);
    hq.connect(hostLink);
    expect(out.text).toContain('USERNAME: ');
    typeLine(hq, 'rennick');
    typeLine(hq, 'guess');
    expect(out.text).toContain('ACCOUNT SUSPENDED');
    typeLine(hq, 'halloran');
    out.text = '';
    typeLine(hq, 'WESTWING');
    expect(out.text).not.toContain('WESTWING');
    expect(out.text).toContain('MAIN MENU');
    typeLine(hq, 'T');
    typeLine(hq, '7902');
    expect(out.text).toContain('SCHEDULED WASTE DISPOSAL (PROCESS 04). NO ACTION.');
    typeLine(hq, '');
    typeLine(hq, 'M');
    typeLine(hq, '5');
    expect(out.text).toContain('PLEASE SEND SOMEONE KIND.');
    typeLine(hq, '');
    typeLine(hq, 'F');
    typeLine(hq, '1');
    expect(out.offers[0].name).toBe('MUSTER.WK1');
    expect(out.offers[0].content).not.toContain('#HIDE');
    typeLine(hq, '2');
    expect(out.offers[1].content).toContain('THE CORRIDORS ARE VERY CLEAN.');
    typeLine(hq, '');
    typeLine(hq, 'U');
    out.upload!('IR1103.WP', 'SUBJECT ANNA LIND. THE ROBOTS KILLED THEM.');
    expect(uploads[0][0]).toBe('IR1103.WP');
    expect(out.text).toContain('FILED FOR DISPATCH REVIEW 08-DEC-91');
    expect(notes).toEqual(['hq-login', 'hq-ticket-7902', 'hq-mail-5']);
    typeLine(hq, 'G');
    expect(out.hung).toBe(true);
  });
  it('drops the caller after three bad logins', () => {
    const { ctx } = context();
    const { out, hostLink } = link();
    const hq = new HqHost(ctx);
    hq.connect(hostLink);
    for (let n = 0; n < 3; n++) {
      typeLine(hq, 'OP17');
      typeLine(hq, 'X');
    }
    expect(out.hung).toBe(true);
  });
  it('the Free-Net has the families, and Jonas Lind looking for his sister; it keeps a reply', () => {
    const { ctx, notes, posts } = context();
    const { out, hostLink } = link();
    const bbs = new FreeNetHost(ctx);
    bbs.connect(hostLink);
    typeLine(bbs, 'guest');
    typeLine(bbs, 'M');
    typeLine(bbs, '2');
    expect(out.text).toContain('THE ANNEX / FAMILIES');
    typeLine(bbs, '1');
    expect(out.text).toContain('HE NEVER CAME HOME');
    expect(notes).not.toContain('bbs-lind');
    typeLine(bbs, 'N');
    typeLine(bbs, 'N');
    expect(out.text).toContain('MY SISTER ANNA');
    expect(notes).toContain('bbs-lind');
    typeLine(bbs, 'R');
    typeLine(bbs, 'SHE ASKED ABOUT YOU TONIGHT.');
    typeLine(bbs, '');
    expect(posts).toEqual([['J. LIND', 'SHE ASKED ABOUT YOU TONIGHT.']]);
    // Every line fits the 80-column terminal, so no clue is ever split across two lines.
    expect(out.text.split(/\r?\n/).every((line) => line.length <= 80)).toBe(true);
  });
  it('the phone numbers answer as the directory says', () => {
    const { ctx } = context();
    expect(answer('555-0100', 0, ctx)).toBeInstanceOf(HqHost);
    expect(answer('5550147', 0, ctx)).toBeInstanceOf(FreeNetHost);
    expect(answer('210', 0, ctx)).toBe('NO CARRIER');
    expect(answer('555-0199', 0, ctx)).toBe('BUSY');
    expect(answer('555-0199', 1, ctx)).toBe('VOICE');
    expect(answer('555-1234', 0, ctx)).toBe('NO ANSWER');
  });
});

describe('COMLINK program', () => {
  function rig(comm: Partial<CommSystem> = {}) {
    let now = 0;
    const files = new Map<string, { content: string; kind: FileKind }>([
      [
        'C:\\COMLINK\\DIAL.DIR',
        { content: 'AEGIS HQ DATA CENTER|555-0100|2400|10-31-91\n', kind: 'bin' },
      ],
      ['C:\\DOCS\\IR1103.WP', { content: 'REPORT', kind: 'wp' }],
    ]);
    const sounds: string[] = [];
    const { ctx } = context();
    const system: ProgramSystem = {
      cwd: 'C:\\',
      resolve: (path) => (path.includes('\\') ? path.toUpperCase() : 'C:\\' + path.toUpperCase()),
      read: (path) => {
        const file = files.get(path);
        return file
          ? { path, entry: { ...file, date: '11-03-91', time: '02:31', attrs: 'A' } }
          : 'missing';
      },
      write: (path, content, kind) => {
        files.set(path, { content, kind });
        return 'ok';
      },
      list: () => [],
      folders: () => [],
      stat: () => null,
      now: () => ({ date: '11-03-91', time: '02:31:00', weekday: 'Sun' }),
      disk: () => undefined,
      beep: () => undefined,
      sound: (sound) => sounds.push(sound),
      cue: () => undefined,
      loop: () => undefined,
      note: () => undefined,
      comm: {
        dial: (number) => answer(number, 0, ctx),
        openBus: () => ({ greeting: 'IS THE DOOR OPEN?' }),
        talk: async () => ({ reply: 'I CAN READ YOU.' }),
        distort: () => sounds.push('distort'),
        ringing: () => false,
        pickUp: () => 'YOU PICKED UP.',
        nudge: () => null,
        portrait: new Portrait(),
        closeBus: () => undefined,
        ...comm,
      },
      exit: () => undefined,
    };
    const program = new ComLinkProgram(system, null, () => now);
    const run = (ms: number) => {
      for (let t = 0; t < ms; t += 50) {
        now += 50;
        program.frame();
      }
    };
    const screen = () => {
      const page = new Screen();
      program.render(page);
      return page;
    };
    const type = (text: string) => {
      for (const char of text) program.key(key(char));
    };
    return { program, run, screen, type, files, sounds };
  }
  it('dials with ATDT, connects, logs in to HQ at line speed and downloads by Zmodem', () => {
    const { program, run, screen, type, files, sounds } = rig();
    type('ATDT555-0100');
    program.key(key('Enter'));
    run(7400);
    expect(sounds.slice(0, 4)).toEqual(['dialtone', 'dtmf', 'ringback', 'handshake']);
    // The HQ banner starts with a form feed, which clears the page a moment later.
    expect(screen().text).toContain('CONNECT 2400');
    run(200);
    expect(screen().text).not.toContain('USERNAME:');
    run(3000);
    expect(screen().text).toContain('USERNAME:');
    type('HALLORAN');
    program.key(key('Enter'));
    run(500);
    type('WESTWING');
    program.key(key('Enter'));
    run(3000);
    type('F');
    program.key(key('Enter'));
    run(2000);
    type('1');
    program.key(key('Enter'));
    run(1000);
    expect(screen().text).toContain('ZMODEM RECEIVE');
    run(40000);
    expect(files.get('C:\\COMLINK\\DOWNLOAD\\MUSTER.WK1')?.content).toContain('CHECKED OUT');
    expect(screen().text).toContain('MUSTER.WK1 RECEIVED');
    program.key(key('F3'));
    expect(screen().text).toContain('NO CARRIER');
    expect(screen().text).toContain('OFF-LINE');
  });
  it('dials from the directory, shows BUSY in the dialing window, and records the last call', () => {
    const { program, run, screen, files } = rig({ dial: () => 'BUSY' });
    program.key(key('F2'));
    expect(screen().text).toContain('DIALING DIRECTORY');
    program.key(key('Enter'));
    run(6000);
    expect(screen().text).toContain('Result: BUSY');
    program.key(key(' '));
    expect(screen().text).toContain('DIALING DIRECTORY');
    program.key(key('Escape'));
    expect(files.get('C:\\COMLINK\\DIAL.DIR')?.content).toContain('10-31-91');
  });
  it('opens COM4 and talks to process 04; the other one answers in reverse video', async () => {
    const { program, run, screen, type, sounds } = rig({
      talk: async () => ({
        reply: 'I SEE YOU.',
        other: true,
        then: 'I WAS NOT HERE JUST NOW.',
      }),
    });
    program.key(key('F4'));
    program.key(key('4'));
    run(500);
    // 04 is "composing" its greeting: the turning bar stands where the text will start.
    expect(screen().text).not.toContain('IS THE DOOR OPEN?');
    expect(
      screen()
        .text.split('\n')
        .some((line) => /^[|/\\-]$/.test(line)),
    ).toBe(true);
    run(1000);
    expect(screen().text).toContain('IS THE DOOR OPEN?');
    expect(screen().text).toContain('9600 N81 COM4');
    const greeting = screen()
      .text.split('\n')
      .findIndex((line) => line.includes('IS THE DOOR'));
    expect(screen().cells[greeting * 80].inverse).toBe(false);
    type('who closed it');
    program.key(key('Enter'));
    await Promise.resolve();
    await Promise.resolve();
    run(4000);
    const page = screen();
    expect(page.text).toContain('I SEE YOU.');
    expect(sounds.filter((sound) => sound === 'distort')).toHaveLength(2);
    const row = page.text.split('\n').findIndex((line) => line.includes('I SEE YOU.'));
    expect(page.cells[row * 80].inverse).toBe(true);
    // The assistant comes back afterwards, in her own plain text.
    const back = page.text.split('\n').findIndex((line) => line.includes('I WAS NOT HERE'));
    expect(back).toBeGreaterThan(row);
    expect(page.cells[back * 80].inverse).toBe(false);
    expect(page.cells.some((cell) => cell.palette === 'red')).toBe(false);
  });
  it('offers a bridge from COM4 to the call on COM1, and says why it will not', () => {
    const asked: string[] = [];
    const { program, screen } = rig({
      bridge: (number) => {
        asked.push(number);
        return 'COM4 does not answer.';
      },
    });
    program.key(key('F4'));
    expect(screen().text).toContain('5  BRIDGE COM4 TO THE LINE ON COM1');
    program.key(key('5'));
    expect(screen().text).toContain('No call is up on COM1. Dial first.');
    expect(asked).toEqual([]);
  });
  it('writes the capture log when it is closed', () => {
    const { program, type, files } = rig();
    program.key(key('F5'));
    program.key(key('Enter'));
    type('AT');
    program.key(key('Enter'));
    program.key(key('F5'));
    expect(files.get('C:\\COMLINK\\COMLINK.LOG')?.content).toMatch(/AT\n+OK/);
  });
});

describe('COMLINK in the story', () => {
  it('opens COM4 through the engine; she helps, and remembers what the operator found', async () => {
    const events: TerminalEvent[] = [];
    let now = 0;
    const clock: Clock = { now: () => now, wait: async (ms) => void (now += ms) };
    const game = new GameEngine(
      async (event) => void events.push(event),
      new ModelClient({ health: async () => false, stream: async () => undefined }, 'test', true),
      () => undefined,
      clock,
    );
    await game.start();
    await game.submit('COMLINK');
    const launched = events.find((e) => e.type === 'program');
    if (launched?.type !== 'program') throw new Error('COMLINK did not start');
    const comm = launched.system.comm;
    expect(comm.dial('555-0199')).toBe('BUSY');
    expect(comm.dial('555-0199')).toBe('VOICE');
    const opened = comm.openBus();
    expect(opened).toMatchObject({
      greeting: 'SITE ASSISTANT READY.\nHOW CAN I HELP YOU TONIGHT?',
    });
    expect(game.state.phase).toBe('conversation');
    expect(game.state.flags.firstContact).toBe(true);
    const help = await comm.talk('how do I see hidden files?', new AbortController().signal);
    expect(help.reply).toContain('DIR /A');
    expect(help.other).toBe(false);
    game.discover(['annaName']);
    const name = await comm.talk('is your name anna?', new AbortController().signal);
    expect(name.reply).toContain('THAT IS MY NAME.');
    expect(game.state.flags['memory:M2']).toBe(true);
    // The greeting changes once she knows who she was.
    expect(comm.openBus()).toMatchObject({ greeting: 'YOU CAME BACK.' });
  });
});
