import type { Changes, DeletedEntry } from '../os/fs/FileSystem';
import { newShellState, type ShellState } from '../os/shell/Shell';
import { newMachine, type MachineState } from '../os/system/Machine';
import { deletedAtStart } from '../story/disk/image';
import type { LineSound, ProgramName, ProgramSystem } from '../programs/Program';
import type { Chatter, Cue } from '../audio/AudioEngine';
export type StoryPhase =
  | 'cold_boot'
  | 'operator_shell'
  | 'diagnostic_contact'
  | 'conversation'
  | 'impossible_color'
  | 'final_choice'
  | 'terminated';
/** Messages of conversation kept (and saved); the prompt sends as many as fit its budget. */
export const HISTORY_LIMIT = 60;
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
/** Who answers on channel 04: the site assistant, or the other one in the same process. */
export type Persona = 'assistant' | 'other';
/** The workstation's own state: files the player changed, the shell's directory and variables. */
export interface OsState {
  shell: ShellState;
  changes: Changes;
  deleted: DeletedEntry[];
  machine: MachineState;
}
export interface GameState {
  schemaVersion: 2;
  phase: StoryPhase;
  operatorName?: string;
  flags: Record<string, boolean>;
  os: OsState;
  /** How far the night has come: 1 arrival, 2 cracks, 3 the truth, 4 the photograph, 5 decide. */
  act: 1 | 2 | 3 | 4 | 5;
  /** Clues in the order they were found, for the CLUES list. */
  clueOrder?: string[];
  meaningfulDialogueTurns: number;
  seenDialogue: string[];
  /** Each voice's own conversation. Neither one sees the other's. */
  chats: Record<Persona, Message[]>;
  /** Who holds channel 04 now (the assistant unless the other has taken it). */
  speaker?: Persona;
  /** Lines left before the other lets the assistant back onto the channel. */
  otherTurns?: number;
  fictionalClockSeconds: number;
  ending?: 'purge' | 'restore' | 'release' | 'nobody' | 'decided';
  /** The other one's suspicion of the operator, 0 to 100 (the camera light). */
  suspicion?: number;
  /** Clock seconds when the other last let go of the channel. */
  takeoverClock?: number;
  /** Clock seconds at the first channel contact, for intrusions timed from it. */
  contactClock?: number;
  /** Clock seconds when CAM 18 photographed the operator. */
  photographClock?: number;
  connected: boolean;
}
/** How fast text types out on the terminal. */
export type TextSpeed = 'normal' | 'fast' | 'instant';
export const TEXT_SPEEDS: readonly TextSpeed[] = ['normal', 'fast', 'instant'];
/** Which language model voices process 04; 'auto' follows the launcher, 'off' uses no model. */
export type ModelChoice = 'auto' | 'minicpm2' | 'small' | 'horizon' | 'bonsai' | 'off';
export const MODEL_CHOICES: readonly ModelChoice[] = [
  'auto',
  'minicpm2',
  'small',
  'horizon',
  'bonsai',
  'off',
];
export interface Settings {
  reducedFlicker: boolean;
  bloom: number;
  highContrast: boolean;
  volume: number;
  hum: number;
  keyboard: number;
  effects: number;
  warningSeen: boolean;
  bootCompleted: boolean;
  textSpeed: TextSpeed;
  model: ModelChoice;
  /** The player's last choice before a new night: whether the strip says what to do next. */
  guided: boolean;
}
export const defaultSettings: Settings = {
  reducedFlicker: false,
  bloom: 0.35,
  highContrast: false,
  volume: 0.5,
  hum: 0.35,
  keyboard: 0.6,
  effects: 0.5,
  warningSeen: false,
  bootCompleted: false,
  textSpeed: 'normal',
  model: 'auto',
  guided: true,
};
export const newGame = (): GameState => ({
  schemaVersion: 2,
  phase: 'cold_boot',
  flags: {},
  act: 1,
  os: { shell: newShellState(), changes: {}, deleted: deletedAtStart(), machine: newMachine() },
  meaningfulDialogueTurns: 0,
  seenDialogue: [],
  chats: { assistant: [], other: [] },
  fictionalClockSeconds: 2 * 3600 + 14 * 60 + 9,
  connected: false,
});
export type TerminalEvent =
  | {
      type: 'write';
      text: string;
      cadence?: 'instant' | 'system' | 'voice' | 'critical';
      dim?: boolean;
      /** The other one's voice: reverse video. */
      other?: boolean;
    }
  | { type: 'clear' }
  | { type: 'beep'; tone: 'ok' | 'error' | 'relay' | 'disk' | 'sync' }
  /** Phone-line sounds while COMLINK dials and connects. */
  | { type: 'line'; sound: LineSound; digits?: string }
  /** A sound effect `delay` s from now; `count` plays it that many times, `gap` s apart. */
  | {
      type: 'cue';
      name: Cue;
      delay?: number;
      rate?: number;
      level?: number;
      count?: number;
      gap?: number;
    }
  /** A looping sound starts or stops. */
  | { type: 'loop'; name: Cue; on: boolean }
  /** Random ticks for a while: the bus's relays, the units in the corridor. */
  | { type: 'chatter'; kind: Chatter; ms: number }
  /** The workstation's power: the hum, the fans and the room come and go with it. */
  | { type: 'power'; on: boolean }
  /** The printer in the room runs by itself: one page. */
  | { type: 'printer' }
  /** The supply dips: the tube warms up again and the hum sags. */
  | { type: 'brownout' }
  /** The night is over: the screen goes dark and the credits roll. */
  | { type: 'credits' }
  | { type: 'fault'; duration: number }
  /** Runs a full-screen program; resolves when the player leaves it. */
  | {
      type: 'program';
      name: ProgramName;
      path: string | null;
      system: Omit<ProgramSystem, 'exit'>;
    }
  | { type: 'config' }
  /** A voice line from one of the clips. */
  | { type: 'voice'; name: string }
  /** The other one's line over whatever program is on the screen. */
  | { type: 'intrude'; text: string; ms: number }
  /** The bus died: close whatever program is open and return to the shell. */
  | { type: 'halt' };
export interface Clock {
  now(): number;
  wait(ms: number, signal?: AbortSignal): Promise<void>;
}
export const realClock: Clock = {
  now: () => Date.now(),
  wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', abort, { once: true });
    });
  },
};
