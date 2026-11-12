import type { KeyEvent } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import { Choices, drawChoice, window, type Choice } from './choices';
import type { MenuProgram, Page } from './MenuProgram';
import { OpeningPage } from './opening';
/**
 * Before a new night: whether the strip under the screen says what to do next. The highlight
 * starts on the player's last choice (guidance, the very first time).
 */
export class NewNightPage implements Page {
  private choices: Choices;
  constructor(private menu: MenuProgram) {
    const { host } = menu;
    // The choice is kept; the opening follows, and its key begins the night.
    const begin = (guided: boolean) => () => {
      host.settings.guided = guided;
      host.changed();
      menu.push(new OpeningPage(menu, () => host.newNight(guided)));
    };
    this.choices = new Choices(
      (): Choice[] => [
        { label: 'SHOW ME WHAT TO DO', hotkey: 'S', run: begin(true) },
        { label: 'PLAY ON MY OWN', hotkey: 'P', run: begin(false) },
      ],
      (kind) => host.sound(kind),
    );
    this.choices.index = host.settings.guided ? 0 : 1;
  }
  frame() {
    return 'new-night:' + this.choices.index;
  }
  render(screen: Screen) {
    const at = window(screen, 'BEFORE THE NIGHT BEGINS', 72, 11);
    screen.put(at.x, at.y, 'The strip under the screen can tell you what to do next.');
    // What each choice means, beside it, inside the window (the choices are 22 wide).
    const notes = [
      ['the TASK line says what to do next'],
      ['find your own way; the strip keeps', 'the clues, the cell, the camera, Esc'],
    ];
    this.choices.items.forEach((choice, n) => {
      drawChoice(screen, at.x + 2, at.y + 2 + n * 2, 22, choice, n === this.choices.index);
      notes[n].forEach((line, row) =>
        screen.put(at.x + 27, at.y + 2 + n * 2 + row, line, { intensity: 0 }),
      );
    });
    screen.put(at.x, at.y + 7, 'ENTER CHOOSES   ESC RETURNS', { intensity: 0 });
  }
  key(event: KeyEvent) {
    if (event.key === 'Escape') return this.menu.back();
    this.choices.key(event);
  }
}
