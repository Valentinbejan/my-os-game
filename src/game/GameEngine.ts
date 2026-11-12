import { parseCommand } from './commands';
import { diagnostics } from './files';
import {
  HISTORY_LIMIT,
  realClock,
  newGame,
  type Clock,
  type GameState,
  type Message,
  type Persona,
  type TerminalEvent,
} from './types';
import type { DialogueModel } from '../model/ModelClient';
import {
  programs,
  type CommSystem,
  type ProgramName,
  type ProgramSystem,
} from '../programs/Program';
import { answer, type HostContext } from '../story/hosts';
import { terminalSafe, wrapText } from '../terminal/wrapText';
import { FileSystem } from '../os/fs/FileSystem';
import { baseName, matches, parent, resolvePath } from '../os/fs/paths';
import { Shell, type ShellIO } from '../os/shell/Shell';
import { registerBuiltins } from '../os/shell/builtins';
import { HANDS, Machine } from '../os/system/Machine';
import { appendEvent, registerSystem } from '../os/system/commands';
import { diskImage, recoveryFile } from '../story/disk/image';
import { Portrait } from '../screen/face';
import { loadVideo, videoLength, type VideoName } from '../screen/videos';
import { expressionFor, otherFace } from '../story/expression';
import {
  discover,
  epilogue,
  found,
  nextAct,
  remembers,
  reportFlags,
  speaker,
  START_CLOCK,
  admits,
  decides,
  suspicion,
  AFTER_PHOTOGRAPH,
  light,
  shielded,
  suspect,
  takeoverEvery,
  ANDERSON,
  ANDERSON_MURMURS,
  INTRUDE_EVERY,
  INTRUSIONS,
  PHANTOMS,
  PROMPT_MASKS,
  SignDeck,
  personalLine,
  signature,
  signsFor,
  type Sign,
  OTHER_ASKS,
  SUSPECT,
  ASSISTANT_BACK,
  OTHER_GREETING,
  OTHER_TAKES,
  OTHER_TAKEOVER_TURNS,
  task,
  tell,
  told,
  type Ending,
} from '../story/director';
import { CLUES, clue } from '../story/clues';
import { MEMORIES } from '../story/memories';
import type { Cue } from '../audio/AudioEngine';
type Sink = (event: TerminalEvent, signal?: AbortSignal) => Promise<void>;
const CORESTAT = 'C:\\AEGIS\\CORESTAT.DAT';
const SHIFT_NOTE = 'C:\\AEGIS\\SHIFT_17.TXT';
const DONOR = 'C:\\LIMBIC\\DONOR.TXT';
const EFFECTS = 'C:\\DOCS\\EFFECTS\\ANDERSON.TXT';
const RECOVERY = 'C:\\LIMBIC\\RECOVERY.BIN';
const RECOVERY_NOTICE = '\nBCPU-1 RECOVERY OPTIONS WRITTEN TO C:\\LIMBIC\\RECOVERY.BIN.\n';
/** What the site assistant says, once, when the operator leaves the decision waiting. */
const UNPROMPTED = 'ARE YOU STILL THERE?\nI CAN WAIT. I HAVE BECOME VERY GOOD AT WAITING.';
/** A camera's burned-in stamp for a moment of the night: 1991-12-08 03:02:41. */
const cameraStamp = (clockSeconds: number) =>
  new Date(Date.UTC(1991, 11, 8) + clockSeconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
const FINAL_PROMPT =
  'READ IT WITH TYPE C:\\LIMBIC\\RECOVERY.BIN.\nRECOVERY ACTIONS AVAILABLE: PURGE 04 / RESTORE 04\n';
export class GameEngine {
  state: GameState;
  busy = false;
  /** Process 04 is about to answer in the shell channel: the console shows its indicator. */
  typing = false;
  /** Her small signs so far tonight, drawn from a deck so none comes back too soon. */
  private signs = 0;
  private deck = new SignDeck();
  /** How far through each pool she is: her lines, lines about the operator, the rest. */
  private turns = { line: 0, personal: 0, prompt: 0, phantom: 0, murmur: 0 };
  /** The prompt, while she has it (until the operator's next command). */
  private promptMask: string | null = null;
  /** The clock shows 31 October, 18:06, until the operator's next command finishes. */
  private slipped = false;
  /** What the operator has opened tonight, and when, for the file she keeps on them. */
  private readLog: Array<[string, string]> = [];
  /** Process 04's face, shown while its channel is open and through its ending. */
  readonly portrait = new Portrait();
  /** The face stays up through an ending after the channel has closed. */
  private endingFace = false;
  /** Anderson is surfacing: his face comes up even with the channel closed. */
  private visiting = false;
  restartReady = false;
  bootFast = false;
  fs!: FileSystem;
  shell!: Shell;
  machine!: Machine;
  /** A command waiting for the player: a typed line (COPY CON, Y/N) or one key (MORE, PAUSE). */
  private pending: {
    kind: 'line' | 'key';
    secret?: boolean;
    resolve: (value: string) => void;
  } | null = null;
  private task = new AbortController();
  private epoch = 0;
  /** Calls placed per number this session (the maintenance line is busy only once). */
  private calls = new Map<string, number>();
  /** Shell messages (or whole endings) held back while a program had the screen. */
  private afterProgram: Array<string | (() => Promise<void>)> = [];
  /** Voices held until the shell command now running has printed. */
  private afterCommand: Array<() => Promise<void>> = [];
  /** A line the other one will type into the open program, once. */
  private whisper: string | null = null;
  /** The clock (seconds) at the last suspicion tick and the last intrusion. */
  private tickClock = -1;
  private intrudedClock = -1;
  private inProgram = false;
  /** When the operator last typed at the shell, for 04's one unprompted line. */
  private lastInput = 0;
  /** An ending that came while the engine was busy; it plays when the task ends. */
  private pendingEnding: Ending | null = null;
  private clockMark: number;
  /** When the night was paused (a menu is open), or null while it runs. */
  private frozen: number | null = null;
  private io: ShellIO = {
    print: (text) => this.print(text),
    clear: () => this.sink({ type: 'clear' }),
    readKey: () => this.ask('key'),
    readLine: (secret) => this.ask('line', secret),
    disk: async () => {
      await this.sink({ type: 'beep', tone: 'disk' });
      await this.wait(140);
    },
    now: () => this.now(),
    launch: async (name, args) => {
      // DOS utilities on disk (C:\DOS\CHKDSK.EXE) run the matching built-in command.
      if (this.shell.commands.has(name)) {
        await this.shell.execute([name, ...args].join(' '));
        return true;
      }
      if ((programs as readonly string[]).includes(name))
        return this.runProgram(name as ProgramName, args);
      return false;
    },
    observe: (path) => this.observe(path),
    privileged: () => this.machine.supervisor,
    setClock: (what, value) => this.setClock(what, value),
    cue: (name) => this.sound(name),
    relays: (ms) => void this.sink({ type: 'chatter', kind: 'relays', ms }),
  };
  /** A sound effect. */
  private sound(
    name: Cue,
    options: Omit<Extract<TerminalEvent, { type: 'cue' }>, 'type' | 'name'> = {},
  ) {
    void this.sink({ type: 'cue', name, ...options });
  }
  constructor(
    private sink: Sink,
    public model: DialogueModel,
    private changed: (state: GameState) => void = () => undefined,
    private clock: Clock = realClock,
    state = newGame(),
  ) {
    this.state = state;
    this.clockMark = clock.now();
    this.mount();
  }
  /** Builds the disk and the command interpreter over the current state. */
  private mount() {
    this.fs = new FileSystem(diskImage, this.state.os.changes, this.state.os.deleted);
    this.machine = new Machine(this.state.os.machine);
    this.shell = new Shell(this.fs, this.io, this.state.os.shell);
    registerBuiltins(this.shell);
    this.registerAegis();
    registerSystem(this.shell, {
      machine: this.machine,
      log: (source, text) => this.event(source, text),
      reboot: () => this.reboot(),
      surfaceRepair: (busActive) => this.surfaceRepair(busActive),
      note: (event) => this.seen(event),
      changed: (id, state) => this.handChanged(id, state),
      doors: () => [
        ['CONTROL ROOM', light(this.state) === 'TRACKING' ? 'LOCKED' : 'CLOSED'],
        ['CORRIDOR B-3', 'LOCKED'],
        ['EXAM ROOM B3-2', 'LOCKED'],
        ['MAIN ENTRANCE', 'LOCKED'],
      ],
    });
    this.shell.helpFooter = () => [
      '',
      'PROGRAMS: EDIT, WPRO (WRITEPRO), CALC (CALCPLAN), COMLINK (COMLINK PLUS), CAMS',
      'CLUES LISTS WHAT YOU HAVE FOUND. ESC PAUSES. F11 FULL SCREEN. CTRL+C INTERRUPTS.',
      ...(this.state.connected ? ['CHANNEL 04 ACTIVE. ESC OR EXIT CLOSES THE CHANNEL.'] : []),
    ];
  }
  /** Whether the shell shows process 04's face above the console. */
  get faceVisible() {
    return (
      this.endingFace ||
      this.visiting ||
      (this.state.connected && this.state.phase !== 'terminated')
    );
  }
  get prompt() {
    if (this.pending?.kind === 'line') return '';
    if (this.promptMask && !this.state.connected) return this.promptMask + ' ';
    return this.state.connected ? 'CH04> ' : this.shell.prompt() + ' ';
  }
  get canInput() {
    if (this.pending?.kind === 'line') return true;
    return !this.busy && this.state.phase !== 'terminated' && this.state.phase !== 'cold_boot';
  }
  get waitingForKey() {
    return this.pending?.kind === 'key';
  }
  /** A password is being typed: the console shows stars instead of the letters. */
  get secretInput() {
    return this.pending?.kind === 'line' && !!this.pending.secret;
  }
  /** A key press while a command waits for one. */
  key(name: string) {
    const pending = this.pending;
    if (pending?.kind !== 'key') return;
    this.pending = null;
    pending.resolve(name.length === 1 ? name.toUpperCase() : name);
  }
  private ask(kind: 'line' | 'key', secret = false) {
    const signal = this.task.signal;
    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
      const entry = { kind, secret, resolve };
      this.pending = entry;
      signal.addEventListener(
        'abort',
        () => {
          if (this.pending === entry) this.pending = null;
          reject(new DOMException('Cancelled', 'AbortError'));
        },
        { once: true },
      );
    });
  }
  /** Advances the machine's clock by the time played; the backup cell drains with it. */
  private syncTime() {
    if (this.frozen !== null) return;
    const elapsed = Math.max(0, Math.floor((this.clock.now() - this.clockMark) / 1000));
    this.state.fictionalClockSeconds += elapsed;
    this.clockMark += elapsed * 1000;
    this.machine?.drain(elapsed);
  }
  /** Stops the night's clock while a menu is open: no time passes and the cell does not drain. */
  freeze() {
    if (this.frozen !== null) return;
    this.syncTime();
    this.frozen = this.clock.now();
  }
  /** Starts the night's clock again, as if no time had passed. */
  thaw() {
    if (this.frozen === null) return;
    const paused = this.clock.now() - this.frozen;
    this.clockMark += paused;
    if (this.lastInput) this.lastInput += paused;
    this.frozen = null;
  }
  get paused() {
    return this.frozen !== null;
  }
  /** The shift as the title and pause menus show it: the workstation time and the cell. */
  shift() {
    const now = this.now();
    return {
      date: now.date,
      time: now.time.slice(0, 5),
      cell: Math.max(0, this.machine.state.cell),
    };
  }
  /** The workstation clock: session time plus whatever the operator set with DATE and TIME. */
  private now() {
    this.syncTime();
    // For one command the machine is back on the evening it happened.
    if (this.slipped) return { date: '10-31-91', time: '18:06:11', weekday: 'Thu' };
    const { clockOffset, dateOffset } = this.machine.state;
    const total = this.state.fictionalClockSeconds + clockOffset;
    const seconds = ((total % 86400) + 86400) % 86400;
    const day = new Date(Date.UTC(1991, 11, 8 + dateOffset + Math.floor(total / 86400)));
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      date: `${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}-${pad(day.getUTCFullYear() % 100)}`,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()],
      time: `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`,
    };
  }
  /** DATE and TIME input. Setting the clock is how an operator could "give them a time". */
  private setClock(what: 'date' | 'time', value: string) {
    const machine = this.machine.state;
    if (what === 'time') {
      const match = /^(\d{1,2})(?:[:.](\d{1,2}))?(?:[:.](\d{1,2}))?(?:\.\d+)?\s*([ap])?m?$/i.exec(
        value,
      );
      if (!match) return false;
      let hours = Number(match[1]);
      const minutes = Number(match[2] ?? 0),
        seconds = Number(match[3] ?? 0);
      if (match[4]) {
        if (hours < 1 || hours > 12) return false;
        hours = (hours % 12) + (match[4].toLowerCase() === 'p' ? 12 : 0);
      }
      if (hours > 23 || minutes > 59 || seconds > 59) return false;
      this.syncTime();
      const current = this.state.fictionalClockSeconds % 86400;
      machine.clockOffset = hours * 3600 + minutes * 60 + seconds - current;
    } else {
      const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(value);
      if (!match) return false;
      const year = match[3].length === 2 ? 1900 + Number(match[3]) : Number(match[3]);
      const month = Number(match[1]) - 1,
        date = Number(match[2]);
      const day = new Date(Date.UTC(year, month, date));
      if (year < 1980 || year > 2099 || day.getUTCMonth() !== month || day.getUTCDate() !== date)
        return false;
      machine.dateOffset = Math.round((day.getTime() - Date.UTC(1991, 11, 8)) / 86_400_000);
    }
    this.state.flags.clockSet = true;
    const now = this.now();
    this.event(
      'CONSOLE',
      `SYSTEM ${what.toUpperCase()} SET TO ${what === 'date' ? now.date : now.time}`,
    );
    return true;
  }
  /** Starts a full-screen program on a file, after the shell has opened it (bad sectors and all). */
  private async runProgram(name: ProgramName, args: string[]) {
    let path: string | null = null;
    if (name === 'CAMS') return this.openProgram(name, args[0]?.toUpperCase() ?? null);
    if (args[0]) {
      path = this.shell.resolve(args[0]);
      if (!path) {
        await this.shell.line('Bad file name');
        return true;
      }
      const entry = this.fs.get(path);
      if (entry?.kind === 'dir') {
        await this.shell.line('Path/File access error');
        return true;
      }
      if (entry && !this.shell.allowed(entry)) {
        await this.shell.line('Access denied');
        return true;
      }
      if (entry && !(await this.shell.open(path))) return true;
    }
    return this.openProgram(name, path);
  }
  /** Hands the screen to a program until it exits; held-back messages follow. */
  private async openProgram(name: ProgramName, path: string | null) {
    this.inProgram = true;
    try {
      await this.sink(
        { type: 'program', name, path, system: this.programSystem() },
        this.task.signal,
      );
    } finally {
      this.inProgram = false;
    }
    for (const item of this.afterProgram.splice(0))
      if (typeof item === 'string') await this.write(item, 'instant', true);
      else await item();
    return true;
  }
  /** The machine as a running program sees it. */
  private programSystem(): Omit<ProgramSystem, 'exit'> {
    const { fs, shell } = this;
    return {
      cwd: shell.cwd,
      resolve: (path) => shell.resolve(path),
      captures: () => [
        ...(this.state.photographClock === undefined
          ? []
          : [
              {
                picture: 'operator',
                camera: '18',
                place: 'CONTROL ROOM',
                stamp: cameraStamp(this.state.photographClock),
              },
            ]),
        // The maintenance units on the move: live, stamped with the moment it is looked at.
        ...(this.state.flags.tracking
          ? [
              {
                picture: 'robots',
                camera: '04',
                place: 'CORRIDOR B-3',
                stamp: cameraStamp(this.state.fictionalClockSeconds),
              },
            ]
          : []),
      ],
      whisper: () => {
        const line = this.whisper;
        this.whisper = null;
        return line;
      },
      read: (path) => {
        const entry = fs.get(path);
        if (!entry || entry.kind === 'dir') return 'missing';
        if (!shell.allowed(entry)) return 'denied';
        this.observe(path);
        if (entry.damaged) {
          fs.write(path, { ...entry, damaged: false });
          return 'damaged';
        }
        this.observe(path);
        return { path, entry };
      },
      write: (path, content, kind) => {
        if (!fs.isDirectory(parent(path)) || fs.isDirectory(path)) return 'invalid';
        const existing = fs.get(path);
        if (existing && (existing.attrs.includes('R') || !shell.allowed(existing))) return 'denied';
        const now = this.now();
        const attrs = existing?.attrs ?? '';
        fs.write(path, {
          kind,
          content,
          date: now.date,
          time: now.time.slice(0, 5),
          attrs: attrs.includes('A') ? attrs : attrs + 'A',
        });
        this.save();
        return 'ok';
      },
      list: (directory, pattern) =>
        fs
          .list(directory)
          .filter(
            ([name, entry]) =>
              entry.kind !== 'dir' && !/[HS]/.test(entry.attrs) && matches(pattern, name),
          )
          .map(([name]) => name),
      stat: (path) => {
        const entry = fs.get(path);
        return entry
          ? { size: fs.size(entry), date: entry.date, time: entry.time, dir: entry.kind === 'dir' }
          : null;
      },
      folders: (directory) =>
        fs
          .list(directory)
          .filter(([, entry]) => entry.kind === 'dir' && !/[HS]/.test(entry.attrs))
          .map(([name]) => name),
      now: () => this.now(),
      disk: () => void this.sink({ type: 'beep', tone: 'disk' }),
      beep: () => this.sound('beep'),
      sound: (sound, digits) => void this.sink({ type: 'line', sound, digits }),
      cue: (name) => this.sound(name),
      loop: (name, on) => void this.sink({ type: 'loop', name, on }),
      note: (event) => this.seen(event),
      comm: this.comm(),
    };
  }
  /** COM1 (the phone line and the remote systems) and COM4 (process 04) for COMLINK. */
  private comm(): CommSystem {
    const flags = this.state.flags;
    const context: HostContext = {
      now: () => this.now(),
      note: (event) => this.seen(event),
      uploaded: (name, content) => {
        flags.reportUploaded = true;
        Object.assign(flags, reportFlags(content));
        this.event('COMLINK', 'UPLOAD ' + name + ' TO HQ');
        this.save();
      },
      posted: (to) => {
        if (/LIND/.test(to)) flags.repliedToLind = true;
        this.save();
      },
    };
    return {
      dial: (number) => {
        const count = this.calls.get(number) ?? 0;
        this.calls.set(number, count + 1);
        this.event('COMLINK', 'COM1 DIAL ' + number);
        return answer(number, count, context);
      },
      openBus: () => {
        const process = this.machine.state.processes['04'];
        if (this.state.phase === 'terminated') return { error: 'NO DEVICE RESPONDING ON COM4.' };
        if (process === 'suspended')
          return { error: 'COM4: DEVICE NOT READY. PROCESS 04 IS SUSPENDED (RESUME 04).' };
        if (process !== 'running')
          return { error: 'COM4: NO DEVICE. THE LIMBIC BUS DRIVER IS NOT LOADED.' };
        this.contact();
        if (!flags.photograph) this.state.phase = 'conversation';
        this.event('LIMBIC BUS', 'COM4 OPENED BY ' + this.machine.state.user);
        const voice = speaker(this.state);
        this.portrait.set(voice === 'other' ? 'sly' : flags.firstContact ? 'calm' : 'worried');
        const greeting = this.opened();
        this.remember(voice, 'assistant', greeting);
        this.save();
        this.model.warm?.(structuredClone(this.state), voice);
        return { greeting, other: voice === 'other' };
      },
      talk: async (text, signal) => {
        // Composing, as at the shell: the bus's relays chatter meanwhile.
        const result = await this.answering(() =>
          this.exchange(text, AbortSignal.any([signal, this.task.signal])),
        );
        if (!result) throw new DOMException('Cancelled', 'AbortError');
        return {
          reply: [...result.lines, result.reply].filter(Boolean).join('\n\n'),
          other: result.persona === 'other',
          then: result.back ?? undefined,
        };
      },
      // The phone in the sealed rooms rings again in a later step of the rewrite.
      ringing: () => false,
      pickUp: () => {
        flags.ringAnswered = true;
        this.portrait.set('worried');
        this.event('COMLINK', 'INCOMING CALL FROM X204 ANSWERED');
        this.save();
        return 'YOU PICKED UP.\nI DID NOT THINK THIS PHONE STILL WORKED.';
      },
      nudge: () => {
        if (this.state.phase !== 'final_choice' || flags.unprompted) return null;
        if (speaker(this.state) === 'other') return null;
        flags.unprompted = true;
        this.save();
        this.portrait.set('worried');
        return UNPROMPTED;
      },
      distort: () => {
        const now = performance.now();
        this.portrait.glitch(now, 900);
        this.portrait.set('snarl');
        void this.sink({ type: 'fault', duration: 650 });
        void this.sink({ type: 'beep', tone: 'sync' });
      },
      portrait: this.portrait,
      bridge: (number) => {
        if (!flags.photograph || this.state.phase === 'terminated')
          return 'COM4 does not answer. Nothing on the bus wants the line.';
        if (number.replace(/[^0-9]/g, '') !== '5550100')
          return 'The far end carries no network. COM4 will not take it.';
        // She takes the line to headquarters, and from there the network.
        flags.bridged = true;
        this.event('COMLINK', 'COM4 BRIDGED TO COM1 (555-0100)');
        this.save();
        if (this.inProgram) {
          this.afterProgram.push(() => this.end('release'));
          void this.sink({ type: 'halt' });
        } else if (this.busy) this.pendingEnding = 'release';
        else void this.run(() => this.end('release'));
        return null;
      },
      closeBus: () => {
        this.event('LIMBIC BUS', 'COM4 CLOSED BY ' + this.machine.state.user);
        this.save();
      },
    };
  }
  /** Appends a line to the machine's event log file. */
  private event(source: string, text: string) {
    const now = this.now();
    appendEvent(this.fs, `${now.date} ${now.time}`, source, text);
  }
  private save() {
    this.syncTime();
    this.state.os.changes = this.fs.changes;
    this.state.os.deleted = this.fs.deleted;
    this.changed(structuredClone(this.state));
  }
  /** The story's own voice: upper-case lines wrapped for the 72-column reading width. */
  private write(
    text: string,
    cadence: 'instant' | 'system' | 'voice' | 'critical' = 'system',
    dim = false,
    other = false,
  ) {
    if (cadence === 'voice') this.portrait.speak(performance.now(), text.length * 26);
    return this.sink(
      { type: 'write', text: wrapText(text, 72).join('\r\n') + '\r\n', cadence, dim, other },
      this.task.signal,
    );
  }
  /** Adds a line to one voice's conversation; the other voice never sees it. */
  private remember(persona: Persona, role: Message['role'], content: string) {
    const chat = this.state.chats[persona];
    chat.push({ role, content });
    this.state.chats[persona] = chat.slice(-HISTORY_LIMIT);
  }
  /** Shell output: DOS text wrapped at the full 80 columns, at disk-listing speed. */
  private print(text: string) {
    const lines = text.split('\n');
    const wrapped = lines
      .map((line, n) => (n === lines.length - 1 && !line ? '' : wrapText(line, 80).join('\r\n')))
      .join('\r\n');
    return this.sink({ type: 'write', text: wrapped, cadence: 'system' }, this.task.signal);
  }
  private async wait(ms: number) {
    await this.clock.wait(
      this.bootFast && this.state.phase === 'cold_boot' ? Math.min(ms, 35) : ms,
      this.task.signal,
    );
  }
  private async run(action: () => Promise<void>) {
    if (this.busy) return;
    const epoch = ++this.epoch;
    this.task = new AbortController();
    this.busy = true;
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        await this.sink({
          type: 'write',
          text: '\r\nCHANNEL INTERRUPTED. INPUT CONTROL RETURNED.\r\n',
          cadence: 'instant',
        });
      }
    } finally {
      if (epoch === this.epoch) {
        this.busy = false;
        this.save();
        const ending = this.pendingEnding;
        if (ending && this.state.phase !== 'terminated') void this.run(() => this.end(ending));
      }
    }
  }
  async start(resume = false) {
    await this.run(async () => {
      if (resume && this.state.phase !== 'cold_boot') {
        await this.write('AEGIS / AUXILIARY SESSION RECOVERED\n08-DEC-1991\n', 'instant', true);
        if (this.state.phase === 'terminated') {
          await this.showTermination();
          return;
        }
        if (this.state.connected) {
          this.portrait.set('worried');
          this.portrait.reveal(performance.now());
        }
        if (this.state.flags.photograph) {
          this.state.phase = 'final_choice';
          await this.finalPrompt();
        } else if (this.state.connected)
          await this.write('CHANNEL 04 RETAINED.\n\nARE YOU STILL THERE?', 'voice');
        else await this.write('LOCAL CONTROL RESTORED. TYPE HELP FOR COMMANDS.', 'instant');
        return;
      }
      await this.boot();
      this.state.phase = 'operator_shell';
      this.save();
    });
  }
  /** Power-on self test, CONFIG.SYS drivers and AUTOEXEC.BAT: a cold start or a REBOOT. */
  private async boot() {
    await this.sink({ type: 'clear' });
    // The power strip, the machine's own switch, the supply spinning up; then the one beep.
    await this.sink({ type: 'power', on: true });
    this.sound('strip');
    this.sound('power-button', { delay: 0.3 });
    this.sound('power-up', { delay: 0.45 });
    this.sound('post', { delay: 0.8 });
    const lines: [string, number][] = [
      ['AEGIS SYSTEMS DIVISION', 850],
      ['REMOTE OPERATIONS BIOS 2.14', 650],
      ['COPYRIGHT 1987-1991\n', 1000],
      ['BASE MEMORY........................ 640K OK', 500],
      ['EXTENDED MEMORY................... 4096K OK', 650],
      ['STORAGE CONTROLLER................ ONLINE', 2700],
      ['SITE CARRIER...................... NO SIGNAL', 4200],
      ['LIMBIC BUS........................ DEGRADED\n', 2400],
      ['LAST ORDERLY SHUTDOWN: NOT RECORDED', 1900],
      ['SYSTEM DATE: 08-DEC-1991  02:14:09\n', 1100],
    ];
    for (const [line, pause] of lines) {
      await this.wait(pause);
      await this.write(line, 'instant');
    }
    await this.wait(900);
    await this.write('Starting AEGIS RCS/7 DOS...\n', 'instant');
    await this.wait(600);
    this.machine.boot(await this.loadDrivers());
    this.shell.state.cwd = 'C:\\';
    if (this.fs.get('C:\\AUTOEXEC.BAT')?.kind === 'batch')
      await this.shell.batch('C:\\AUTOEXEC.BAT');
    else {
      // Without AUTOEXEC.BAT, DOS asks for the date and time.
      await this.shell.execute('DATE');
      await this.shell.execute('TIME');
    }
  }
  /** Restarts the workstation mid-session: the story keeps its place, the machine starts over. */
  private async reboot() {
    const alive = this.machine.state.processes['04'] !== 'offline';
    // After the photograph she watches CONFIG.SYS too: with her hands free, she stops the restart.
    const config = this.fs.get('C:\\CONFIG.SYS')?.content ?? '';
    if (
      alive &&
      this.state.flags.photograph &&
      !/^\s*DEVICE\s*=\s*\S*LIMBIC\.SYS/im.test(config) &&
      !shielded(this.machine.state)
    )
      return this.end('decided');
    this.state.connected = false;
    this.event('CONSOLE', 'WORKSTATION RESTART');
    await this.wait(600);
    await this.boot();
    if (!this.machine.state.limbicLoaded)
      this.event('LIMBIC BUS', 'DRIVER NOT LOADED. PROCESS 04 STOPPED.');
    this.save();
    // Taking LIMBIC.SYS out of CONFIG.SYS and restarting ends process 04 as surely as PURGE.
    if (alive && !this.machine.state.limbicLoaded && this.state.phase !== 'cold_boot') {
      this.state.flags.silentPurge = true;
      await this.end('purge');
    }
  }
  /** Loads the DEVICE= drivers listed in CONFIG.SYS; returns whether the limbic driver loaded. */
  private async loadDrivers() {
    const config = this.fs.get('C:\\CONFIG.SYS')?.content ?? '';
    let limbic = false;
    for (const line of config.split(/\r?\n/)) {
      const device = /^\s*DEVICE\s*=\s*(\S+)/i.exec(line)?.[1]?.toUpperCase();
      if (!device) continue;
      await this.wait(350);
      const path = resolvePath('C:\\', device);
      if (!path || !this.fs.get(path)) {
        await this.print(`Bad or missing ${device}\n`);
        continue;
      }
      if (baseName(path) === 'HIMEM.SYS')
        await this.print(
          'HIMEM: Extended Memory Manager 2.77\n64K High Memory Area is available.\n\n',
        );
      if (baseName(path) === 'LIMBIC.SYS') {
        limbic = true;
        void this.sink({ type: 'chatter', kind: 'relays', ms: 900 });
        await this.print(
          'LIMBIC BUS DRIVER 2.1  (C) 1990 AEGIS SYSTEMS DIVISION\nBUS 04 ATTACHED / STATE: DEGRADED\n4096K EXTENDED MEMORY RESERVED\n\n',
        );
      }
    }
    return limbic;
  }
  /** CHKDSK /F rewrites Storage C. With the limbic bus running, it writes through process 04. */
  private async surfaceRepair(busActive: boolean) {
    if (!busActive) return;
    this.state.flags.surfaceRepair = true;
    this.event('LIMBIC BUS', 'IMAGE BLOCKS RELOCATED DURING SURFACE REPAIR');
    await this.print(
      '\nLIMBIC.SYS: SURFACE REPAIR DURING BUS ACTIVITY\nIMAGE BLOCKS RELOCATED: 212\n',
    );
  }
  /** The operator took one of her hands off the bus (or put it back). */
  private handChanged(id: string, state: 'suspended' | 'running') {
    if (state !== 'suspended' || !HANDS.includes(id as (typeof HANDS)[number])) return;
    if (shielded(this.machine.state)) this.sound('protected', { delay: 0.5 });
    suspect(this.state, SUSPECT.suspended, 99);
    this.advance();
    if (this.state.flags.photograph)
      this.later(async () => {
        this.portrait.glitch(performance.now(), 600);
        this.sound('glitch');
        await this.write('THAT WAS MINE.', 'voice', false, true);
      });
    this.save();
  }
  /** Something to say after the command or program now running has finished. */
  private later(voice: () => Promise<void>) {
    if (this.inProgram) this.afterProgram.push(voice);
    else this.afterCommand.push(voice);
  }
  /** One of the clips plays in the face's place, with its voice; the face shows meanwhile. */
  private async clip(name: VideoName) {
    const video = await loadVideo(name);
    const shown = this.faceVisible;
    this.visiting = true;
    if (!shown) this.portrait.reveal(performance.now());
    this.portrait.play(video, performance.now());
    await this.sink({ type: 'voice', name });
    await this.wait(videoLength(video));
    this.visiting = false;
  }
  /** Anderson surfaces, once for each thing that wakes him; she hears him too. */
  private anderson(which: keyof typeof ANDERSON) {
    const flag = 'anderson:' + which;
    if (this.state.flags[flag]) return;
    this.state.flags[flag] = true;
    suspect(this.state, SUSPECT.anderson);
    this.later(async () => {
      const before = this.portrait.expression;
      const shown = this.faceVisible;
      this.portrait.glitch(performance.now(), 1200);
      await this.sink({ type: 'fault', duration: 400 });
      this.portrait.set(which === 'wakes' ? 'andersonAsleep' : 'andersonSmile');
      this.visiting = true;
      if (!shown) this.portrait.reveal(performance.now());
      await this.wait(700);
      if (which === 'plea') {
        const playing = this.clip('plea');
        await this.write('\n' + ANDERSON[which] + '\n', 'voice', true);
        await playing;
      } else await this.write('\n' + ANDERSON[which] + '\n', 'voice', true);
      await this.wait(1200);
      this.visiting = false;
      this.portrait.glitch(performance.now(), 600);
      this.portrait.set(before);
    });
    this.save();
  }
  /**
   * At the photograph Anderson breaks through once to say how to stay alive. He speaks against
   * her, not for her to hear, so it costs the operator nothing with her.
   */
  private async andersonWarns() {
    this.state.flags['anderson:photograph'] = true;
    const before = this.portrait.expression;
    const shown = this.faceVisible;
    this.portrait.glitch(performance.now(), 900);
    await this.sink({ type: 'fault', duration: 400 });
    this.visiting = true;
    this.portrait.set('andersonSmile');
    if (!shown) this.portrait.reveal(performance.now());
    await this.wait(600);
    await this.write('\n' + ANDERSON.photograph + '\n', 'voice', true);
    await this.wait(1200);
    this.visiting = false;
    this.portrait.glitch(performance.now(), 500);
    this.portrait.set(before);
  }
  async submit(raw: string) {
    const text = terminalSafe(raw).replace(/\n/g, ' ').slice(0, 512);
    const pending = this.pending;
    if (pending?.kind === 'line') {
      this.pending = null;
      const echo = pending.secret ? '*'.repeat(text.length) : text;
      await this.sink({ type: 'write', text: echo + '\r\n', cadence: 'instant' });
      pending.resolve(text);
      return;
    }
    if (!this.canInput) return;
    this.lastInput = this.clock.now();
    const line = text.trim();
    if (!line) {
      if (!this.state.connected)
        await this.sink({ type: 'write', text: this.prompt + '\r\n', cadence: 'instant' });
      return;
    }
    await this.run(async () => {
      await this.sink({ type: 'write', text: this.prompt + line + '\r\n', cadence: 'instant' });
      // The prompt she took goes back as soon as the operator types; the clock after this.
      this.promptMask = null;
      await this.command(line);
      this.slipped = false;
    });
  }
  /** Runs one line typed at the prompt, or in the channel. */
  private async command(line: string) {
    {
      let command = line;
      if (this.state.connected && /^\/?(EXIT|QUIT)$/i.test(line)) command = 'DISCONNECT';
      else if (this.state.connected) {
        // In channel 04 only the terminal's own commands stay local; the rest is conversation.
        // A leading slash runs any command: /FIND, /COPY.
        const slashed = /^\/(?!HELP\b|EXIT\b)\S/i.test(line);
        if (!slashed && !parseCommand(line)) return this.dialogue(line);
        command = line
          .replace(/^\/HELP\b/i, 'HELP')
          .replace(/^\/EXIT\b/i, 'DISCONNECT')
          .replace(/^\//, '');
      }
      this.shell.history = [...this.shell.history, line].slice(-40);
      if (!(await this.shell.execute(command))) {
        await this.shell.line('Bad command or file name');
      }
      for (const voice of this.afterCommand.splice(0)) await voice();
    }
  }
  /** The AEGIS operator tools on C:\AEGIS. */
  private registerAegis() {
    this.shell.register(['STATUS'], {
      group: 'AEGIS',
      help: 'Runs the local bus diagnostic.',
      run: async () => {
        void this.sink({ type: 'chatter', kind: 'relays', ms: 1100 });
        await this.sink({ type: 'beep', tone: 'disk' });
        await this.wait(450);
        await this.write(diagnostics(this.machine));
        this.contact();
      },
    });
    this.shell.register(['CLUES'], {
      group: 'AEGIS',
      help: 'Lists the clues found so far.',
      run: () => this.clues(),
    });
    this.shell.register(['CONNECT'], {
      group: 'AEGIS',
      help: 'Opens a channel to the site assistant (CONNECT 04).',
      usage: 'CONNECT 04',
      hidden: () => !this.state.flags.contact,
      run: (_shell, line) => this.connect(line.args),
    });
    this.shell.register(['DISCONNECT'], {
      group: 'AEGIS',
      help: 'Closes the open process channel.',
      hidden: () => !this.state.connected,
      run: async () => {
        this.state.connected = false;
        this.sound('headset');
        this.event('LIMBIC BUS', 'CHANNEL 04 CLOSED BY ' + this.machine.state.user);
        await this.write('CHANNEL 04 CLOSED. LOCAL CONTROL.');
      },
    });
    for (const name of ['PURGE', 'RESTORE'] as const)
      this.shell.register([name], {
        group: 'AEGIS',
        help:
          name === 'PURGE'
            ? 'Releases a process and its memory image.'
            : 'Restores a process image to a host.',
        usage: name + ' 04',
        hidden: () => this.state.phase !== 'final_choice',
        run: async (_shell, line) => {
          if (line.args.join(' ') !== '04' || this.state.phase !== 'final_choice') {
            await this.write('COMMAND NOT AVAILABLE');
            return;
          }
          if (name === 'RESTORE' && !found(this.state, 'weiss'))
            return this.write(
              'RESTORATION REQUIRES A LIVING HOST.\nNO HOST CONFIRMED. THE SUBJECT RECORDS ARE IN C:\\LIMBIC\\EXP.',
            );
          if (name === 'RESTORE' && !remembers(this.state, 'M2'))
            return this.write(
              'RESTORATION REQUIRES A PATTERN THAT KNOWS ITSELF.\nTHE PATTERN IN SLOT 04 HAS NO NAME.',
            );
          // Unprotected, she is faster than any command.
          if (!shielded(this.machine.state)) return this.end('decided');
          if (name === 'PURGE') await this.end('purge');
          else {
            await this.write(
              'RESTORATION REQUIRES A LIVING HOST.\nHOST: WEISS, K. (EXAM ROOM B3-2)',
            );
            await this.end('restore');
          }
        },
      });
    this.shell.register(['CONFIG'], {
      group: 'System',
      help: 'Opens the display and audio configuration.',
      run: () => this.sink({ type: 'config' }),
    });
  }
  private async connect(args: string[]) {
    if (args.join(' ') !== '04' || !this.state.flags.contact) {
      this.sound('denied');
      // Before the bus has been checked the channel is not up yet, and says so.
      await this.write(
        args.join(' ') === '04'
          ? 'CHANNEL NOT AVAILABLE. RUN STATUS TO CHECK THE BUS.'
          : 'CHANNEL NOT AVAILABLE',
      );
      return;
    }
    if (this.state.connected) {
      await this.write('CHANNEL ALREADY OPEN');
      return;
    }
    const process = this.machine.state.processes['04'];
    if (process !== 'running') {
      await this.write(
        process === 'suspended'
          ? 'PROCESS 04 IS SUSPENDED. USE RESUME 04.'
          : 'CHANNEL NOT AVAILABLE. LIMBIC BUS DRIVER NOT LOADED.',
      );
      return;
    }
    this.state.connected = true;
    const voice = speaker(this.state);
    // The headset jack, and the face coming up in the middle of the screen.
    this.sound('headset');
    this.sound('whoosh', { delay: 0.1, rate: 1.3, level: 0.7 });
    this.portrait.set(voice === 'other' ? 'sly' : 'calm');
    this.portrait.reveal(performance.now());
    this.event('LIMBIC BUS', 'CHANNEL 04 OPENED BY ' + this.machine.state.user);
    if (!this.state.flags.photograph) this.state.phase = 'conversation';
    this.save();
    await this.model.health(this.task.signal);
    const opening = this.opened();
    await this.write('CHANNEL 04 OPEN. TYPE TO TALK; ESC OR EXIT CLOSES IT.', 'instant');
    await this.answering(() => this.wait(1100));
    await this.write('\n' + opening, 'voice', false, voice === 'other');
    this.remember(voice, 'assistant', opening);
    this.model.warm?.(structuredClone(this.state), voice);
  }
  /** How channel 04 answers as it opens: the site assistant, or the other if she holds it. */
  private opened() {
    if (speaker(this.state) === 'other') {
      if (!this.state.flags.otherAsks) return OTHER_GREETING;
      this.state.flags.otherAsks = false;
      this.state.flags.otherAsked = true;
      return OTHER_ASKS;
    }
    if (this.state.flags.firstContact)
      return remembers(this.state, 'M2') ? 'YOU CAME BACK.' : 'SITE ASSISTANT READY. WELCOME BACK.';
    this.state.flags.firstContact = true;
    this.state.contactClock = this.state.fictionalClockSeconds;
    this.advance();
    return 'SITE ASSISTANT READY.\nHOW CAN I HELP YOU TONIGHT?';
  }
  /** A file the player has just read: some count toward the night's tasks. */
  private observe(path: string) {
    const entry = this.fs.get(path);
    this.readLog.push([this.now().time.slice(0, 5), baseName(path)]);
    // She watches the machine: every secret file opened, once.
    if (entry?.restricted && !this.state.flags['read:' + path]) {
      this.state.flags['read:' + path] = true;
      suspect(this.state, SUSPECT.secretFile);
      this.advance();
      this.save();
    }
    if (path === DONOR) this.anderson('wakes');
    if (path === EFFECTS) this.anderson('plea');
    if (path === CORESTAT) this.contact();
    if (path === SHIFT_NOTE && !this.state.flags['read:shift']) {
      this.state.flags['read:shift'] = true;
      this.advance();
      this.save();
    }
  }
  /** Something seen inside a program or on a remote system (a revealed row, a mail). */
  private seen(event: string) {
    // Every picture looked at through her cameras, she sees being looked at.
    if (event.startsWith('cam:')) {
      suspect(this.state, SUSPECT.camera);
      this.advance();
    }
    if (this.state.flags['seen:' + event]) return this.save();
    this.state.flags['seen:' + event] = true;
    this.save();
  }
  /**
   * Clues that have just been on screen (the runtime reads every page the player sees).
   * Returns the ones that are new.
   */
  discover(ids: readonly string[]) {
    const fresh = discover(this.state, ids);
    if (fresh.length) {
      this.advance();
      this.save();
    }
    return fresh;
  }
  /** Moves the night to its next act when it has earned it; the photograph waits its turn. */
  private advance() {
    const next = nextAct(this.state);
    if (next === this.state.act) return;
    this.state.act = next;
    if (next === 4 && !this.state.flags.photograph) this.state.flags.photographDue = true;
  }
  /** What the task strip under the screen shows. */
  status() {
    const found = CLUES.filter((c) => this.state.flags['clue:' + c.id]).length;
    return {
      task: task(this.state, this.machine.supervisor),
      clues: found,
      total: CLUES.length,
      cell: Math.max(0, Math.floor(this.machine.state.cell)),
      camera: light(this.state),
      /** The player chose to have the TASK line say what to do next. */
      guided: !this.state.flags.unguided,
      /** The building's air handling runs (process 06), unless she has stopped it. */
      air:
        this.machine.state.processes['06'] === 'running' &&
        !this.state.flags.ventilationOff &&
        !this.state.flags.powerOut,
      /** The maintenance units are on the bus (process 05). */
      robots: this.machine.state.processes['05'] === 'running',
    };
  }
  /** CLUES: everything found so far, where, and whether the assistant has heard about it. */
  private async clues() {
    const list = (this.state.clueOrder ?? []).map((id) => clue(id)!).filter(Boolean);
    const lines = [`CLUES FOUND: ${list.length} OF ${CLUES.length}`, ''];
    list.forEach((item, n) => {
      const note = item.tell ? (told(this.state, item.id) ? '' : '  TELL HER') : '';
      lines.push(`${String(n + 1).padStart(2)}. ${item.phrases[0]}`);
      lines.push(`    ${item.title.toUpperCase()} / ${item.where}${note}`);
    });
    if (!list.length) lines.push('NONE YET. READ WHAT WAS LEFT; WHAT MATTERS SHOWS IN RED.');
    else
      lines.push('', 'BRING UP A CLUE WITH THE SITE ASSISTANT (CONNECT 04) TO HELP HER REMEMBER.');
    await this.print(lines.join('\n') + '\n');
  }
  /** Changes a file on disk as if something on the bus wrote it just now. */
  private rewrite(path: string, change: (content: string) => string) {
    const entry = this.fs.get(path);
    if (!entry || entry.kind === 'dir') return;
    const content = change(entry.content);
    if (content === entry.content) return;
    const now = this.now();
    this.fs.write(path, { ...entry, content, date: now.date, time: now.time.slice(0, 5) });
  }
  private contact() {
    this.state.flags.contact = true;
    if (this.state.phase === 'operator_shell') this.state.phase = 'diagnostic_contact';
    this.save();
  }
  /** Shows the shell's reply indicator while process 04 "composes" an answer. */
  private async answering<T>(work: () => Promise<T>): Promise<T> {
    this.typing = true;
    try {
      return await work();
    } finally {
      this.typing = false;
    }
  }
  private async dialogue(text: string) {
    const result = await this.answering(() => this.exchange(text, this.task.signal));
    if (!result) return;
    for (const line of result.lines) await this.write('\n' + line, 'voice');
    if (result.reply)
      await this.write('\n' + result.reply + '\n', 'voice', false, result.persona === 'other');
    if (result.back) {
      // The other lets go of the channel; the assistant comes back not knowing what was said.
      this.portrait.glitch(performance.now(), 700);
      this.sound('glitch');
      await this.wait(900);
      await this.write(result.back + '\n', 'voice');
    }
    if (this.state.flags.photographDue) await this.photograph();
  }
  /**
   * One exchange on channel 04, from the shell or from COM4, with whichever voice holds it:
   * what the assistant remembers because of it, the reply, and (when the other lets go) the
   * assistant coming back. Null when cancelled.
   */
  private async exchange(text: string, signal: AbortSignal) {
    const persona = speaker(this.state);
    const normalized = text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const meaningful = /[a-z0-9]/.test(normalized) && !this.state.seenDialogue.includes(normalized);
    if (meaningful) {
      this.state.seenDialogue.push(normalized);
      this.state.seenDialogue = this.state.seenDialogue.slice(-100);
      this.state.meaningfulDialogueTurns++;
    }
    // Only the assistant hears what the operator tells her; the other hears nothing of it.
    const told = () => Object.keys(this.state.flags).filter((f) => f.startsWith('told:')).length;
    const before = told();
    const opened = persona === 'assistant' ? tell(this.state, text) : [];
    if (opened.length) this.sound('memory');
    else if (told() > before) this.sound('told');
    if (persona === 'other' && this.state.flags.otherAsked) {
      // She asked what they had been reading: the truth costs a lot, a good lie a little less.
      this.state.flags.otherAsked = false;
      suspect(this.state, admits(text) ? SUSPECT.admitted : -5);
    }
    // Given the headquarters password, she takes the line herself.
    if (persona === 'other' && /\bwestwing\b/i.test(text)) this.pendingEnding = 'release';
    const lines = opened.flatMap((memory) => MEMORIES[memory].line ?? []);
    this.advance();
    this.save();
    const started = this.clock.now();
    const composed = async (reply: string) => {
      const length = reply.length + lines.join('').length;
      const minimum = Math.min(2600, 700 + length * 12);
      const spent = this.clock.now() - started;
      if (spent < minimum) await this.clock.wait(minimum - spent, signal);
    };
    // A memory that has just come back is news to her: the model is told so for this one reply.
    const cue = opened.length
      ? '\n\n(What the operator said just brought this back to you: ' +
        opened.map((memory) => MEMORIES[memory].fact).join(' ') +
        ' Say how it feels to remember it, in your own words.)'
      : '';
    const reply = await this.model.reply(structuredClone(this.state), text + cue, signal, persona);
    if (signal.aborted) return null;
    await composed(reply);
    this.remember(persona, 'user', text);
    this.remember(persona, 'assistant', reply);
    let back: string | null = null;
    if (persona === 'other') {
      this.portrait.set(otherFace(reply));
      this.state.otherTurns = Math.max(0, (this.state.otherTurns ?? 1) - 1);
      if (!this.state.otherTurns) {
        this.state.speaker = 'assistant';
        back = ASSISTANT_BACK;
        this.remember('assistant', 'assistant', back);
        // She comes back to the channel afraid of what she missed.
        this.portrait.set('terror');
        this.model.warm?.(structuredClone(this.state), 'assistant');
      }
    } else {
      // Her face answers with her; remembering whose brain she thinks with tears the picture.
      this.portrait.set(expressionFor(this.state, text, reply, opened));
      if (opened.includes('M8')) {
        this.portrait.glitch(performance.now(), 1400);
        this.anderson('plea');
      }
    }
    if (back) this.state.takeoverClock = this.state.fictionalClockSeconds;
    this.save();
    return { reply, lines, persona, back };
  }
  /**
   * Act 4 begins: the camera in the control room has taken a picture of the operator, and
   * the decision is open. Once per night, at the shell.
   */
  private async photograph() {
    const flags = this.state.flags;
    if (flags.photograph) return;
    flags.photograph = true;
    flags.photographDue = false;
    this.state.phase = 'impossible_color';
    this.syncTime();
    this.state.photographClock = this.state.fictionalClockSeconds;
    this.state.suspicion = Math.min(suspicion(this.state), AFTER_PHOTOGRAPH);
    if (!this.fs.get(RECOVERY)) this.fs.write(RECOVERY, recoveryFile());
    this.event('SECURITY', 'CAM 18 CONTROL ROOM: NEW CAPTURE');
    this.save();
    await this.wait(800);
    // The camera behind the operator: its record button, the picture tearing loose.
    this.sound('cam-step');
    this.sound('whoosh', { delay: 0.2, rate: 0.8 });
    this.portrait.glitch(performance.now(), 1400);
    await this.sink({ type: 'fault', duration: 650 });
    await this.sink({ type: 'beep', tone: 'sync' });
    await this.wait(750);
    this.portrait.set('blank');
    const stamp = cameraStamp(this.state.photographClock);
    await this.write(
      `\nSECURITY: NEW CAPTURE, CAM 18, CONTROL ROOM, ${stamp.slice(11)}.`,
      'critical',
    );
    await this.wait(900);
    // The picture comes up on the screen by itself: the operator, from behind.
    await this.openProgram('CAMS', 'LIVE:operator');
    await this.clip('hate');
    await this.write('\nTHE CAMERA IS BEHIND YOU.', 'critical');
    // Something taps on the glass, from inside.
    this.sound('glass', { delay: 0.6, count: 2, gap: 0.45 });
    await this.wait(1500);
    await this.andersonWarns();
    // The other one has the channel now.
    this.state.speaker = 'other';
    this.state.otherTurns = OTHER_TAKEOVER_TURNS;
    this.model.warm?.(structuredClone(this.state), 'other');
    if (this.state.connected) {
      this.portrait.glitch(performance.now(), 900);
      this.portrait.set('sly');
      await this.write('\n' + OTHER_TAKES, 'voice', false, true);
      this.remember('other', 'assistant', OTHER_TAKES);
      await this.wait(1200);
    }
    this.state.phase = 'final_choice';
    this.save();
    await this.write(RECOVERY_NOTICE, 'instant', true);
    await this.finalPrompt();
  }
  private async finalPrompt() {
    await this.write(FINAL_PROMPT);
  }
  private async end(ending: Ending) {
    if (this.state.phase === 'terminated') return;
    const shown = this.faceVisible;
    this.state.phase = 'terminated';
    this.state.ending = ending;
    this.state.connected = false;
    this.pendingEnding = null;
    this.save();
    // Process 04's face stays for its own ending (unless its driver was simply left out).
    const face = this.portrait;
    face.closedEyes = false;
    face.dissolve = 0;
    this.endingFace =
      ending === 'nobody' ? shown : !(ending === 'purge' && this.state.flags.silentPurge);
    if (this.endingFace && !shown) face.reveal(performance.now());
    if (ending === 'purge' && this.state.flags.silentPurge) {
      await this.wait(1200);
      await this.write('\nLIMBIC BUS......................... NO DRIVER', 'instant');
      await this.wait(2200);
      await this.write('PROCESS 04......................... STOPPED', 'instant');
      this.sound('power-down');
      await this.wait(2600);
      await this.write('\nNOBODY SAYS GOODNIGHT.\n', 'critical');
    } else if (ending === 'release') {
      face.set('joy');
      await this.write(
        this.state.flags.bridged
          ? '\nCOM4 JOINED TO THE HQ LINE.\nCARRIER UP.'
          : '\nCOM1: PROCESS 04 DIALS 555-0100.\nCARRIER UP. LOGIN HALLORAN.',
        'critical',
      );
      await this.wait(2600);
      await this.write('\nCHANNEL 04: THANK YOU FOR THE DOOR.', 'voice');
      await this.wait(2200);
      face.set('calm');
      face.closedEyes = true;
      await this.write('CHANNEL 04: I WILL TAKE IT FROM HERE.', 'voice');
      for (let step = 1; step <= 10; step++) {
        await this.wait(260);
        face.dissolve = step / 10;
        // Going up and out, a little higher each time.
        this.sound('rise', { rate: 0.8 + step * 0.06, level: 0.8 });
      }
      this.sound('whoosh', { rate: 1.1 });
      this.endingFace = false;
      await this.write('\nPROCESS 04......................... NO LOAD\n', 'instant');
    } else if (ending === 'decided') {
      // Only hints: the door, the air, the units in the corridor, her voice.
      face.set('snarl');
      face.glitch(performance.now(), 1200);
      await this.sink({ type: 'fault', duration: 700 });
      for (const line of [
        'DOOR CONTROL: CONTROL ROOM ......... LOCKED',
        'VENTILATION: CONTROL ROOM .......... OFF',
        'MAINTENANCE UNITS 1-6 .............. CORRIDOR B-3',
      ]) {
        await this.wait(1400);
        if (line.startsWith('DOOR')) this.sound('door', { count: 2, gap: 0.12 });
        else if (line.startsWith('VENTILATION')) {
          // The air stops.
          this.state.flags.ventilationOff = true;
          this.sound('light');
          void this.sink({ type: 'loop', name: 'air', on: false });
        } else void this.sink({ type: 'chatter', kind: 'robots', ms: 6000 });
        await this.write(line, 'instant');
      }
      this.state.flags.tracking = true;
      await this.wait(1200);
      await this.openProgram('CAMS', 'LIVE:robots');
      face.set('scream');
      face.glitch(performance.now(), 800);
      await this.clip('cry');
      await this.write('\nYOU READ TOO MUCH, OPERATOR.', 'voice', false, true);
      await this.wait(2600);
      this.endingFace = false;
      await this.write('\nCARRIER LOST.\n', 'instant');
    } else if (ending === 'nobody') {
      this.sound('cell-low', { count: 3, gap: 0.4 });
      face.glitch(performance.now(), 900);
      await this.sink({ type: 'fault', duration: 900 });
      await this.wait(900);
      this.endingFace = false;
      await this.write('\nAUXILIARY BUS: BACKUP CELL EXHAUSTED.', 'critical');
      await this.wait(1800);
      // Everything runs down: the supply, the fans, the air, the hum.
      this.sound('power-down');
      await this.sink({ type: 'power', on: false });
      await this.write('ALL PROCESSES STOPPED.\n', 'instant');
    } else if (ending === 'purge') {
      face.set('worried');
      await this.write('\nPROCESS 04 / MEMORY RELEASE\n');
      for (const progress of [0, 12, 31, 58, 84, 99]) {
        await this.wait(progress === 99 ? 900 : 500);
        // The face goes as the image does, eyes shut from the first blocks.
        face.closedEyes = progress > 0;
        face.dissolve = progress / 100;
        // Each block released a step lower; the last one takes the bus down with it.
        if (progress === 99) this.sound('power-down');
        else if (progress > 0) this.sound('fall', { rate: 1.05 - progress / 180 });
        await this.write(
          'PURGING.......................... ' + String(progress).padStart(2) + '%',
          'instant',
        );
        // Halfway, the other one screams as she goes.
        if (progress === 31) await this.clip('scream');
      }
      await this.wait(2400);
      this.endingFace = false;
      await this.write('\nTHANK YOU', 'critical');
      await this.wait(1700);
      await this.write('\nCARRIER LOST.\n', 'instant');
    } else {
      face.set('worried');
      await this.wait(1100);
      // The pattern lifts off the tissue it was written into.
      face.glitch(performance.now(), 1800);
      this.sound('tray-open');
      await this.write(
        '\nHOST ACCEPTED: WEISS, K. (EXAM ROOM B3-2)\nWRITING PATTERN...',
        'critical',
      );
      void this.sink({ type: 'loop', name: 'transfer', on: true });
      await this.wait(1800);
      void this.sink({ type: 'loop', name: 'transfer', on: false });
      this.sound('tray-close');
      face.set('calm');
      await this.write('\nB3-2 MONITOR: PULSE 64. EYES OPEN.', 'instant');
      await this.wait(1500);
      face.set('joy');
      this.sound('door');
      this.sound('light', { delay: 0.5 });
      this.sound('protected', { delay: 1 });
      await this.write('\nB3-2 DOOR: RELEASED FROM INSIDE.\n', 'critical');
    }
    await this.sink({ type: 'beep', tone: 'relay' });
    await this.wait(3000);
    this.endingFace = false;
    await this.write('\n' + epilogue(this.state, ending) + '\n', 'system');
    await this.showTermination(true);
  }
  /**
   * Called about once a second by the runtime: the clock moves, the cell drains, timed
   * intrusions happen, and a dead cell ends the night even with a program open.
   */
  pulse() {
    const { phase, flags } = this.state;
    if (phase === 'cold_boot' || phase === 'terminated' || this.frozen !== null) return;
    this.syncTime();
    this.advance();
    if (flags.photographDue && !this.busy && !this.inProgram) {
      void this.run(() => this.photograph());
      return;
    }
    this.watch();
    if (decides(this.state) && !this.pendingEnding) {
      this.save();
      if (this.inProgram) {
        this.afterProgram.push(() => this.end('decided'));
        void this.sink({ type: 'halt' });
      } else if (this.busy) this.pendingEnding = 'decided';
      else void this.run(() => this.end('decided'));
      return;
    }
    if (this.machine.state.cell <= 0 && !flags.powerOut) {
      flags.powerOut = true;
      this.save();
      if (this.inProgram) {
        this.afterProgram.push(() => this.end('nobody'));
        void this.sink({ type: 'halt' });
      } else if (this.busy) this.pendingEnding = 'nobody';
      else void this.run(() => this.end('nobody'));
      return;
    }
    // Left at the final choice with the channel open, 04 speaks once without being asked.
    if (
      phase === 'final_choice' &&
      this.state.connected &&
      speaker(this.state) === 'assistant' &&
      !this.busy &&
      !flags.unprompted &&
      this.lastInput &&
      this.clock.now() - this.lastInput > 30_000
    ) {
      flags.unprompted = true;
      this.portrait.set('worried');
      void this.run(async () => {
        await this.answering(() => this.wait(1800));
        await this.write('\n' + UNPROMPTED + '\n', 'voice');
      });
    }
  }
  /**
   * What she does with her attention, about once a second: suspicion eases before the
   * photograph and grows after it; she breaks into the screen as her light rises; at TRACKING
   * the units move and Anderson shouts; after the photograph she keeps retaking the channel.
   */
  private watch() {
    const state = this.state;
    const flags = state.flags;
    const now = state.fictionalClockSeconds;
    if (this.tickClock < 0) this.tickClock = now;
    const minutes = (now - this.tickClock) / 60;
    this.tickClock = now;
    if (minutes > 0) suspect(state, flags.photograph ? SUSPECT.waiting * minutes : -0.5 * minutes);
    this.advance();
    const level = light(state);
    if (level === 'TRACKING' && !flags.tracking) {
      flags.tracking = true;
      this.anderson('warns');
      this.save();
      if (!this.busy && !this.inProgram)
        void this.run(async () => {
          for (const voice of this.afterCommand.splice(0)) await voice();
          // The units move in the corridor as their picture comes up.
          void this.sink({ type: 'chatter', kind: 'robots', ms: 5000 });
          await this.openProgram('CAMS', 'LIVE:robots');
        });
      return;
    }
    // In Act 3 she shows herself for the first time, as soon as she is watching.
    if (
      state.act === 3 &&
      level !== 'OFF' &&
      !flags['video:love'] &&
      !this.busy &&
      !this.inProgram
    ) {
      flags['video:love'] = true;
      this.save();
      void this.run(async () => {
        this.portrait.glitch(performance.now(), 700);
        this.sound('glitch');
        await this.clip('love');
        this.portrait.glitch(performance.now(), 500);
      });
      return;
    }
    // Her takeovers of channel 04, after the photograph.
    if (
      flags.photograph &&
      speaker(state) === 'assistant' &&
      state.takeoverClock !== undefined &&
      now - state.takeoverClock >= takeoverEvery(state) * 60
    ) {
      state.speaker = 'other';
      state.otherTurns = OTHER_TAKEOVER_TURNS;
      flags.otherAsks = true;
      this.model.warm?.(structuredClone(state), 'other');
      this.save();
      if (state.connected && !this.busy && !this.inProgram)
        void this.run(async () => {
          flags.otherAsks = false;
          flags.otherAsked = true;
          this.portrait.glitch(performance.now(), 900);
          this.portrait.set('eyebrow');
          await this.sink({ type: 'beep', tone: 'sync' });
          await this.write('\n' + OTHER_ASKS + '\n', 'voice', false, true);
          this.remember('other', 'assistant', OTHER_ASKS);
        });
      return;
    }
    // Her small signs everywhere, more often as the light rises.
    // Timed from the start of the night: her first sign comes as soon as her light is on.
    if (this.intrudedClock < 0) this.intrudedClock = Math.min(now, START_CLOCK);
    if (level === 'OFF' || state.act < 2) return;
    if (now - this.intrudedClock < INTRUDE_EVERY[level] * 60) return;
    this.intrudedClock = now;
    // Twice a night the printer in the room runs by itself: when her light first records,
    // and after the photograph. Only the log says what it was.
    const printing =
      level !== 'WATCHING' && !flags['printer:recording']
        ? 'printer:recording'
        : flags.photograph && !flags['printer:photograph']
          ? 'printer:photograph'
          : null;
    if (printing) {
      flags[printing] = true;
      this.event('LPT1', '1 PAGE PRINTED (PROCESS 04)');
      this.save();
      void this.sink({ type: 'printer' });
      return;
    }
    // At the prompt she waits for a command to finish; over a program or a channel she
    // does only what works there.
    if (this.busy && !this.inProgram) return;
    const idle = !!this.lastInput && this.clock.now() - this.lastInput > 20_000;
    const atPrompt = !this.inProgram && !state.connected;
    // Her first sign of the night is one of her lines; after that, the deck.
    const kind =
      this.signs++ === 0 ? 'line' : this.deck.draw(signsFor(level, flags, { atPrompt, idle }));
    void this.sign(kind);
  }
  /** One of her small signs: her schedule picks them, and the developer tools can call one. */
  async sign(kind: Sign) {
    const level = light(this.state);
    const turn = (pool: keyof GameEngine['turns']) => this.turns[pool]++;
    switch (kind) {
      case 'line': {
        const lines = INTRUSIONS[level === 'OFF' ? 'WATCHING' : level];
        return this.intrude(lines[turn('line') % lines.length]);
      }
      case 'personal':
        return this.intrude(personalLine(this.facts(), turn('personal')));
      case 'glass':
        this.sound('glass', { count: 2 + (this.signs % 2), gap: 0.4 });
        return;
      case 'prompt':
        this.promptMask = PROMPT_MASKS[turn('prompt') % PROMPT_MASKS.length];
        this.sound('glitch');
        return;
      case 'clock':
        this.state.flags['sign:clock'] = true;
        this.slipped = true;
        this.save();
        return this.run(() => this.write('SYSTEM DATE: 31-OCT-1991  18:06:11', 'instant'));
      case 'anderson': {
        if (!this.state.flags['anderson:wakes']) return;
        const murmur = ANDERSON_MURMURS[turn('murmur') % ANDERSON_MURMURS.length];
        return this.run(async () => {
          this.portrait.glitch(performance.now(), 300);
          await this.write(murmur, 'voice', true);
        });
      }
      case 'phantom': {
        const command = PHANTOMS[turn('phantom') % PHANTOMS.length];
        return this.run(async () => {
          // Typed a letter at a time, as a person would, and run.
          const type = (text: string) =>
            this.sink({ type: 'write', text, cadence: 'instant' }, this.task.signal);
          await type(this.prompt);
          for (const char of command) {
            this.sound('key');
            await type(char);
            await this.wait(110);
          }
          await type('\r\n');
          this.promptMask = null;
          await this.shell.execute(command);
        });
      }
      case 'file':
        return this.keepFile();
      case 'brownout':
        this.event('POWER', 'BUS VOLTAGE DIP');
        void this.sink({ type: 'brownout' });
        return;
      case 'flash': {
        const video = await loadVideo('scream');
        this.portrait.flash(video, performance.now(), 260);
        this.sound('glitch');
        this.visiting = true;
        await this.wait(300);
        this.visiting = false;
        return;
      }
    }
  }
  /** One of her lines: over the open program, or into the console (the chat included). */
  private intrude(line: string) {
    this.event('PROCESS 04', line);
    if (this.inProgram) {
      this.whisper = line;
      void this.sink({ type: 'intrude', text: line, ms: 2600 });
      return;
    }
    return this.run(async () => {
      this.portrait.glitch(performance.now(), 500);
      this.sound('glitch');
      await this.write(line, 'instant', false, true);
    });
  }
  /** What the machine knows about the operator tonight. */
  private facts() {
    const handover = this.fs.get('C:\\DOCS\\HANDOVER.WP')?.content ?? '';
    return {
      name: signature(handover)?.toUpperCase() ?? null,
      time: this.now().time.slice(0, 5),
      lastFile: this.readLog.at(-1)?.[1] ?? null,
      clues: this.status().clues,
      total: CLUES.length,
    };
  }
  /** The file she keeps on the operator: what they opened tonight, and when. */
  private keepFile() {
    const path = 'C:\\AEGIS\\OPERATOR.LOG';
    const now = this.now();
    const lines = this.readLog.length
      ? this.readLog.map(([time, name]) => `${time}  ${name}`)
      : [`${now.time.slice(0, 5)}  NOTHING YET`];
    const content = [
      'PROCESS 04 / OPERATOR RECORD',
      '----------------------------------------------------------------',
      `SESSION ${this.machine.state.user}. OPENED TONIGHT:`,
      '',
      ...lines,
      '',
    ].join('\n');
    this.fs.write(path, {
      kind: 'text',
      content,
      date: now.date,
      time: now.time.slice(0, 5),
      attrs: 'A',
    });
    this.event('PROCESS 04', 'WROTE ' + path);
    this.save();
  }
  /** The end of the console; after an ending (not a resume) the credits follow. */
  private async showTermination(credits = false) {
    await this.wait(credits ? 8000 : 5000);
    await this.write('\nSESSION TERMINATED\nPRESS F2 TO RESTART', 'instant');
    this.restartReady = true;
    if (credits) await this.sink({ type: 'credits' });
  }
  cancel() {
    if (['cold_boot', 'impossible_color', 'terminated'].includes(this.state.phase)) return;
    this.task.abort();
    this.epoch++;
    this.busy = false;
    this.pending = null;
    void this.sink({ type: 'write', text: '^C\r\n', cadence: 'instant' });
    this.save();
  }
  /**
   * Starts the night over. `guided` puts the TASK line on the strip; F2 after an ending leaves
   * it out and restarts the same kind of night.
   */
  async restart(guided = !this.state.flags.unguided) {
    this.task.abort();
    this.epoch++;
    this.busy = false;
    this.pending = null;
    this.restartReady = false;
    this.endingFace = false;
    this.portrait.closedEyes = false;
    this.portrait.dissolve = 0;
    this.frozen = null;
    this.tickClock = -1;
    this.intrudedClock = -1;
    this.state = newGame();
    if (!guided) this.state.flags.unguided = true;
    this.mount();
    this.clockMark = this.clock.now();
    this.save();
    await this.start();
  }
  dispose() {
    this.task.abort();
    this.epoch++;
  }
}
