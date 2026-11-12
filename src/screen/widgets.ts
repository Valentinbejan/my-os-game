import type { KeyEvent } from '../programs/Program';
import type { Screen } from './Screen';
import type { Cue } from '../audio/cues';
export interface MenuItem {
  label: string;
  /** Returned by MenuBar.key when chosen; empty for a separator line. */
  action: string;
  /** Letter that chooses the item; shown bright. */
  hotkey?: string;
  shortcut?: string;
  disabled?: boolean;
}
export interface Menu {
  title: string;
  hotkey: string;
  items: MenuItem[];
  /** Placed at the right end of the bar (Help). */
  right?: boolean;
}
/** Writes a label with its hotkey letter drawn bright. */
export function label(
  screen: Screen,
  x: number,
  y: number,
  text: string,
  hotkey = '',
  inverse = false,
) {
  const at = hotkey ? text.toUpperCase().indexOf(hotkey.toUpperCase()) : -1;
  screen.put(x, y, text, { inverse });
  if (at >= 0) screen.put(x + at, y, text[at], { inverse, intensity: 2 });
}
/** A DOS menu bar with pull-down menus, driven entirely from the keyboard. */
export class MenuBar {
  /** Focused title, or -1 while the bar is idle. */
  focus = -1;
  pulled = false;
  item = 0;
  /** How the bar sounds as it opens, moves and closes (the program sets it). */
  sound: (cue: Cue) => void = () => undefined;
  constructor(public menus: Menu[]) {}
  get active() {
    return this.focus >= 0;
  }
  activate(index = 0, pull = false) {
    this.sound(pull ? 'menu-open' : 'menu-move');
    this.focus = index;
    this.pulled = pull;
    this.item = this.firstItem(index);
  }
  close() {
    if (this.active) this.sound('menu-close');
    this.focus = -1;
    this.pulled = false;
  }
  private firstItem(menu: number) {
    return Math.max(
      0,
      this.menus[menu].items.findIndex((i) => i.action && !i.disabled),
    );
  }
  private step(direction: 1 | -1) {
    const items = this.menus[this.focus].items;
    for (let n = 1; n <= items.length; n++) {
      const next = (this.item + direction * n + items.length) % items.length;
      if (items[next].action && !items[next].disabled) {
        this.item = next;
        return;
      }
    }
  }
  /** Alt+letter opens that menu from anywhere. */
  shortcut(event: KeyEvent) {
    if (!event.alt || event.key.length !== 1) return false;
    const index = this.menus.findIndex((m) => m.hotkey.toUpperCase() === event.key.toUpperCase());
    if (index < 0) return false;
    this.activate(index, true);
    return true;
  }
  /**
   * Handles a key while the bar is active: returns the chosen action, '' when the key only
   * moved the highlight, or null when the bar closed without a choice.
   */
  key(event: KeyEvent): string | null {
    const count = this.menus.length;
    const key = event.key;
    if (key === 'Escape' || key === 'Alt' || key === 'F10') {
      this.close();
      return null;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.focus = (this.focus + (key === 'ArrowLeft' ? count - 1 : 1)) % count;
      this.item = this.firstItem(this.focus);
      this.sound('menu-move');
      return '';
    }
    if (!this.pulled) {
      if (key === 'Enter' || key === 'ArrowDown' || key === 'ArrowUp') {
        this.sound('menu-open');
        this.pulled = true;
        this.item = this.firstItem(this.focus);
        return '';
      }
      const index = this.menus.findIndex((m) => m.hotkey.toUpperCase() === key.toUpperCase());
      if (index >= 0) this.activate(index, true);
      return '';
    }
    const items = this.menus[this.focus].items;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      this.step(key === 'ArrowDown' ? 1 : -1);
      this.sound('menu-move');
    } else if (key === 'Enter') {
      const chosen = items[this.item];
      this.close();
      return chosen.action;
    } else if (key.length === 1) {
      const chosen = items.find(
        (i) => i.hotkey?.toUpperCase() === key.toUpperCase() && !i.disabled && i.action,
      );
      if (chosen) {
        this.close();
        return chosen.action;
      }
    }
    return '';
  }
  /** Titles laid out along the bar: [x position, menu]. */
  private layout(): Array<[number, Menu]> {
    let x = 2;
    return this.menus.map((menu) => {
      if (menu.right) return [80 - menu.title.length - 3, menu];
      const at = x;
      x += menu.title.length + 2;
      return [at, menu];
    });
  }
  render(screen: Screen, y = 0) {
    screen.put(0, y, ' '.repeat(80), { inverse: true });
    const layout = this.layout();
    layout.forEach(([x, menu], index) => {
      const focused = index === this.focus;
      screen.put(x - 1, y, ' ' + menu.title + ' ', { inverse: !focused });
      label(screen, x, y, menu.title, this.active ? menu.hotkey : '', !focused);
    });
    if (!this.pulled || this.focus < 0) return;
    const [x, menu] = layout[this.focus];
    const width = Math.max(
      ...menu.items.map((i) => i.label.length + (i.shortcut?.length ?? 0) + 4),
      12,
    );
    const left = Math.min(x - 1, 80 - width - 2);
    screen.box(left, y + 1, width + 2, menu.items.length + 2, 'single');
    menu.items.forEach((item, n) => {
      const row = y + 2 + n;
      if (!item.action) {
        screen.put(left, row, '├' + '─'.repeat(width) + '┤');
        return;
      }
      const selected = n === this.item;
      const text =
        (' ' + item.label).padEnd(width - (item.shortcut?.length ?? 0) - 1) +
        (item.shortcut ?? '') +
        ' ';
      screen.put(left + 1, row, text, { inverse: selected, intensity: item.disabled ? 0 : 1 });
      if (!item.disabled) label(screen, left + 2, row, item.label, item.hotkey, selected);
    });
  }
}
/** Draws a dialog frame with its title set into the top border. */
export function dialog(
  screen: Screen,
  x: number,
  y: number,
  width: number,
  height: number,
  title = '',
) {
  screen.box(x, y, width, height, 'single');
  if (title) screen.put(x + Math.floor((width - title.length - 2) / 2), y, ` ${title} `);
}
/** A row of dialog buttons, `< OK >`, the focused one in reverse video. Returns their x positions. */
export function buttons(
  screen: Screen,
  y: number,
  names: string[],
  focus: number,
  left = 0,
  width = 80,
) {
  const texts = names.map((n) => `< ${n} >`);
  const total = texts.reduce((sum, t) => sum + t.length, 0) + (texts.length - 1) * 3;
  let x = left + Math.floor((width - total) / 2);
  return texts.map((text, n) => {
    screen.put(x, y, text, { inverse: n === focus });
    const at = x;
    x += text.length + 3;
    return at;
  });
}
/** The DOS "working" sign: a bar turning a quarter every 110 ms. */
export const SPINNER = '|/-' + String.fromCharCode(92);
export const spinnerPhase = (now: number) => Math.floor(now / 110) % SPINNER.length;
