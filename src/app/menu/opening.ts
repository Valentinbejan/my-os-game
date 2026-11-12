import type { Screen } from '../../screen/Screen';
import type { MenuProgram, Page } from './MenuProgram';
/** What the night is about, before the machine powers on. */
export const OPENING = [
  '8 DECEMBER 1991. 02:14.',
  '',
  'FIVE WEEKS AGO THE BLACKRIDGE ANNEX WAS EVACUATED.',
  'TWENTY-THREE PEOPLE LEFT BY BUS THAT NIGHT.',
  'OR SO THE LOG SAYS.',
  '',
  'YOU ARE THE RELIEF NIGHT OPERATOR. KEEP THE BACKUP POWER',
  'ALIVE UNTIL THE DECOMMISSION CREW ARRIVES AT 06:00,',
  'AND FILE INCIDENT REPORT IR-1103.',
  '',
  'THE WORKSTATION IS STILL LOGGED IN AS OP-17, WHO WAS ON',
  'DUTY THAT EVENING. THE SITE ASSISTANT, PROCESS 04, IS',
  'STILL RUNNING. IT WILL HELP YOU WITH THE MACHINE.',
  '',
  'READ WHAT WAS LEFT BEHIND. TYPE HELP TO BEGIN.',
];
/** Characters typed per second, and the pause a blank line makes. */
const PER_SECOND = 40;
const PARAGRAPH_MS = 700;
/**
 * The opening: the lines above typed out on a dark screen, then PRESS ANY KEY. Any key, at any
 * moment, begins the night.
 */
export class OpeningPage implements Page {
  private opened: number;
  private begun = false;
  constructor(
    private menu: MenuProgram,
    private begin: () => void,
  ) {
    this.opened = menu.clock();
  }
  /** How many characters of each line are typed by now, and whether all of them are. */
  private typed(now: number) {
    let budget = ((now - this.opened) / 1000) * PER_SECOND;
    const shown = OPENING.map((line) => {
      if (!line) {
        budget -= (PARAGRAPH_MS / 1000) * PER_SECOND;
        return 0;
      }
      const count = Math.max(0, Math.min(line.length, Math.floor(budget)));
      budget -= line.length;
      return count;
    });
    return { shown, done: budget >= 0 };
  }
  frame(now: number) {
    const { shown, done } = this.typed(now);
    return 'opening:' + shown.join(',') + ':' + done;
  }
  render(screen: Screen, now: number) {
    const { shown, done } = this.typed(now);
    const top = Math.floor((25 - OPENING.length - 3) / 2);
    OPENING.forEach((line, n) => {
      if (shown[n]) screen.put(12, top + n, line.slice(0, shown[n]), { intensity: n ? 1 : 2 });
    });
    if (done) screen.put(12, top + OPENING.length + 2, 'PRESS ANY KEY', { intensity: 0 });
  }
  key() {
    if (this.begun) return;
    this.begun = true;
    this.begin();
  }
}
