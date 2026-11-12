import type { KeyEvent } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import type { MenuProgram, Page } from './MenuProgram';
/** One clue as the pause menu lists it. */
export interface ClueEntry {
  phrase: string;
  title: string;
  where: string;
  /** She has not heard about it yet, and hearing it could help her remember. */
  tellHer: boolean;
}
const PER_PAGE = 9;
/**
 * CLUES in the pause menu: everything found so far, in the order it was found. The phrases
 * show red here too, as they did where they were found.
 */
export class ClueListPage implements Page {
  private top = 0;
  constructor(
    private menu: MenuProgram,
    private entries: ClueEntry[],
    private total: number,
  ) {}
  frame() {
    return 'clues:' + this.top;
  }
  render(screen: Screen) {
    screen.box(0, 0, 80, 23, 'double');
    const title = ` CLUES FOUND ${this.entries.length} OF ${this.total} `;
    screen.put(Math.floor((80 - title.length) / 2), 0, title, { intensity: 2 });
    if (!this.entries.length)
      screen.put(3, 2, 'None yet. Read what was left behind: what matters shows in red.');
    this.entries.slice(this.top, this.top + PER_PAGE).forEach((entry, n) => {
      const y = 2 + n * 2;
      screen.put(3, y, `${String(this.top + n + 1).padStart(2)}. ${entry.phrase}`);
      screen.put(7, y + 1, `${entry.title.toUpperCase()} / ${entry.where}`.slice(0, 60), {
        intensity: 0,
      });
      if (entry.tellHer) screen.put(68, y, 'TELL HER', { intensity: 2 });
    });
    screen.put(3, 21, 'Bring up a clue with the site assistant to help her remember.', {
      intensity: 0,
    });
    screen.put(1, 24, 'UP/DOWN SCROLL   ESC RETURNS', { intensity: 0 });
  }
  key(event: KeyEvent) {
    if (event.key === 'Escape') return this.menu.back();
    const last = Math.max(0, this.entries.length - PER_PAGE);
    if (event.key === 'ArrowDown' || event.key === 'PageDown')
      this.top = Math.min(last, this.top + (event.key === 'PageDown' ? PER_PAGE : 1));
    if (event.key === 'ArrowUp' || event.key === 'PageUp')
      this.top = Math.max(0, this.top - (event.key === 'PageUp' ? PER_PAGE : 1));
  }
}
