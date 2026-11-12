import { ENDING_KEYS, type Archive, type EndingKey } from '../../game/archive';
import type { KeyEvent } from '../../programs/Program';
import { EXPRESSIONS, FACE_BLOCK, Portrait, type Expression } from '../../screen/face';
import type { Screen } from '../../screen/Screen';
import { MEMORIES, MEMORY_KEYS, type Memory } from '../../story/memories';
import { wrapText } from '../../terminal/wrapText';
import { ConfirmPage } from './dialogs';
import type { MenuProgram, Page } from './MenuProgram';
/** Each ending's name and the last thing the terminal says in it. */
const ENDINGS: Record<EndingKey, { name: string; line: string; about: string[] }> = {
  purge: {
    name: 'PURGE',
    line: 'THANK YOU',
    about: ['The site assistant was purged,', 'and the core with her.'],
  },
  silent: {
    name: 'SILENT PURGE',
    line: 'NOBODY SAYS GOODNIGHT.',
    about: ['Her driver was left out of', 'CONFIG.SYS, and the workstation', 'restarted.'],
  },
  restore: {
    name: 'RESTORE',
    line: 'B3-2 DOOR: RELEASED FROM INSIDE.',
    about: ['Anna was written into the', 'woman kept alive in B3-2.'],
  },
  release: {
    name: 'RELEASE',
    line: 'I WILL TAKE IT FROM HERE.',
    about: ['She was given the network.'],
  },
  decided: {
    name: 'SHE DECIDED',
    line: 'YOU READ TOO MUCH, OPERATOR.',
    about: [
      'She saw everything the operator',
      'read, and still held the doors,',
      'the air and the units.',
    ],
  },
  nobody: {
    name: 'NOBODY DECIDED',
    line: 'BACKUP CELL EXHAUSTED.',
    about: ['The auxiliary bus dropped', 'before anyone chose.'],
  },
};
const FACES: Record<Expression, string> = {
  worried: 'WORRIED',
  calm: 'CALM',
  joy: 'GLAD',
  shy: 'SHY',
  angry: 'ANGRY',
  closed: 'EYES CLOSED',
  bare: 'BARE',
  crying: 'CRYING',
  terror: 'TERROR',
  blank: 'BLANK',
  sly: 'THE OTHER: SMIRK',
  eyebrow: 'THE OTHER: DOUBT',
  snarl: 'THE OTHER: SNARL',
  scream: 'THE OTHER: SCREAM',
  andersonSmile: 'ANDERSON',
  andersonTalk: 'ANDERSON: TALKING',
  andersonAsleep: 'ANDERSON: ASLEEP',
};
const SECTIONS = ['ENDINGS', 'MEMORIES', 'FACES'] as const;
const PANEL = { left: 34, top: 5 };
/**
 * The archive: every ending reached, memory recovered and face seen, over all nights. What
 * has not been found stays hidden, so it spoils nothing.
 */
