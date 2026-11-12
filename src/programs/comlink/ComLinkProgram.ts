import type { Screen } from '../../screen/Screen';
import { SPINNER, spinnerPhase } from '../../screen/widgets';
import { withFace } from '../../screen/face';
import { TerminalInput } from '../../terminal/TerminalInput';
import { baseName } from '../../os/fs/paths';
import type { KeyEvent, Program, ProgramSystem } from '../Program';
import type { Host, HostLink, OfferedFile } from './host';
import { Modem, type ModemResult } from './Modem';
import { TerminalScreen } from './TerminalScreen';
const DIRECTORY = 'C:\\COMLINK\\DIAL.DIR';
const DOWNLOADS = 'C:\\COMLINK\\DOWNLOAD';
const LOG = 'C:\\COMLINK\\COMLINK.LOG';
/** Characters per second on the line: 2400 bps on the modem, 9600 on the limbic bus. */
const MODEM_CPS = 240;
const BUS_CPS = 960;
/** Zmodem at 2400 bps, after protocol overhead. */
const TRANSFER_CPS = 232;
const SLOTS = 10;
interface Entry {
  name: string;
  number: string;
  baud: string;
  last: string;
}
interface Call {
  number: string;
  entry: Entry | null;
  /** Shows the dialing window (a directory call) instead of only modem results. */
  box: boolean;
  started: number;
  result: string | null;
}
interface Transfer {
  direction: 'down' | 'up';
  name: string;
  content: string;
  started: number;
  /** Bytes moved at the last frame, for repainting once per block. */
  shown: number;
  file?: OfferedFile;
  done?: (name: string, content: string) => void;
}
type Overlay =
  | { kind: 'help' }
  | { kind: 'directory'; pick: number }
  | { kind: 'ports'; pick: number }
  | { kind: 'message'; title: string; lines: string[] }
  | { kind: 'confirm'; question: string; then: () => void }
  | {
      kind: 'prompt';
      title: string;
      label: string;
      field: TerminalInput;
      then: (value: string) => void;
    };
interface Queued {
  text: string;
  /** The other one's voice: reverse video. */
  inverse?: boolean;
  /** Runs when the text before it has reached the screen. */
  then?: () => void;
}
export const HELP: Array<[string, string, string, string]> = [
  ['F2  Alt-D', 'Dialing directory', 'PgUp', 'Send file (Zmodem)'],
  ['F3  Alt-H', 'Hang up', 'PgDn', 'Receive file (Zmodem)'],
  ['F4  Alt-P', 'Port / line settings', 'F5', 'Capture log on/off'],
  ['F6  Alt-C', 'Clear screen', 'Esc F10', 'Exit to DOS (Alt-X too)'],
  ['F1  Alt-Z', 'This menu', '', ''],
];
const bar = (fraction: number, width: number) => {
  const full = Math.round(fraction * width);
  return '█'.repeat(full) + '░'.repeat(width - full);
};
/**
 * COMLINK PLUS 2.0: the communications program. COM1 is a Hayes modem on the phone line;
 * COM4 is the limbic bus, where process 04 answers.
 */
