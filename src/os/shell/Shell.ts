import type { FileEntry, FileSystem } from '../fs/FileSystem';
import { baseName, parent, resolvePath } from '../fs/paths';
import { parseLine, type CommandLine, type Filter } from './parse';
import type { Cue } from '../../audio/cues';
export interface Clock {
  /** MM-DD-YY, HH:MM:SS and a three-letter weekday, from the machine's clock. */
  date: string;
  time: string;
  weekday: string;
}
/** What the shell needs from the machine around it. */
export interface ShellIO {
  print(text: string): Promise<void>;
  clear(): Promise<void>;
  /** Waits for one key: an upper-case letter, a digit, or a key name such as Enter. */
  readKey(): Promise<string>;
  /** Waits for a typed line; a secret one (a password) is not shown. */
  readLine(secret?: boolean): Promise<string>;
  /** A disk access: the drive seeks and the machine pauses briefly. */
  disk(): Promise<void>;
  now(): Clock;
  /** Starts a full-screen program; false when it is not installed. */
  launch(program: string, args: string[]): Promise<boolean>;
  /** The player looked at a file (the story uses this to record evidence). */
  observe(path: string): void;
  /** The session holds supervisor authority (restricted files open). */
  privileged(): boolean;
  /** Sets the machine clock from DATE or TIME input; false when the input is not valid. */
  setClock(what: 'date' | 'time', value: string): boolean;
  /** A sound effect. */
  cue?(name: Cue): void;
  /** The bus's relays chatter for a while (a diagnostic, a disk check). */
  relays?(ms: number): void;
}
/** The shell's own messages that make a sound as they print. */
const SOUNDS: [RegExp, Cue][] = [
  [/^Access denied/, 'denied'],
  [
    /^(Bad command|File not found|Path not found|Invalid |Duplicate file name|Required parameter)/,
    'bad',
  ],
  [/^\s*[1-9]\d* file\(s\) copied$/, 'saved'],
  [/^File successfully undeleted/, 'saved'],
];
export type Group = 'Files' | 'System' | 'AEGIS';
export interface Command {
  group: Group;
  /** One line for HELP. */
  help: string;
  /** Syntax shown by COMMAND /?. */
  usage?: string;
  run(shell: Shell, line: CommandLine): Promise<void>;
  /** Hidden from HELP (aliases, and story commands that are not available yet). */
  hidden?: (shell: Shell) => boolean;
}
export interface ShellState {
  cwd: string;
  env: Record<string, string>;
}
export const VERSION = 'AEGIS RCS/7 DOS Version 5.00';
/** What an unreadable sector returns when the error is ignored. */
const zeros = () => Array.from({ length: 4 }, () => '0'.repeat(64)).join('\n') + '\n';
export const newShellState = (): ShellState => ({
  cwd: 'C:\\',
  env: { COMSPEC: 'C:\\COMMAND.COM', PROMPT: '$P$G', PATH: 'C:\\AEGIS' },
});
/** A command interpreter in the manner of COMMAND.COM. */
export class Shell {
  readonly commands = new Map<string, Command>();
  echo = true;
  history: string[] = [];
  /** Extra lines the machine adds to HELP (keys, channel state). */
  helpFooter: () => string[] = () => [];
  private capture: ((text: string) => void) | null = null;
  constructor(
    public fs: FileSystem,
    public io: ShellIO,
    public state: ShellState,
  ) {}
  get cwd() {
    return this.state.cwd;
  }
  set cwd(path: string) {
    this.state.cwd = path;
  }
  register(names: string[], command: Command) {
    for (const name of names) this.commands.set(name, command);
  }
  /** Output goes to the screen, or into a file or filter while redirected. */
  async print(text: string) {
    if (this.capture) this.capture(text);
    else await this.io.print(text);
  }
  line(text = '') {
    if (!this.capture) {
      const sound = SOUNDS.find(([pattern]) => pattern.test(text.replace(/^\n+/, '')));
      if (sound) this.io.cue?.(sound[1]);
    }
    return this.print(text + '\n');
  }
  resolve(path: string, wildcards = false) {
    return resolvePath(this.cwd, path, wildcards);
  }
  /** True when the session may read this file. */
  allowed(entry: FileEntry) {
    return !entry.restricted || this.io.privileged();
  }
  /**
   * Reads a file the way programs do, telling the story what was seen. Storage C's bad
   * sectors fail the first read; Retry reads them, Ignore returns zeros. Returns null when
   * the player aborts.
   */
  async open(path: string): Promise<FileEntry | null> {
    const entry = this.fs.get(path);
    if (!entry || entry.kind === 'dir') return null;
    if (entry.damaged) {
      for (;;) {
        await this.print('\nData error reading drive C\nAbort, Retry, Ignore, Fail?');
        const key = await this.io.readKey();
        await this.line(key.length === 1 ? key : '');
        if (key === 'R') break;
        if (key === 'I') return { ...entry, kind: 'text', content: zeros() };
        if (key === 'A' || key === 'F') return null;
      }
      this.fs.write(path, { ...entry, damaged: false });
      await this.io.disk();
    }
    this.io.observe(path);
    return this.fs.get(path)!;
  }
  prompt() {
    const now = this.io.now();
    const codes: Record<string, string> = {
      P: this.cwd,
      G: '>',
      L: '<',
      B: '|',
      Q: '=',
      N: this.cwd[0],
      D: now.weekday + ' ' + now.date,
      T: now.time,
      V: VERSION,
      $: '$',
    };
    return (this.state.env.PROMPT || '$N$G').replace(
      /\$(.)/g,
      (_, code: string) => codes[code.toUpperCase()] ?? '',
    );
  }
  /** Finds a program for a name the way COMMAND.COM does: here first, then along PATH. */
  locate(name: string): string | null {
    const explicit = /[\\:]/.test(name);
    const places = explicit
      ? [this.cwd]
      : [this.cwd, ...(this.state.env.PATH ?? '').split(';').filter(Boolean)];
    const extensions = /\.(COM|EXE|BAT)$/.test(name) ? [''] : ['.COM', '.EXE', '.BAT'];
    for (const place of places)
      for (const extension of extensions) {
        const path = resolvePath(place, name + extension);
        const kind = path ? this.fs.get(path)?.kind : undefined;
        if (path && (kind === 'exe' || kind === 'batch')) return path;
      }
    return null;
  }
  /** Runs one command line. Returns false when no command or program has that name. */
  async execute(text: string): Promise<boolean> {
    const line = parseLine(text);
    if (!line) return true;
    const command = this.commands.get(line.name);
    let run: (() => Promise<void>) | undefined;
    if (command)
      run = line.switches.includes('?')
        ? () => this.usage(line.name, command)
        : () => command.run(this, line);
    else {
      const path = this.locate(line.name);
      if (path) run = () => this.start(path, line.args);
    }
    if (!run) return false;
    await this.redirected(line, run);
    return true;
  }
  private async usage(name: string, command: Command) {
    await this.line(command.help);
    await this.line();
    await this.line(command.usage ?? name);
  }
  private async start(path: string, args: string[]) {
    if (this.fs.get(path)?.kind === 'batch') return this.batch(path, args);
    await this.io.disk();
    if (!(await this.io.launch(baseName(path).replace(/\.\w+$/, ''), args)))
      await this.line('Program too big to fit in memory');
  }
  /** Runs a command with its output sent through filters and into a file when asked. */
  private async redirected(line: CommandLine, run: () => Promise<void>) {
    if (!line.output && !line.filters.length) return run();
    let captured = '';
    const outer = this.capture;
    this.capture = (text) => (captured += text);
    try {
      await run();
    } finally {
      this.capture = outer;
    }
    for (const filter of line.filters) {
      const known = filters[filter.name];
      if (!known) {
        await this.line('Bad command or file name');
        return;
      }
      captured = await known(this, filter, captured, !line.output);
    }
    if (line.output) await this.save(line.output.path, captured, line.output.append);
    else await this.print(captured);
  }
  /** Writes redirected output to a file (or to NUL / CON). */
  private async save(target: string, text: string, append: boolean) {
    const name = target.toUpperCase();
    if (name === 'NUL') return;
    if (name === 'CON') return this.print(text);
    const path = this.resolve(target);
    if (!path || !this.fs.isDirectory(parent(path)) || this.fs.isDirectory(path))
      return this.line('File creation error');
    const existing = this.fs.get(path);
    if (existing?.attrs.includes('R')) return this.line('Access denied');
    const now = this.io.now();
    this.fs.write(path, {
      kind: 'text',
      content: append && existing ? existing.content + text : text,
      date: now.date,
      time: now.time.slice(0, 5),
      attrs: 'A',
    });
    await this.io.disk();
  }
  /** Runs a batch file: one command per line, %1-%9 and %NAME% expanded. */
  async batch(path: string, args: string[] = []) {
    const content = this.fs.get(path)?.content ?? '';
    for (const text of content.split(/\r?\n/)) {
      let line = text
        .replace(/%(\d)/g, (_, n: string) => (n === '0' ? baseName(path) : (args[+n - 1] ?? '')))
        .replace(/%([A-Z_]+)%/gi, (_, name: string) => this.state.env[name.toUpperCase()] ?? '');
      if (!line.trim() || line.trim().startsWith(':')) continue;
      const quiet = line.startsWith('@');
      if (quiet) line = line.slice(1);
      if (this.echo && !quiet) await this.line(this.prompt() + line);
      if (/^\s*REM\b/i.test(line)) continue;
      if (!(await this.execute(line))) await this.line('Bad command or file name');
    }
    this.echo = true;
  }
}
type FilterRun = (shell: Shell, filter: Filter, text: string, screen: boolean) => Promise<string>;
/** Programs that read text and write text, for `|` pipes and `<` input. */
export const filters: Record<string, FilterRun> = {
  async MORE(shell, _filter, text, screen) {
    if (!screen) return text;
    const lines = text.replace(/\n$/, '').split('\n');
    for (let n = 0; n < lines.length; n++) {
      await shell.line(lines[n]);
      if ((n + 1) % 23 === 0 && n + 1 < lines.length) {
        await shell.print('-- More --');
        await shell.io.readKey();
        await shell.line();
      }
    }
    return '';
  },
  async FIND(shell, filter, text) {
    const needle = filter.args[0];
    if (needle === undefined) {
      await shell.line('FIND: Required parameter missing');
      return '';
    }
    return findLines(text, needle, filter.switches).join('');
  },
};
/** FIND's line selection: /V inverts, /C counts, /N numbers, /I ignores case. */
export function findLines(text: string, needle: string, switches: string[]) {
  const fold = (value: string) => (switches.includes('I') ? value.toUpperCase() : value);
  const lines = text.replace(/\n$/, '').split('\n');
  const hits = lines
    .map((line, n) => ({ line, n }))
    .filter(({ line }) => fold(line).includes(fold(needle)) !== switches.includes('V'));
  if (switches.includes('C')) return [hits.length + '\n'];
  return hits.map(({ line, n }) => (switches.includes('N') ? `[${n + 1}]` : '') + line + '\n');
}
