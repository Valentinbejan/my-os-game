import type { Command, Shell } from '../../os/shell/Shell';
import type { KeyEvent } from '../../programs/Program';
import { HELP as CALCPLAN_KEYS } from '../../programs/calcplan/CalcPlanProgram';
import { HELP as COMLINK_KEYS } from '../../programs/comlink/ComLinkProgram';
import { TEMPLATE as WRITEPRO_KEYS } from '../../programs/writepro/WriteProProgram';
import type { Screen } from '../../screen/Screen';
import { wrapText } from '../../terminal/wrapText';
import type { MenuProgram, Page } from './MenuProgram';
export interface ManualSheet {
  title: string;
  lines: string[];
}
/** Lines a sheet holds inside its frame, and the columns between its sides. */
const LINES = 19;
const WIDTH = 76;
/** Lines too long for the sheet carry on underneath. */
const fit = (lines: string[]) => lines.flatMap((line) => wrapText(line, WIDTH));
const FIRST_NIGHT = [
  'You are the relief night operator at the Blackridge Annex, 8 December',
  '1991, 02:14. The site was evacuated five weeks ago. As far as AEGIS',
  'headquarters is concerned, your job is to keep the auxiliary bus alive',
  'until the decommission crew arrives at 06:00, and to file incident',
  'report IR-1103.',
  '',
  'The control-room workstation runs AEGIS RCS/7 DOS. Everything you do,',
  'you do at its prompt:',
  '',
  '  HELP              lists the commands; add /? to one for its details',
  '  DIR  CD  TYPE     look around the disk and read what was left',
  '  STATUS            runs the local bus diagnostic',
  '  WPRO  CALC        the word processor and the spreadsheet',
  '  COMLINK  CAMS     the modem, and the security camera archive',
  '',
  'The strip under the screen says what Esc does (always a step back) and,',
  'if you asked for it, what to do next. What matters shows in red; CLUES',
  'lists it. A file that comes back as zeros reads on a second try. The',
  'night saves itself as you go.',
];
const TERMINAL_KEYS = [
  'Enter             Runs the command, or sends the line',
  'Up / Down         Earlier lines typed at the prompt',
  'Esc               Closes an open channel; at the prompt, pauses the',
  '                  night; on later nights, skips the boot',
  'PgUp / PgDn       Scrolls back through what has been printed',
  'Ctrl+C            Interrupts a command or an answer',
  'Ctrl+L            Clears the screen',
  'F11, Alt+Enter    Full screen',
  'Ctrl+Alt+Home     Restarts the workstation, as REBOOT does',
  'F6, Ctrl+Z        Ends COPY CON input',
  '',
  'In an open channel, what you type is conversation. The operator tools',
  'still work as commands; any other command runs with a slash first,',
  'for example /FIND or /COPY. Esc, EXIT or /EXIT closes the channel.',
  '',
  'Programs have their own keys; F1 or F3 shows them inside each program,',
  'and the pages that follow repeat them. Esc leaves any program; it asks',
  'first if there is something to save.',
];
/** The shell's commands by group, as HELP lists them, with each one's line of help. */
function commandLines(shell: Shell) {
  const seen = new Set<Command>();
  const groups = new Map<string, string[]>();
  const names = [...shell.commands.keys()].sort();
  for (const name of names) {
    const command = shell.commands.get(name)!;
    if (seen.has(command) || command.hidden?.(shell)) continue;
    seen.add(command);
    const lines = groups.get(command.group) ?? [];
    // Long descriptions carry on under themselves, inside the sheet.
    const [first, ...rest] = wrapText(command.help, 62);
    lines.push(name.padEnd(12) + first, ...rest.map((line) => ' '.repeat(12) + line));
    groups.set(command.group, lines);
  }
  const lines: string[] = [];
  for (const [group, entries] of groups) {
    if (lines.length) lines.push('');
    lines.push(group.toUpperCase(), ...entries);
  }
  return lines;
}
/** Splits long lists over as many sheets as they need. */
function sheets(title: string, lines: string[]): ManualSheet[] {
  const out: ManualSheet[] = [];
  for (let n = 0; n < lines.length; n += LINES)
    out.push({ title, lines: lines.slice(n, n + LINES) });
  return out;
}
/** The operator manual: the night, the keys, every command and each program's key card. */
export function manualSheets(shell: Shell): ManualSheet[] {
  const comlink = COMLINK_KEYS.map(
    ([a, b, c, d]) => a.padEnd(11) + b.padEnd(28) + c.padEnd(11) + d,
  );
  return [
    { title: 'THE NIGHT SHIFT', lines: FIRST_NIGHT },
    { title: 'TERMINAL KEYS', lines: TERMINAL_KEYS },
    ...sheets('COMMANDS', commandLines(shell)),
    {
      title: 'WRITEPRO 5.1',
      lines: fit(['Word processor. WPRO or WPRO file.WP', '', ...WRITEPRO_KEYS]),
    },
    {
      title: 'CALCPLAN 2.3',
      lines: fit(['Spreadsheet. CALC or CALC file.WK1', '', ...CALCPLAN_KEYS]),
    },
    {
      title: 'COMLINK PLUS 2.0',
      lines: fit([
        'Communications. COMLINK. Type AT commands to the modem, or dial from',
        'the directory. COM4 is the limbic bus.',
        '',
        ...comlink,
      ]),
    },
    {
      title: 'CAMS 2.1',
      lines: fit([
        'Security camera archive. CAMS, or CAMS and a camera number (CAMS 14).',
        '',
        'Up/Down           Picks a picture in the archive',
        'Enter             Shows it; it loads from the disk in four passes',
        'Left/Right        The previous or next picture',
        'Esc               Back to the archive, or out of CAMS',
        'F10               Leaves CAMS',
      ]),
    },
  ];
}
/** The manual in the menu: a framed sheet at a time, like a printed keyboard template. */
export class ManualPage implements Page {
  private index = 0;
  constructor(
    private menu: MenuProgram,
    private pages: ManualSheet[],
  ) {}
  frame() {
    return 'manual:' + this.index;
  }
  render(screen: Screen) {
    const sheet = this.pages[this.index];
    screen.box(0, 0, 80, 23, 'double');
    const title = ` OPERATOR MANUAL  ${this.index + 1}/${this.pages.length}  ${sheet.title} `;
    screen.put(Math.floor((80 - title.length) / 2), 0, title, { intensity: 2 });
    sheet.lines.forEach((line, n) => {
      // Section headings inside a sheet (a word in capitals on its own) are drawn bright.
      const heading = /^[A-Z]+$/.test(line);
      screen.put(3, 2 + n, line.slice(0, WIDTH), heading ? { intensity: 2 } : {});
    });
    screen.put(1, 24, 'PGUP/PGDN OR LEFT/RIGHT TURN PAGES   ESC RETURNS', { intensity: 0 });
  }
  key(event: KeyEvent) {
    const key = event.key;
    const last = this.pages.length - 1;
    const before = this.index;
    if (key === 'Escape') return this.menu.back();
    if (['PageDown', 'ArrowRight', 'ArrowDown', 'Enter', ' '].includes(key))
      this.index = Math.min(last, this.index + 1);
    else if (['PageUp', 'ArrowLeft', 'ArrowUp'].includes(key))
      this.index = Math.max(0, this.index - 1);
    else if (key === 'Home') this.index = 0;
    else if (key === 'End') this.index = last;
    if (this.index !== before) this.menu.host.sound('scroll');
  }
}