export class ComLinkProgram implements Program {
  private term = new TerminalScreen(() => this.system.beep());
  private modem = new Modem();
  private port: 'COM1' | 'COM4' = 'COM1';
  private line: 'offline' | 'dialing' | 'online' | 'command' = 'offline';
  private host: Host | null = null;
  /** The number the call now up was placed to. */
  private lineNumber = '';
  private call: Call | null = null;
  private timers: Array<{ at: number; run: () => void }> = [];
  private queue: Queued[] = [];
  private pumped: number;
  private typed = '';
  private plus = 0;
  private overlay: Overlay | null = null;
  private transfer: Transfer | null = null;
  private upload: ((name: string, content: string) => void) | null = null;
  private capture: { path: string; text: string } | null = null;
  private entries: Entry[] = [];
  private waiting: AbortController | null = null;
  private revision = 0;
  constructor(
    private system: ProgramSystem,
    _path: string | null,
    private clock: () => number = () => performance.now(),
  ) {
    this.pumped = clock();
    this.loadDirectory();
    this.show('COMLINK PLUS 2.0  (C) 1990 DATASTORM-AEGIS\r\nCOM1 2400 N81 READY\r\n\r\n');
  }
  frame() {
    const now = this.clock();
    for (const timer of this.timers.filter((t) => t.at <= now)) {
      this.timers.splice(this.timers.indexOf(timer), 1);
      timer.run();
      this.revision++;
    }
    this.pump(now);
    if (this.transfer) this.progress(now);
    this.incoming(now);
    // Left alone with the line open at the end, 04 says something without being asked.
    if (this.bus && !this.waiting && !this.queue.length && now - this.typedAt > 30_000) {
      this.typedAt = now;
      const nudge = this.system.comm.nudge();
      if (nudge) this.say(nudge, 1800);
    }
    const face = this.faceShown ? this.system.comm.portrait.frame(now, this.spinner(now) >= 0) : '';
    return `${this.revision}:${this.spinner(now)}:${face}`;
  }
  /** Process 04's face stands above the line while it is on it, as on a picture phone. */
  private faceShown = false;
  /** Until when a scripted line from 04 is "being composed" (the spinner shows). */
  private composing = 0;
  /** Sends a line from 04 after a moment of the reply indicator, as a live answer would. */
  private say(text: string, delay: number, inverse = false) {
    this.composing = this.clock() + delay;
    this.after(delay, () => {
      this.composing = 0;
      this.receive({ text: '\r\n' + text.replace(/\n/g, '\r\n') + '\r\n\r\n', inverse });
    });
  }
  /** The reply indicator's phase while 04 is about to answer, or -1. */
  private spinner(now: number) {
    return this.waiting || now < this.composing ? spinnerPhase(now) : -1;
  }
  /** An incoming call: RING every six seconds while the modem sits idle on COM1. */
  private incoming(now: number) {
    const idle = this.port === 'COM1' && this.line === 'offline' && !this.call && !this.bus;
    if (!idle || this.overlay || !this.system.comm.ringing()) {
      this.ringAt = 0;
      return;
    }
    if (!this.ringAt) this.ringAt = now + 2000;
    if (now < this.ringAt) return;
    this.ringAt = now + 6000;
    this.system.sound('ring');
    this.show(this.modem.result('RING') + (this.rings++ ? '' : '\r\nNMBR = 204\r\n'));
  }
  private ringAt = 0;
  private rings = 0;
  /** The line is talking to process 04: COM4, or the call from X204. */
  private bus = false;
  private typedAt = 0;

  // ----- screen output -----
  /** Local output (keyboard echo, modem results): on screen at once. */
  private show(text: string, inverse = false) {
    this.term.write(text, inverse);
    if (this.capture) this.capture.text += text;
    this.revision++;
  }
  /** Remote output: arrives at line speed. */
  private receive(item: Queued) {
    if (!this.queue.length) this.pumped = this.clock();
    this.queue.push(item);
  }
  private pump(now: number) {
    // Zmodem has the line while a file moves; the host's next prompt waits for it.
    if (this.transfer) {
      this.pumped = now;
      return;
    }
    const cps = this.port === 'COM4' ? BUS_CPS : MODEM_CPS;
    let budget = Math.floor(((now - this.pumped) / 1000) * cps);
    if (!this.queue.length) {
      this.pumped = now;
      return;
    }
    if (budget <= 0) return;
    this.pumped += (budget / cps) * 1000;
    while (this.queue.length && (budget > 0 || !this.queue[0].text)) {
      const item = this.queue[0];
      const part = item.text.slice(0, budget);
      if (part) this.show(part, item.inverse);
      item.text = item.text.slice(part.length);
      budget -= part.length;
      if (item.text) break;
      this.queue.shift();
      item.then?.();
    }
  }
  private after(ms: number, run: () => void) {
    this.timers.push({ at: this.clock() + ms, run });
  }

  // ----- dialing directory -----
  private loadDirectory() {
    const read = this.system.read(DIRECTORY);
    const text = typeof read === 'object' ? read.entry.content : '';
    this.entries = text
      .split('\n')
      .filter((line) => line.includes('|'))
      .slice(0, SLOTS)
      .map((line) => {
        const [name = '', number = '', baud = '2400', last = ''] = line.split('|');
        return { name, number, baud, last };
      });
  }
  private saveDirectory() {
    this.system.write(
      DIRECTORY,
      this.entries.map((e) => [e.name, e.number, e.baud, e.last].join('|')).join('\n') + '\n',
      'bin',
    );
  }