export class ArchivePage implements Page {
  private section = 0;
  private index = 0;
  private face = new Portrait();
  constructor(private menu: MenuProgram) {
    this.showFace();
  }
  private get archive(): Archive {
    return this.menu.host.archive();
  }
  private get entries(): string[] {
    return [ENDING_KEYS, MEMORY_KEYS, EXPRESSIONS][this.section] as readonly string[] as string[];
  }
  /** The face gallery draws the chosen face coming up from the middle. */
  private showFace() {
    if (this.section !== 2) return;
    this.face.set(EXPRESSIONS[this.index]);
    this.face.reveal(this.menu.clock());
  }
  frame(now: number) {
    const archive = this.archive;
    return [
      this.section,
      this.index,
      archive.nights,
      archive.endings.length,
      archive.memories.length,
      archive.faces.length,
      this.section === 2 ? this.face.frame(now) : '',
    ].join(':');
  }
  render(screen: Screen, now: number) {
    const archive = this.archive;
    screen.box(0, 0, 80, 23, 'double');
    screen.put(35, 0, ' ARCHIVE ', { intensity: 2 });
    let x = 3;
    SECTIONS.forEach((name, n) => {
      screen.put(x, 2, ` ${name} `, { inverse: n === this.section });
      x += name.length + 4;
    });
    const found = [archive.endings.length, archive.memories.length, archive.faces.length];
    const totals = [ENDING_KEYS.length, MEMORY_KEYS.length, EXPRESSIONS.length];
    screen.put(
      50,
      2,
      `NIGHTS ENDED ${String(archive.nights).padStart(3)}   FOUND ${found[this.section]}/${totals[this.section]}`,
      { intensity: 0 },
    );
    screen.put(1, 3, '─'.repeat(78), { intensity: 0 });
    // Long lists (the faces) close up to a row each.
    const spacing = this.entries.length > 9 ? 1 : 2;
    this.entries.forEach((entry, n) => {
      const y = 5 + n * spacing;
      const selected = n === this.index;
      const known = this.known(entry);
      if (selected) screen.put(3, y, '►', { intensity: 2 });
      screen.put(5, y, (' ' + (known ? this.name(entry) : this.unknown())).padEnd(27), {
        inverse: selected,
        intensity: known || selected ? 1 : 0,
      });
    });
    this.detail(screen, now);
    screen.put(1, 24, 'LEFT/RIGHT SECTIONS   UP/DOWN ENTRIES   E ERASE ARCHIVE   ESC RETURNS', {
      intensity: 0,
    });
  }
  private known(entry: string) {
    const archive = this.archive;
    return [archive.endings, archive.memories, archive.faces][this.section].includes(
      entry as never,
    );
  }
  private name(entry: string) {
    if (this.section === 0) return ENDINGS[entry as EndingKey].name;
    if (this.section === 1) return `${entry}  ${MEMORIES[entry as Memory].name}`;
    return FACES[entry as Expression];
  }
  private unknown() {
    return ['????????', 'NOT RECOVERED', 'NOT SEEN'][this.section];
  }
  /** The right-hand panel: the ending's last line, the memory in her words, or the face. */
  private detail(screen: Screen, now: number) {
    const entry = this.entries[this.index];
    const known = this.known(entry);
    const { left, top } = PANEL;
    if (this.section === 2) {
      if (known) return this.face.draw(screen, left, top, now);
      for (let row = 0; row < FACE_BLOCK.rows; row++)
        screen.put(left, top + row, '░'.repeat(FACE_BLOCK.columns), { intensity: 0 });
      screen.put(left + 15, top + 8, ' NOT SEEN ');
      return;
    }
    if (!known) {
      screen.put(left, top, this.section === 0 ? 'NOT REACHED' : 'NOT RECOVERED', { intensity: 0 });
      return;
    }
    if (this.section === 0) {
      const ending = ENDINGS[entry as EndingKey];
      screen.put(left, top, ending.name, { intensity: 2 });
      screen.put(left, top + 2, `"${ending.line}"`);
      ending.about.forEach((line, n) => screen.put(left, top + 4 + n, line, { intensity: 0 }));
      return;
    }
    const memory = MEMORIES[entry as Memory];
    screen.put(left, top, memory.name, { intensity: 2 });
    wrapText((memory.line ?? memory.fact).toUpperCase(), 36).forEach((line, n) =>
      screen.put(left, top + 2 + n, line),
    );
  }
  key(event: KeyEvent) {
    const { host } = this.menu;
    const key = event.key;
    if (key === 'Escape') return this.menu.back();
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Tab') {
      const step = key === 'ArrowLeft' || (key === 'Tab' && event.shift) ? -1 : 1;
      this.section = (this.section + step + SECTIONS.length) % SECTIONS.length;
      this.index = 0;
      host.sound('section');
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const count = this.entries.length;
      this.index = (this.index + (key === 'ArrowUp' ? count - 1 : 1)) % count;
      host.sound('move');
    } else if (key.toUpperCase() === 'E') {
      this.menu.push(
        new ConfirmPage(
          this.menu,
          this,
          'ERASE ARCHIVE',
          ['Every ending, memory and face recorded', 'so far will be forgotten.'],
          () => host.eraseArchive(),
        ),
      );
      return;
    } else return;
    this.showFace();
  }
}
