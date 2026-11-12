import { Screen } from '../screen/Screen';
import type { FileEntry, FileKind } from '../os/fs/FileSystem';
import type { Clock } from '../os/shell/Shell';
import type { DialResult } from './comlink/host';
import type { Portrait } from '../screen/face';
import type { Cue } from '../audio/AudioEngine';
/** Full-screen programs installed on the workstation. */
export type ProgramName = 'EDIT' | 'WPRO' | 'CALC' | 'COMLINK' | 'CAMS';
export const programs: readonly ProgramName[] = ['EDIT', 'WPRO', 'CALC', 'COMLINK', 'CAMS'];
export type ReadResult = { path: string; entry: FileEntry } | 'missing' | 'denied' | 'damaged';
export type LineSound = 'dialtone' | 'dtmf' | 'ringback' | 'busy' | 'handshake' | 'ring' | 'click';
/** The workstation's communication ports as COMLINK uses them. */
export interface CommSystem {
  /** Places a call on COM1; says who answers. */
  dial(number: string): DialResult;
  /**
   * Opens COM4, the limbic bus: process 04's greeting (from the other one, if she holds the
   * channel), or why the port will not open.
   */
  openBus(): { error: string } | { greeting: string; other?: boolean };
  /**
   * One line to process 04; resolves with the reply, whether the other one gave it, and what
   * the assistant says after it when the other lets go of the channel.
   */
  talk(
    text: string,
    signal: AbortSignal,
  ): Promise<{ reply: string; other?: boolean; then?: string; hangup?: boolean }>;
  /** A call is coming in from X204, the phone in observation room W-2. */
  ringing(): boolean;
  /** Answers X204: the line connects to process 04; returns its first words. */
  pickUp(): string;
  /** What 04 says unprompted when left waiting at the final choice (once), or null. */
  nudge(): string | null;
  /** The picture tears and the sync buzz sounds: the other one takes the line. */
  distort(): void;
  /** Process 04's face, shown above the line while it is on COM4. */
  portrait: Portrait;
  /**
   * Joins COM4 to the call up on COM1: process 04 gets the line. Null when it is done (the
   * program is then closed); otherwise why it will not bridge.
   */
  bridge?(number: string): string | null;
  closeBus(): void;
}
/** A picture a camera took during the night. */
export interface Capture {
  picture: string;
  camera: string;
  place: string;
  /** YYYY-MM-DD HH:MM:SS, as the camera stamps it. */
  stamp: string;
}
/** What a full-screen program may do on the machine while it runs. */
export interface ProgramSystem {
  /** The shell's current directory when the program started. */
  cwd: string;
  resolve(path: string): string | null;
  /**
   * Reads a file. A bad sector on Storage C fails the first read ('damaged') and reads
   * correctly after that, as it does for TYPE.
   */
  read(path: string): ReadResult;
  write(path: string, content: string, kind: FileKind): 'ok' | 'denied' | 'invalid';
  /** File names in a directory matching a DOS wildcard. */
  list(directory: string, pattern: string): string[];
  /** Subdirectory names in a directory. */
  folders(directory: string): string[];
  /** A directory entry's size, date and time, without opening the file. */
  stat(path: string): { size: number; date: string; time: string; dir: boolean } | null;
  now(): Clock;
  /** Drive seek and speaker sounds. */
  disk(): void;
  beep(): void;
  /** Something story-relevant the player saw inside a program (a revealed row). */
  note(event: string): void;
  /** Phone-line and modem sounds (the digits for DTMF dialing). */
  sound(effect: LineSound, digits?: string): void;
  /** A sound effect: a menu opening, a saved file, the tape deck's buttons. */
  cue(name: Cue): void;
  /** A looping sound (a file transfer's chatter) starts or stops. */
  loop(name: Cue, on: boolean): void;
  /** The phone line and the limbic bus, for COMLINK. */
  comm: CommSystem;
  /** Pictures the cameras took tonight, for CAMS: which picture, and the stamp. */
  captures?(): Capture[];
  /** A line the other one pushes into the open program (a document, a sheet), once. */
  whisper?(): string | null;
  /** Ends the program; the shell's prompt returns. */
  exit(): void;
}
/** A key press as programs see it, independent of the browser event. */
export interface KeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
export const keyEvent = (event: KeyboardEvent): KeyEvent => ({
  key: event.key,
  ctrl: event.ctrlKey,
  alt: event.altKey,
  shift: event.shiftKey,
});
/** A full-screen occupant of the terminal: the shell or an application. */
export interface Program {
  /** Changes whenever the picture changes; the host repaints only then. */
  frame(): string;
  /** Paints the whole page; the host does not clear it between programs. */
  render(screen: Screen): void;
  /** Returns true when the program used the key. */
  key(event: KeyEvent): boolean;
  paste?(text: string): boolean;
}
/** Runs programs one above another: the shell at the bottom, applications launched over it. */
export class ProgramHost {
  readonly screen = new Screen();
  private stack: Program[] = [];
  private painted = '';
  /** Runs over every freshly painted page before it is shown (the red clue pass). */
  decorate: ((screen: Screen) => void) | null = null;
  /** The other one's line, flickering in reverse video over whatever page is up. */
  overlay: { text: string; until: number } | null = null;
  get active(): Program | undefined {
    return this.stack.at(-1);
  }
  push(program: Program) {
    this.stack.push(program);
  }
  /** Closes a program and returns to the one beneath it. */
  exit(program: Program) {
    this.stack = this.stack.filter((running) => running !== program);
  }
  /** Repaints the active program if its picture changed; returns the page's content key. */
  frame(now = performance.now()): string {
    const program = this.active;
    if (!program) return '';
    if (this.overlay && now >= this.overlay.until) this.overlay = null;
    // It flickers: on for two beats in three.
    const flicker = this.overlay ? (Math.floor(now / 160) % 3 ? ':o1' : ':o0') : '';
    const key = this.stack.length + ':' + program.frame() + flicker;
    if (key !== this.painted) {
      this.painted = key;
      this.screen.picture = null;
      this.screen.fine = null;
      program.render(this.screen);
      this.decorate?.(this.screen);
      if (this.overlay && flicker === ':o1') {
        const text = this.overlay.text.slice(0, 70);
        const width = text.length + 6;
        const x = Math.floor((80 - width) / 2);
        this.screen.uncover(x, 11, width, 3);
        for (const [y, line] of [
          [11, ''],
          [12, text],
          [13, ''],
        ] as const)
          this.screen.put(x, y, ('   ' + line).padEnd(width), { inverse: true });
      }
    }
    return key;
  }
  key(event: KeyEvent) {
    return this.active?.key(event) ?? false;
  }
  paste(text: string) {
    return this.active?.paste?.(text) ?? false;
  }
}