  // ----- calls -----
  private dial(number: string, entry: Entry | null) {
    const digits = number.replace(/[^0-9*#]/g, '');
    if (!digits) return this.show(this.modem.result('NO DIALTONE'));
    this.line = 'dialing';
    this.call = { number, entry, box: !!entry, started: this.clock(), result: null };
    const call = this.call;
    this.system.sound('dialtone');
    const dialed = 700 + digits.length * 110;
    this.after(700, () => this.system.sound('dtmf', digits));
    this.after(dialed + 300, () => {
      if (this.call !== call) return;
      const answer = this.system.comm.dial(digits);
      if (typeof answer === 'object') {
        this.system.sound('ringback');
        this.after(3200, () => this.call === call && this.system.sound('handshake'));
        this.after(5600, () => {
          if (this.call !== call) return;
          this.lineNumber = digits;
          this.connect(answer);
        });
      } else if (answer === 'BUSY') {
        this.system.sound('busy');
        this.after(2600, () => this.fail(call, 'BUSY'));
      } else {
        this.system.sound('ringback');
        const wait = answer === 'VOICE' ? 3600 : answer === 'NO ANSWER' ? 9000 : 6000;
        if (answer === 'NO ANSWER')
          this.after(4200, () => this.call === call && this.system.sound('ringback'));
        this.after(wait, () => this.fail(call, answer));
      }
    });
  }
  private fail(call: Call, result: ModemResult) {
    if (this.call !== call) return;
    this.line = 'offline';
    call.result = result;
    this.show(this.modem.result(result));
    if (!call.box) this.call = null;
  }
  private connect(host: Host) {
    const call = this.call!;
    this.line = 'online';
    this.host = host;
    this.upload = null;
    this.show(this.modem.result('CONNECT 2400'));
    this.call = null;
    if (this.overlay?.kind === 'directory') this.overlay = null;
    if (call.entry) {
      call.entry.last = this.system.now().date;
      this.saveDirectory();
    }
    const link: HostLink = {
      send: (text) => this.host === host && this.receive({ text }),
      hangup: () => this.receive({ text: '', then: () => this.host === host && this.drop() }),
      offer: (file) =>
        this.receive({
          text: '',
          then: () =>
            this.host === host && this.startTransfer('down', file.name, file.content, file),
        }),
      expectUpload: (receive) => (this.upload = receive),
    };
    host.connect(link);
  }
  /** Carrier lost: the remote hung up, or the operator did. */
  private drop() {
    this.host = null;
    this.upload = null;
    this.line = 'offline';
    this.queue = [];
    if (this.transfer) this.endTransfer('TRANSFER ABORTED: CARRIER LOST');
    this.show(this.modem.result('NO CARRIER'));
  }
  private hangUp() {
    if (this.bus) return this.closeBus();
    if (this.line === 'dialing') {
      this.call = null;
      this.line = 'offline';
      this.show(this.modem.result('NO CARRIER'));
    } else if (this.host) {
      this.system.sound('click');
      this.drop();
    }
  }

  /** Joins the limbic bus to the open phone line: whatever is on COM4 gets the far end. */
  private bridge() {
    if (!this.host) return this.message('BRIDGE', ['No call is up on COM1. Dial first.']);
    const refused = this.system.comm.bridge?.(this.lineNumber) ?? 'Bridging is not supported.';
    if (refused) this.message('BRIDGE', [refused]);
  }

  // ----- COM4: the limbic bus -----
  private openBus() {
    if (this.host || this.line === 'dialing' || this.bus)
      return this.message('PORT', ['Hang up the modem line before changing ports.']);
    const opened = this.system.comm.openBus();
    if ('error' in opened) return this.message('COM4', [opened.error]);
    this.port = 'COM4';
    this.line = 'online';
    this.bus = true;
    this.typedAt = this.clock();
    this.system.sound('click');
    this.system.cue('whoosh');
    this.faceShown = true;
    this.system.comm.portrait.reveal(this.clock());
    this.show('\r\nCOM4 9600 N81 -- LIMBIC BUS 04\r\n');
    if (opened.other) this.system.comm.distort();
    this.say(opened.greeting, 1100, opened.other);
  }
  /** ATA while X204 rings: the phone in the sealed room, and 04 on the other end. */
  private pickUp() {
    const greeting = this.system.comm.pickUp();
    this.line = 'online';
    this.bus = true;
    this.typedAt = this.clock();
    this.ringAt = 0;
    this.system.sound('handshake');
    this.after(2600, () => {
      this.show(this.modem.result('CONNECT 2400'));
      this.faceShown = true;
      this.system.comm.portrait.reveal(this.clock());
      this.say(greeting, 1000);
    });
  }
  private closeBus() {
    this.waiting?.abort();
    this.waiting = null;
    this.system.comm.closeBus();
    this.port = 'COM1';
    this.line = 'offline';
    this.bus = false;
    this.faceShown = false;
    this.queue = [];
    this.typed = '';
    this.show(this.modem.result('NO CARRIER'));
  }
  private busKey(char: string) {
    this.typedAt = this.clock();
    if (char === '\r') {
      const text = this.typed.trim();
      this.typed = '';
      this.show('\r\n');
      if (!text) return;
      if (this.waiting) return this.system.beep();
      const waiting = new AbortController();
      this.waiting = waiting;
      this.system.comm
        .talk(text, waiting.signal)
        .then(({ reply, other, then, hangup }) => {
          if (this.waiting !== waiting) return;
          this.waiting = null;
          // The other's lines tear the picture as they come; when she lets go, the assistant
          // comes back after a pause.
          if (other) this.system.comm.distort();
          const after = then
            ? () =>
                this.after(900, () => {
                  this.system.comm.distort();
                  this.after(700, () =>
                    this.receive({ text: then.replace(/\n/g, '\r\n') + '\r\n\r\n' }),
                  );
                })
            : hangup
              ? // The door is open: the line drops by itself, and the night ends at the shell.
                () =>
                  this.after(2000, () => {
                    this.closeBus();
                    this.after(1500, () => this.system.exit());
                  })
              : undefined;
          this.receive({
            text: '\r\n' + reply.replace(/\n/g, '\r\n') + '\r\n\r\n',
            inverse: other,
            then: after,
          });
          this.revision++;
        })
        .catch(() => {
          if (this.waiting === waiting) this.waiting = null;
        });
      return;
    }
    if (char === '\b') {
      if (!this.typed) return;
      this.typed = this.typed.slice(0, -1);
      return this.show('\b \b');
    }
    if (this.typed.length < 240) {
      this.typed += char;
      this.show(char);
    }
  }

  // ----- the keyboard on the line -----
  private send(char: string) {
    if (this.bus) return this.busKey(char);
    if (this.line === 'online' && this.host) {
      this.plus = char === '+' ? this.plus + 1 : 0;
      if (this.plus === 3) {
        this.plus = 0;
        this.after(1000, () => {
          if (this.line !== 'online') return;
          this.line = 'command';
          this.show(this.modem.result('OK'));
        });
      }
      return this.host.key(char);
    }
    if (this.line === 'dialing') {
      if (this.call && !this.call.box) this.hangUp();
      return;
    }
    // Command mode: the modem reads a line of AT commands.
    if (char === '\r') {
      const line = this.typed;
      this.typed = '';
      const { reply, action } = this.modem.command(line);
      if (this.modem.echo) this.show('\r');
      switch (action?.kind) {
        case 'dial':
          if (this.host) return this.show(this.modem.result('ERROR'));
          return this.dial(action.number, null);
        case 'hangup':
        case 'reset':
          if (this.host) {
            this.host = null;
            this.upload = null;
            this.queue = [];
          }
          this.line = 'offline';
          break;
        case 'online':
          if (!this.host) return this.show(this.modem.result('NO CARRIER'));
          this.line = 'online';
          return this.show(this.modem.result('CONNECT 2400'));
        case 'answer':
          if (this.system.comm.ringing()) return this.pickUp();
          return this.show(this.modem.result('NO CARRIER'));
      }
      return this.show(reply || '\n');
    }
    if (char === '\b') {
      if (!this.typed) return;
      this.typed = this.typed.slice(0, -1);
      if (this.modem.echo) this.show('\b \b');
      return;
    }
    if (this.typed.length < 60) {
      this.typed += char;
      if (this.modem.echo) this.show(char);
    }
  }

  // ----- files -----
  private startTransfer(
    direction: 'down' | 'up',
    name: string,
    content: string,
    file?: OfferedFile,
  ) {
    this.transfer = {
      direction,
      name,
      content,
      started: this.clock(),
      shown: 0,
      file,
      done: direction === 'up' ? (this.upload ?? undefined) : undefined,
    };
    if (direction === 'up') this.upload = null;
    this.system.disk();
    // Zmodem's blocks chatter through the speaker until the file is done.
    this.system.loop('transfer', true);
  }
  private progress(now: number) {
    const transfer = this.transfer!;
    const size = Math.max(1, transfer.content.length);
    const bytes = Math.min(size, ((now - transfer.started) / 1000) * TRANSFER_CPS);
    if (Math.floor(bytes / 128) !== Math.floor(transfer.shown / 128)) this.revision++;
    transfer.shown = bytes;
    if (bytes < size) return;
    if (transfer.direction === 'down') {
      const path = DOWNLOADS + '\\' + transfer.name;
      const written = this.system.write(path, transfer.content, transfer.file?.kind ?? 'bin');
      this.endTransfer(
        written === 'ok'
          ? `ZMODEM: ${transfer.name} RECEIVED, ${size} BYTES -> ${path}`
          : `ZMODEM: CANNOT WRITE ${path}`,
      );
    } else {
      this.endTransfer(`ZMODEM: ${transfer.name} SENT, ${size} BYTES`);
      transfer.done?.(transfer.name, transfer.content);
    }
    this.system.disk();
  }
  private endTransfer(note: string) {
    this.transfer = null;
    this.system.loop('transfer', false);
    this.system.cue(/RECEIVED|SENT/.test(note) ? 'saved' : 'denied');
    this.show('\r\n' + note + '\r\n');
  }
  private receiveFile() {
    if (this.line !== 'online' || !this.host)
      return this.message('RECEIVE', ['Not on line. Call a remote system first.']);
    this.message('RECEIVE', [
      'No file is being offered.',
      'Choose a file on the remote system; COMLINK starts',
      'receiving on its own when the sender begins.',
    ]);
  }
  private sendFile() {
    if (this.line !== 'online' || !this.host)
      return this.message('SEND', ['Not on line. Call a remote system first.']);
    if (!this.upload)
      return this.message('SEND', ['The remote system is not ready to receive a file.']);
    this.prompt('SEND FILE (ZMODEM)', 'File to send: ', 'C:\\DOCS\\', false, (value) => {
      const path = this.system.resolve(value);
      const read = path ? this.system.read(path) : 'missing';
      if (read === 'missing') return this.message('SEND', ['File not found.']);
      if (read === 'denied') return this.message('SEND', ['Access denied.']);
      if (read === 'damaged') return this.message('SEND', ['Disk read error. Try again.']);
      this.startTransfer('up', baseName(read.path), read.entry.content);
    });
  }
  private toggleCapture() {
    if (this.capture) {
      const capture = this.capture;
      this.capture = null;
      const old = this.system.read(capture.path);
      // The log keeps what a printer would: lines of text, with backspaces applied.
      let text = '';
      for (const char of capture.text.replace(/\r\n/g, '\n')) {
        if (char === '\b') text = text.slice(0, -1);
        else if (char === '\n' || char >= ' ') text += char;
      }
      this.system.write(
        capture.path,
        (typeof old === 'object' ? old.entry.content : '') + text,
        'text',
      );
      this.system.disk();
      return;
    }
    this.prompt('CAPTURE LOG', 'Log file name: ', LOG, true, (value) => {
      const path = this.system.resolve(value);
      if (!path) return this.message('CAPTURE LOG', ['Invalid file name.']);
      this.capture = { path, text: '' };
    });
  }

  // ----- dialogs -----
  private message(title: string, lines: string[]) {
    this.overlay = { kind: 'message', title, lines };
    this.system.beep();
  }
  private prompt(
    title: string,
    label: string,
    value: string,
    fresh: boolean,
    then: (value: string) => void,
  ) {
    const field = new TerminalInput();
    field.insert(value, 60);
    this.overlay = { kind: 'prompt', title, label, field, then };
    this.system.cue('dialog');
    this.freshPrompt = fresh;
  }
  private freshPrompt = false;
  private exit() {
    this.system.cue('dialog');
    this.overlay = {
      kind: 'confirm',
      question: this.host || this.bus ? 'Hang up and exit COMLINK?' : 'Exit COMLINK PLUS?',
      then: () => {
        if (this.host || this.line === 'dialing' || this.bus) this.hangUp();
        if (this.capture) this.toggleCapture();
        this.transfer = null;
        this.system.loop('transfer', false);
        this.system.exit();
      },
    };
  }
  /** The COMLINK command keys: plain function keys, and ProComm's Alt keys where they are safe. */
  private command(event: KeyEvent): boolean {
    const { key, alt } = event;
    const letter = alt && key.length === 1 ? key.toUpperCase() : '';
    if (key === 'F1' || letter === 'Z') {
      this.overlay = { kind: 'help' };
      this.system.cue('dialog');
    } else if (key === 'F2' || letter === 'D') {
      this.overlay = { kind: 'directory', pick: 0 };
      this.system.cue('dialog');
    } else if (key === 'F3' || letter === 'H') this.hangUp();
    else if (key === 'F4' || letter === 'P') {
      // The port switch box.
      this.overlay = { kind: 'ports', pick: this.port === 'COM4' ? 3 : 0 };
      this.system.cue('port');
    } else if (key === 'F5' || (alt && key === 'F1')) this.toggleCapture();
    else if (key === 'F6' || letter === 'C') this.term.clear();
    else if (key === 'F10' || key === 'Escape' || letter === 'X') this.exit();
    else if (key === 'PageDown') this.receiveFile();
    else if (key === 'PageUp') this.sendFile();
    else return false;
    return true;
  }
  key(event: KeyEvent) {
    this.revision++;
    const { key, ctrl, alt } = event;
    if (this.overlay) {
      this.overlayKey(event);
      return true;
    }
    if (this.transfer) {
      if (key === 'Escape' || (ctrl && key.toLowerCase() === 'x'))
        this.endTransfer('TRANSFER ABORTED BY OPERATOR');
      return true;
    }
    if (this.command(event)) return true;
    if (key === 'Enter') this.send('\r');
    else if (key === 'Backspace') this.send('\b');
    else if (key.length === 1 && !ctrl && !alt) this.send(key);
    else return false;
    return true;
  }
  paste(text: string) {
    if (this.overlay?.kind === 'prompt') {
      this.overlay.field.insert(text.replace(/\r?\n[\s\S]*$/, ''), 60);
      return true;
    }
    if (this.overlay || this.transfer) return false;
    for (const char of text.replace(/\r\n?/g, '\n').slice(0, 240))
      this.send(char === '\n' ? '\r' : char);
    this.revision++;
    return true;
  }
  private overlayKey(event: KeyEvent) {
    const overlay = this.overlay!;
    const { key } = event;
    switch (overlay.kind) {
      case 'help':
        this.overlay = null;
        if (key !== 'Escape' && key !== 'Enter') this.command(event);
        return;
      case 'message':
        this.overlay = null;
        return;
      case 'confirm':
        if (key.toUpperCase() === 'Y') {
          this.overlay = null;
          overlay.then();
        } else if (key.toUpperCase() === 'N' || key === 'Escape') this.overlay = null;
        return;
      case 'prompt':
        if (key === 'Enter') {
          this.overlay = null;
          overlay.then(overlay.field.value.trim());
        } else if (key === 'Escape') this.overlay = null;
        else if (key.length === 1 && !event.ctrl && !event.alt) {
          if (this.freshPrompt) overlay.field.reset();
          this.freshPrompt = false;
          overlay.field.insert(key, 60);
        } else if (
          ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)
        ) {
          this.freshPrompt = false;
          overlay.field.key(key);
        }
        return;
      case 'ports': {
        const choice = key === 'Enter' ? overlay.pick + 1 : Number(key);
        if (key === 'ArrowDown') overlay.pick = (overlay.pick + 1) % 5;
        else if (key === 'ArrowUp') overlay.pick = (overlay.pick + 4) % 5;
        else if (key === 'Escape') this.overlay = null;
        else if (choice >= 1 && choice <= 5) {
          this.overlay = null;
          if (choice === 5) this.bridge();
          else if (choice === 4 && this.port !== 'COM4') this.openBus();
          else if (choice === 1 && this.port === 'COM4') this.closeBus();
          else if (choice === 2 || choice === 3)
            this.message(`COM${choice}`, [`No device installed on COM${choice}.`]);
        }
        return;
      }
      case 'directory':
        return this.directoryKey(overlay, event);
    }
  }
  private directoryKey(overlay: Extract<Overlay, { kind: 'directory' }>, event: KeyEvent) {
    const { key } = event;
    const entry = this.entries[overlay.pick];
    const upper = key.length === 1 ? key.toUpperCase() : key;
    if (this.call?.box) {
      // The dialing window: any key after a failed call closes it; Esc cancels dialing.
      if (this.call.result || key === 'Escape') {
        if (!this.call.result) this.hangUp();
        this.call = null;
      }
      return;
    }
    if (key === 'ArrowDown') overlay.pick = (overlay.pick + 1) % SLOTS;
    else if (key === 'ArrowUp') overlay.pick = (overlay.pick + SLOTS - 1) % SLOTS;
    else if (key === 'Escape') this.overlay = null;
    else if (key === 'Enter' || upper === 'D') {
      if (!entry?.number) return this.system.beep();
      if (this.host || this.bus)
        return this.message('DIAL', ['Hang up the current call first (F3).']);
      this.dial(entry.number, entry);
    } else if (upper === 'M') {
      this.prompt('MANUAL DIAL', 'Number to dial: ', '', false, (number) => {
        if (!number) return;
        if (this.host || this.bus)
          return this.message('DIAL', ['Hang up the current call first (F3).']);
        this.overlay = null;
        this.dial(number, null);
      });
    } else if (upper === 'R') {
      const pick = overlay.pick;
      this.prompt('REVISE ENTRY ' + (pick + 1), 'Name: ', entry?.name ?? '', true, (name) =>
        this.prompt(
          'REVISE ENTRY ' + (pick + 1),
          'Number: ',
          entry?.number ?? '',
          true,
          (number) => {
            while (this.entries.length <= pick)
              this.entries.push({ name: '', number: '', baud: '2400', last: '' });
            this.entries[pick] = {
              name: name.toUpperCase().slice(0, 28),
              number: number.slice(0, 15),
              baud: '2400',
              last: entry?.last ?? '',
            };
            this.saveDirectory();
            this.overlay = { kind: 'directory', pick };
          },
        ),
      );
    } else if (upper === 'E' && entry?.number) {
      const pick = overlay.pick;
      this.overlay = {
        kind: 'confirm',
        question: `Erase entry ${pick + 1}, ${entry.name}?`,
        then: () => {
          this.entries[pick] = { name: '', number: '', baud: '2400', last: '' };
          this.saveDirectory();
          this.overlay = { kind: 'directory', pick };
        },
      };
    }
  }

  // ----- drawing -----
  render(screen: Screen) {
    screen.clear();
    this.term.lines.forEach((line, y) =>
      line.forEach((cell, x) => {
        if (cell.char !== ' ' || cell.inverse)
          screen.put(x, y, cell.char, cell.inverse ? { inverse: true } : {});
      }),
    );
    const speed = this.port === 'COM4' ? '9600 N81 COM4' : '2400 N81 COM1';
    const state =
      this.line === 'online' || this.bus
        ? 'ON-LINE'
        : this.line === 'dialing'
          ? 'DIALING'
          : 'OFF-LINE';
    // What to press to get out is always on the bar; F3 too while a line is up.
    const hangUp = this.host || this.bus || this.line === 'dialing' ? 'F3 HANG UP │ ' : '';
    const status = ` F1 HELP │ ESC EXIT │ ${hangUp}ANSI │ ${speed} │ ${this.capture ? 'LOG OPEN' : 'LOG CLOSED'} │ ${state}`;
    screen.put(0, 24, status.padEnd(80), { inverse: true });
    const spinning = this.spinner(this.clock());
    if (spinning >= 0 && !this.overlay && !this.transfer)
      // Process 04 is about to answer: a turning bar where its reply will start.
      screen.put(Math.min(79, this.term.x), this.term.y, SPINNER[spinning], { intensity: 2 });
    else if (!this.overlay && !this.transfer)
      screen.cursor = { x: Math.min(79, this.term.x), y: this.term.y, shape: 'underline' };
    if (this.faceShown)
      withFace(screen, this.system.comm.portrait, this.clock(), spinning >= 0, { from: 0, to: 24 });
    if (this.transfer) this.renderTransfer(screen);
    const overlay = this.overlay;
    if (!overlay) return;
    switch (overlay.kind) {
      case 'help':
        return this.renderHelp(screen);
      case 'directory':
        this.renderDirectory(screen, overlay.pick);
        if (this.call?.box) this.renderDialing(screen, this.call);
        return;
      case 'ports':
        return this.renderPorts(screen, overlay.pick);
      case 'message':
        this.window(screen, overlay.title, [...overlay.lines, '', 'Press any key.']);
        return;
      case 'confirm':
        this.window(screen, 'COMLINK PLUS', [overlay.question + ' (Y/N)']);
        return;
      case 'prompt': {
        const room = 40;
        const at = this.window(screen, overlay.title, [overlay.label + ' '.repeat(room)]);
        const x = at.x + overlay.label.length;
        const shift = Math.max(0, overlay.field.cursor - room + 1);
        screen.put(x, at.y, overlay.field.value.slice(shift, shift + room), {
          inverse: this.freshPrompt,
        });
        screen.cursor = { x: x + overlay.field.cursor - shift, y: at.y, shape: 'underline' };
        return;
      }
    }
  }
  /** A centred double-lined window; returns where its first text line starts. */
  private window(screen: Screen, title: string, lines: string[]) {
    const width = Math.max(40, title.length + 8, ...lines.map((l) => l.length + 6));
    const x = Math.floor((80 - width) / 2);
    const y = Math.max(1, Math.floor((24 - lines.length - 4) / 2));
    screen.box(x, y, width, lines.length + 4, 'double');
    screen.put(x + Math.floor((width - title.length - 2) / 2), y, ` ${title} `);
    lines.forEach((line, n) => screen.put(x + 3, y + 2 + n, line));
    return { x: x + 3, y: y + 2 };
  }
  private renderHelp(screen: Screen) {
    const lines = [
      'COMMUNICATIONS AND FILES',
      '',
      ...HELP.map(([a, b, c, d]) => `${a.padEnd(11)}${b.padEnd(24)}${c.padEnd(11)}${d}`),
      '',
      'AT commands work at the modem prompt: ATDT number to dial,',
      'ATH to hang up, +++ then ATO to return on line.',
      'COM4 (F4) is the limbic bus: type a line and press Enter.',
    ];
    this.window(screen, 'COMLINK PLUS COMMAND MENU', lines);
  }
  private renderDirectory(screen: Screen, pick: number) {
    screen.box(0, 0, 80, 24, 'double');
    screen.put(29, 0, ' DIALING DIRECTORY ');
    screen.put(3, 2, '    NAME                          NUMBER           BAUD  PDS  LAST CALL');
    for (let n = 0; n < SLOTS; n++) {
      const entry = this.entries[n];
      const text =
        String(n + 1).padStart(3) +
        '  ' +
        (entry?.name ?? '').padEnd(30) +
        (entry?.number ?? '').padEnd(17) +
        (entry?.number ? entry.baud.padEnd(6) + 'N81  ' + entry.last : '');
      screen.put(3, 4 + n, text.padEnd(74), { inverse: n === pick });
    }
    screen.put(0, 16, '╟' + '─'.repeat(78) + '╢');
    screen.put(3, 18, 'Enter/D  Dial entry       M  Manual dial       R  Revise entry');
    screen.put(3, 19, '↑ ↓      Choose entry     E  Erase entry       Esc  Back to terminal');
    screen.put(
      3,
      21,
      `Port: ${this.port}   ${this.port === 'COM4' ? 'LIMBIC BUS' : 'HAYES 2400 ON PHONE LINE'}`,
    );
  }
  private renderDialing(screen: Screen, call: Call) {
    const now = this.system.now();
    const elapsed = Math.floor((this.clock() - call.started) / 1000);
    this.window(screen, 'DIALING', [
      `Dialing:  ${call.entry?.name ?? call.number}`,
      `Number:   ${call.number}`,
      `Time:     ${now.time}`,
      `Last call: ${call.entry?.last || 'NONE'}`,
      `Seconds until cycle: ${String(Math.max(0, 45 - elapsed)).padStart(2)}`,
      '',
      call.result ? `Result: ${call.result}   (press any key)` : 'Esc: cancel',
    ]);
  }
  private renderPorts(screen: Screen, pick: number) {
    const lines = [
      '1  COM1  HAYES 2400 MODEM (PHONE LINE)',
      '2  COM2  (NOT INSTALLED)',
      '3  COM3  (NOT INSTALLED)',
      '4  COM4  LIMBIC BUS 04  9600 N81',
      '5  BRIDGE COM4 TO THE LINE ON COM1',
    ];
    const at = this.window(screen, 'PORT / LINE SETTINGS', [...lines, '', `Current: ${this.port}`]);
    screen.put(at.x, at.y + pick, lines[pick], { inverse: true });
  }
  private renderTransfer(screen: Screen) {
    const transfer = this.transfer!;
    const size = Math.max(1, transfer.content.length);
    // Zmodem reports progress a block at a time, not byte by byte.
    const moved = ((this.clock() - transfer.started) / 1000) * TRANSFER_CPS;
    const bytes = Math.min(size, Math.floor(moved / 128) * 128);
    const left = Math.ceil((size - bytes) / TRANSFER_CPS);
    this.window(screen, transfer.direction === 'down' ? 'ZMODEM RECEIVE' : 'ZMODEM SEND', [
      `File:    ${transfer.name}`,
      `Size:    ${String(size).padEnd(8)} Bytes: ${bytes}`,
      `CPS:     ${String(TRANSFER_CPS).padEnd(8)} Errors: 0   Time left: 0:${String(left).padStart(2, '0')}`,
      '',
      bar(bytes / size, 36) + ` ${String(Math.floor((bytes / size) * 100)).padStart(3)}%`,
      '',
      'Esc: abort transfer',
    ]);
  }
}
