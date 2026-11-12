import type { KeyEvent } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import { buttons } from '../../screen/widgets';
import { window } from './choices';
import type { MenuProgram, MenuSound, Page } from './MenuProgram';
/** A yes/no question in a window over the page that asked it. No is the default. */
export class ConfirmPage implements Page {
  readonly opens: MenuSound = 'ask';
  private focus = 1;
  constructor(
    private menu: MenuProgram,
    private below: Page,
    private title: string,
    private lines: string[],
    private yes: () => void,
  ) {}
  frame(now: number) {
    return 'confirm:' + this.focus + ':' + this.below.frame(now);
  }
  render(screen: Screen, now: number) {
    this.below.render(screen, now);
    const width = Math.max(44, ...this.lines.map((line) => line.length + 8));
    const at = window(screen, this.title, width, this.lines.length + 6);
    this.lines.forEach((line, n) => screen.put(at.x, at.y + n, line));
    buttons(screen, at.y + this.lines.length + 1, ['YES', 'NO'], this.focus, at.x - 3, width);
  }
  key(event: KeyEvent) {
    const key = event.key.toUpperCase();
    const { host } = this.menu;
    if (['ARROWLEFT', 'ARROWRIGHT', 'TAB'].includes(key)) {
      this.focus = 1 - this.focus;
      host.sound('move');
    } else if (key === 'Y' || (key === 'ENTER' && this.focus === 0)) {
      this.menu.back('yes');
      this.yes();
    } else if (key === 'N' || key === 'ESCAPE' || key === 'ENTER') this.menu.back();
  }
}
/** Where POWER OFF ends in a browser, which a page cannot close. */
export class OffPage implements Page {
  constructor(private done: () => void) {}
  frame() {
    return 'off';
  }
  render(screen: Screen) {
    const text = 'IT IS NOW SAFE TO TURN OFF YOUR COMPUTER.';
    screen.put(Math.floor((80 - text.length) / 2), 12, text);
  }
  key() {
    this.done();
  }
}
