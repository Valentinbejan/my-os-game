import type { Archive, EndingKey } from '../../game/archive';
import type { ModelChoice, Settings } from '../../game/types';
import type { KeyEvent, Program } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import type { TerminalCell } from '../../terminal/TerminalBuffer';
import type { ManualSheet } from './manual';
import type { ClueEntry } from './clues';
/** The saved night, as the title and pause menus describe it. */
export interface ShiftSummary {
  /** No night saved, one under way, or one that has ended. */
  kind: 'none' | 'progress' | 'ended';
  time: string;
  cell: number;
  /** Where the night stands, in a few words. */
  status: string;
  ending?: EndingKey;
}
/** The voice of process 04 as the configuration page offers it. */
export interface ModelStatus {
  choice: ModelChoice;
  /** The choices this installation can run. */
  choices: ModelChoice[];
  /** What the model server is doing now. */
  state: 'checking' | 'loading' | 'ready' | 'off' | 'missing' | 'failed' | 'external';
  /** The model actually running, when known. */
  running?: string;
}
/** What the menu may ask of the rest of the game. */
export interface MenuHost {
  readonly settings: Settings;
  /** Settings changed: apply and save them. */
  changed(): void;
  summary(): ShiftSummary;
  /** Back to the night under way (or the saved one). */
  resume(): void;
  /** Starts the night over from the boot; `guided` puts the TASK line on the strip. */
  newNight(guided: boolean): void;
  /** Whether the night in progress shows the TASK line (null with no night). */
  guidance(): boolean | null;
  /** Turns the TASK line on or off for the night in progress. */
  setGuidance(on: boolean): void;
  /** Leaves the night paused and shows the title. */
  exitToTitle(): void;
  /** Closes the menu and returns to the terminal. */
  close(): void;
  powerOff(): void;
  fullscreen(): void;
  /** A menu sound; `rate` above 1 plays it higher (a slider turned up). */
  sound(kind: MenuSound, rate?: number): void;
  /** The terminal page under the pause menu. */
  underlying(): readonly TerminalCell[];
  model(): ModelStatus;
  selectModel(choice: ModelChoice): void;
  /** The operator manual's sheets, from the commands the shell has now. */
  manual(): ManualSheet[];
  archive(): Archive;
  eraseArchive(): void;
  /** The clues found this night, and how many there are. */
  clues(): { entries: ClueEntry[]; total: number };
}
/** The menus' sounds (each is a cue of the same name). */
export type MenuSound =
  | 'move'
  | 'ok'
  | 'yes'
  | 'error'
  | 'back'
  | 'open'
  | 'close'
  | 'ask'
  | 'toggle'
  | 'section'
  | 'scroll';
/** One screen of the menu. */
export interface Page {
  /** What it sounds like when the page comes up over another (a question). */
  readonly opens?: MenuSound;
  /** Changes whenever the page looks different. */
  frame(now: number): string;
  render(screen: Screen, now: number): void;
  key(event: KeyEvent): void;
}
/**
 * The menus that sit around the night: title, configuration, pause, manual, archive and
 * credits, drawn on the terminal like everything else. Pages stack; Esc goes back one.
 */
export class MenuProgram implements Program {
  private stack: Page[] = [];
  constructor(
    readonly host: MenuHost,
    readonly clock: () => number = () => performance.now(),
  ) {}
  get page(): Page | undefined {
    return this.stack.at(-1);
  }
  get depth() {
    return this.stack.length;
  }
  /** Shows a page on its own, forgetting the pages before it. */
  open(page: Page) {
    this.stack = [page];
  }
  push(page: Page) {
    this.stack.push(page);
    if (page.opens) this.host.sound(page.opens);
  }
  /** Back one page; from the first page the menu closes. */
  back(sound: MenuSound | null = 'back') {
    if (sound) this.host.sound(sound);
    if (this.stack.length > 1) this.stack.pop();
    else this.host.close();
  }
  frame() {
    return this.stack.length + ':' + (this.page?.frame(this.clock()) ?? '');
  }
  render(screen: Screen) {
    screen.clear();
    this.page?.render(screen, this.clock());
  }
  key(event: KeyEvent) {
    this.page?.key(event);
    return true;
  }
}
