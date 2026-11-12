import type { KeyEvent } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import { label } from '../../screen/widgets';
import type { MenuHost } from './MenuProgram';
export interface Choice {
  label: string;
  /** Letter that chooses it at once; drawn bright. */
  hotkey?: string;
  disabled?: boolean;
  run(): void;
}
/** A column of choices: arrows move, Enter or a hotkey chooses, disabled rows are skipped. */
export class Choices {
  index = 0;
  constructor(
    private list: () => Choice[],
    private sound: MenuHost['sound'],
  ) {}
  get items() {
    const items = this.list();
    // The list can shrink under the highlight (RESUME goes when a night ends).
    this.index = Math.max(0, Math.min(this.index, items.length - 1));
    return items;
  }
  get current(): Choice | undefined {
    return this.items[Math.min(this.index, this.items.length - 1)];
  }
  /** Moves the highlight to the choice with this label, if there is one. */
  select(text: string) {
    const index = this.items.findIndex((choice) => choice.label === text);
    if (index >= 0) this.index = index;
  }
  private step(direction: 1 | -1) {
    const items = this.items;
    for (let n = 1; n <= items.length; n++) {
      const next = (this.index + direction * n + items.length) % items.length;
      if (!items[next].disabled) {
        this.index = next;
        return;
      }
    }
  }
  private choose(choice: Choice) {
    if (choice.disabled) return this.sound('error');
    this.sound('ok');
    choice.run();
  }
  /** Returns true when the key moved the highlight or chose something. */
  key(event: KeyEvent) {
    const items = this.items;
    if (!items.length) return false;
    this.index = Math.min(this.index, items.length - 1);
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Tab') {
      this.step(key === 'ArrowUp' || (key === 'Tab' && event.shift) ? -1 : 1);
      this.sound('move');
      return true;
    }
    if (key === 'Home' || key === 'End') {
      this.index = key === 'Home' ? items.length - 1 : 0;
      this.step(key === 'Home' ? 1 : -1);
      this.sound('move');
      return true;
    }
    if (key === 'Enter' || key === ' ') {
      this.choose(items[this.index]);
      return true;
    }
    if (key.length === 1 && !event.ctrl && !event.alt) {
      const index = items.findIndex((c) => c.hotkey?.toUpperCase() === key.toUpperCase());
      if (index < 0) return false;
      this.index = index;
      this.choose(items[index]);
      return true;
    }
    return false;
  }
}
/** Draws one choice: the highlighted one in reverse video, with a pointer before it. */
export function drawChoice(
  screen: Screen,
  x: number,
  y: number,
  width: number,
  choice: Choice,
  selected: boolean,
) {
  if (selected) screen.put(x - 2, y, '►', { intensity: 2 });
  screen.put(x, y, (' ' + choice.label).padEnd(width), {
    inverse: selected,
    intensity: choice.disabled ? 0 : 1,
  });
  if (!choice.disabled) label(screen, x + 1, y, choice.label, choice.hotkey, selected);
}
/** A setting's level as a row of segments, like a panel meter, and a percentage. */
export const bar = (value: number, width = 16) => {
  const full = Math.round(Math.max(0, Math.min(1, value)) * width);
  return (
    '■'.repeat(full) + '·'.repeat(width - full) + String(Math.round(value * 100)).padStart(5) + ' %'
  );
};
/** A centred double-lined window, cleared inside; returns where its text starts. */
export function window(screen: Screen, title: string, width: number, height: number, y?: number) {
  const x = Math.floor((80 - width) / 2);
  const top = y ?? Math.max(1, Math.floor((25 - height) / 2));
  screen.box(x, top, width, height, 'double');
  screen.put(x + Math.floor((width - title.length - 2) / 2), top, ` ${title} `, { intensity: 2 });
  return { x: x + 3, y: top + 2, width: width - 6 };
}
