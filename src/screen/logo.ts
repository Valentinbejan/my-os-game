import type { Attr, Screen } from './Screen';
/**
 * The SIGNAL/91 lettering: a 7-pixel-high font drawn with half blocks, two pixel rows to a
 * character cell, as title screens did in text mode.
 */
const LETTERS: Record<string, string[]> = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
};
export const LOGO_ROWS = 4;
/** The pixel rows of a word: '#' lit, '.' dark, one blank column between letters. */
function pixels(word: string) {
  const rows = Array.from({ length: 8 }, () => '');
  [...word].forEach((char, n) => {
    const glyph = LETTERS[char] ?? LETTERS['/'];
    for (let y = 0; y < 8; y++)
      rows[y] += (n ? '.' : '') + (glyph[y] ?? '.'.repeat(glyph[0].length));
  });
  return rows;
}
/** The width of a word in character cells. */
export const logoWidth = (word: string) => pixels(word)[0].length;
/** Draws the lettering with its top-left cell at (x, y). */
export function drawLogo(
  screen: Screen,
  x: number,
  y: number,
  word = 'SIGNAL/91',
  attr: Attr = {},
) {
  const rows = pixels(word);
  for (let row = 0; row < LOGO_ROWS; row++) {
    const top = rows[row * 2],
      bottom = rows[row * 2 + 1];
    let line = '';
    for (let column = 0; column < top.length; column++) {
      const upper = top[column] === '#',
        lower = bottom[column] === '#';
      line += upper && lower ? '█' : upper ? '▀' : lower ? '▄' : ' ';
    }
    // Spaces are not drawn, so the lettering can sit over whatever is behind it.
    [...line].forEach((char, n) => char !== ' ' && screen.put(x + n, y + row, char, attr));
  }
}
