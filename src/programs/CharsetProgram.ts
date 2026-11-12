import type { Screen } from '../screen/Screen';
import type { Program } from './Program';
/** Development page showing every drawable character and the text attributes. */
export class CharsetProgram implements Program {
  constructor(private close: (program: Program) => void) {}
  frame() {
    return 'charset';
  }
  render(screen: Screen) {
    screen.clear();
    screen.put(0, 0, ' CHARACTER SET TEST'.padEnd(80), { inverse: true });
    screen.put(2, 2, 'ASCII');
    for (let row = 0; row < 3; row++)
      screen.put(
        2,
        3 + row,
        Array.from({ length: 32 }, (_, n) => String.fromCharCode(32 + row * 32 + n))
          .join('')
          .replace('\x7f', ' '),
      );
    screen.put(2, 7, 'LATIN  ·±°÷½¼«»   SHAPES  █▀▄▌▐░▒▓■•▲▼►◄↑↓→←');
    screen.box(2, 9, 20, 5, 'single');
    screen.put(4, 11, 'SINGLE ┼ ├ ┤ ┬ ┴');
    screen.box(24, 9, 20, 5, 'double');
    screen.put(26, 11, 'DOUBLE ╬ ╠ ╣ ╦ ╩');
    screen.box(46, 9, 20, 5, 'mixed');
    screen.put(48, 11, 'MIXED ╪ ╞ ╡ ╫ ╟');
    screen.put(2, 15, '╔══════╦══════╗ ┌──────┬──────┐ ╒══════╤══════╕');
    screen.put(2, 16, '║ CELL ║ CELL ║ │ CELL │ CELL │ │ CELL │ CELL │');
    screen.put(2, 17, '╠══════╬══════╣ ├──────┼──────┤ ╞══════╪══════╡');
    screen.put(2, 18, '╚══════╩══════╝ └──────┴──────┘ ╘══════╧══════╛');
    screen.put(2, 20, 'DIM', { intensity: 0 });
    screen.put(8, 20, 'NORMAL');
    screen.put(17, 20, 'BRIGHT', { intensity: 2 });
    screen.put(26, 20, 'UNDERLINED TEXT', { underline: true });
    screen.put(44, 20, ' INVERSE BAR ', { inverse: true });
    screen.put(60, 20, 'BLINK', { blink: true });
    screen.put(0, 23, '░▒▓█'.repeat(20));
    screen.put(0, 24, ' ANY KEY RETURNS'.padEnd(80), { inverse: true });
    screen.cursor = { x: 17, y: 24, shape: 'underline' };
  }
  key() {
    this.close(this);
    return true;
  }
}
