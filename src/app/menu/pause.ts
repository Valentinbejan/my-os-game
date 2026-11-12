import type { KeyEvent } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import { Choices, drawChoice, window, type Choice } from './choices';
import { ConfigurationPage } from './configuration';
import { ArchivePage } from './archive';
import { ConfirmPage } from './dialogs';
import { ClueListPage } from './clues';
import { ManualPage } from './manual';
import type { MenuProgram, Page } from './MenuProgram';
/**
 * Esc during the night: a window over the terminal, which dims behind it. The night's clock
 * and the backup cell stand still until the operator goes back.
 */
export class PausePage implements Page {
  private choices: Choices;
  constructor(private menu: MenuProgram) {
    const { host } = menu;
    const open = (page: () => Page) => () => menu.push(page());
    this.choices = new Choices(
      (): Choice[] => [
        { label: 'RESUME SHIFT', hotkey: 'R', run: () => host.close() },
        {
          label: 'CLUES',
          hotkey: 'L',
          run: open(() => {
            const { entries, total } = host.clues();
            return new ClueListPage(menu, entries, total);
          }),
        },
        {
          label: 'CONFIGURATION',
          hotkey: 'C',
          run: () => menu.push(new ConfigurationPage(menu)),
        },
        {
          label: 'OPERATOR MANUAL',
          hotkey: 'M',
          run: open(() => new ManualPage(menu, host.manual())),
        },
        { label: 'ARCHIVE', hotkey: 'A', run: open(() => new ArchivePage(menu)) },
        { label: 'EXIT TO TITLE', hotkey: 'T', run: () => host.exitToTitle() },
        {
          label: 'POWER OFF',
          hotkey: 'P',
          run: () =>
            menu.push(
              new ConfirmPage(
                menu,
                this,
                'POWER OFF',
                ['The night is saved as it stands.', 'Switch the workstation off?'],
                () => host.powerOff(),
              ),
            ),
        },
      ],
      (kind) => host.sound(kind),
    );
  }
  frame() {
    const summary = this.menu.host.summary();
    return `pause:${this.choices.index}:${summary.time}:${summary.cell}`;
  }
  render(screen: Screen) {
    // The terminal as it was, turned down behind the window.
    this.menu.host.underlying().forEach((cell, n) => {
      screen.cells[n] = { ...cell, intensity: 0, inverse: false, blink: false, palette: 'amber' };
    });
    const summary = this.menu.host.summary();
    const items = this.choices.items;
    const at = window(screen, 'SHIFT PAUSED', 40, items.length + 7, 6);
    const line = `${summary.time}   BACKUP CELL ${Math.floor(summary.cell)}%`;
    screen.put(at.x + Math.floor((at.width - line.length) / 2), at.y, line, { intensity: 0 });
    items.forEach((choice, n) =>
      drawChoice(screen, at.x + 4, at.y + 2 + n, 26, choice, n === this.choices.index),
    );
  }
  key(event: KeyEvent) {
    // The runtime plays the menu closing.
    if (event.key === 'Escape') return this.menu.host.close();
    this.choices.key(event);
  }
}
