import type { GameEngine } from '../game/GameEngine';
import type { Screen } from '../screen/Screen';
import type { TerminalBuffer } from '../terminal/TerminalBuffer';
import type { TerminalInput } from '../terminal/TerminalInput';
import type { KeyEvent, Program } from './Program';
import { SPINNER, spinnerPhase } from '../screen/widgets';
import { withFace } from '../screen/face';
export interface ShellContext {
  buffer: TerminalBuffer;
  input: TerminalInput;
  engine: () => GameEngine;
  /** A key went down (Enter lands heavier). */
  typed(kind?: 'enter'): void;
  /** Updates the accessible transcript after the console changes. */
  refresh(): void;
  /** F2 after an ending: a new night, opening first (the game restarts itself without it). */
  newNight?(): void;
}
const editing = [
  'Backspace',
  'Delete',
  'Home',
  'End',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
];
const spinnerFrame = (engine: GameEngine) => (engine.typing ? spinnerPhase(performance.now()) : -1);
/** Process 04's face while the channel is open; it closes its eyes while it composes. */
const faceFrame = (engine: GameEngine) =>
  engine.faceVisible ? engine.portrait.frame(performance.now(), engine.typing) : '';
/** The foot of the screen while channel 04 is open. */
export const CHAT_BAR =
  ' CHANNEL 04   TYPE TO TALK   ESC OR EXIT CLOSES THE CHANNEL   /HELP COMMANDS';
/** The command console: the scrolling page, the prompt and the line being typed. */
export class ShellProgram implements Program {
  constructor(private context: ShellContext) {}
  private get line() {
    const { engine, input } = this.context;
    const enabled = engine().canInput;
    const typed = engine().secretInput ? '*'.repeat(input.value.length) : input.value;
    return { enabled, prompt: enabled ? engine().prompt : '', text: enabled ? typed : '' };
  }
  frame() {
    const { buffer, input, engine } = this.context;
    const { enabled, prompt, text } = this.line;
    if (enabled) buffer.reserveInput(prompt.length + text.length);
    const cursor = engine().state.phase !== 'impossible_color';
    return [
      buffer.revision,
      prompt,
      text,
      input.cursor,
      enabled,
      cursor,
      spinnerFrame(engine()),
      faceFrame(engine()),
    ].join('|');
  }
  render(screen: Screen) {
    this.console(screen);
    const game = this.context.engine();
    // The face takes the top of the screen; the conversation carries on underneath, and in
    // an open channel a bar at the foot says how to leave it.
    if (!game.faceVisible) return;
    const chatting = game.state.connected;
    withFace(screen, game.portrait, performance.now(), game.typing, {
      from: 0,
      to: chatting ? 24 : 25,
    });
    if (chatting) screen.put(0, 24, CHAT_BAR.padEnd(80), { inverse: true });
  }
  /** The scrolling console page with the line being typed. */
  private console(screen: Screen) {
    const { buffer, input, engine } = this.context;
    const { enabled, prompt, text } = this.line;
    screen.copy(buffer.cells);
    const spinning = spinnerFrame(engine());
    if (spinning >= 0) {
      // Process 04 is about to answer: a turning bar where its reply will start.
      screen.put(buffer.x, buffer.y, SPINNER[spinning], { intensity: 2 });
      screen.cursor = null;
      return;
    }
    let x = buffer.x,
      y = buffer.y;
    if (enabled) {
      const line = prompt + text;
      for (let n = 0; n < line.length; n++) {
        const position = buffer.x + n;
        screen.put(position % 80, buffer.y + Math.floor(position / 80), line[n]);
      }
      const position = buffer.x + prompt.length + input.cursor;
      x = position % 80;
      y = buffer.y + Math.floor(position / 80);
    }
    screen.cursor = engine().state.phase === 'impossible_color' ? null : { x, y, shape: 'block' };
  }
  key(event: KeyEvent) {
    const { input, engine, refresh, typed, buffer } = this.context;
    const game = engine();
    // Ctrl+Alt+Del belongs to Windows; Ctrl+Alt+Home restarts the workstation instead.
    if (event.ctrl && event.alt && event.key === 'Home' && game.canInput) {
      void game.submit('REBOOT').then(refresh);
      return true;
    }
    if (event.alt) return false;
    // A command waiting for one key (-- More --, PAUSE, Abort, Retry, Fail?) takes the next one.
    if (game.waitingForKey && !(event.ctrl && event.key.toLowerCase() === 'c')) {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return false;
      game.key(event.key);
      return true;
    }
    // Ctrl+Z (or F6) types the end-of-file mark that finishes COPY CON.
    if (game.canInput && (event.key === 'F6' || (event.ctrl && event.key.toLowerCase() === 'z'))) {
      input.insert('^Z');
      typed();
      refresh();
      return true;
    }
    if (event.key === 'F2' && game.restartReady) {
      input.reset();
      if (this.context.newNight) this.context.newNight();
      else void game.restart().then(refresh);
      return true;
    }
    if (event.ctrl) {
      const letter = event.key.toLowerCase();
      if (letter === 'c') {
        game.cancel();
        input.reset();
        refresh();
      }
      if (letter === 'l') {
        buffer.clear();
        refresh();
      }
      return letter === 'c' || letter === 'l';
    }
    if (!game.canInput) return event.key !== 'Tab';
    if (event.key === 'Enter') {
      typed('enter');
      const text = input.submit();
      void game.submit(text).then(refresh);
      refresh();
      return true;
    }
    if (editing.includes(event.key)) {
      input.key(event.key);
      typed();
      refresh();
      return true;
    }
    if (event.key.length === 1) {
      input.insert(event.key, 512);
      typed();
      refresh();
      return true;
    }
    return event.key === 'Tab';
  }
  paste(text: string) {
    const game = this.context.engine();
    if (!game.canInput) return false;
    this.context.input.insert(text, 512);
    this.context.refresh();
    return true;
  }
}
