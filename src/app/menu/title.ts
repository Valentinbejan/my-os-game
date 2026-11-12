import type { KeyEvent } from '../../programs/Program';
import { Portrait } from '../../screen/face';
import { drawLogo } from '../../screen/logo';
import type { Screen } from '../../screen/Screen';
import { Choices, drawChoice, type Choice } from './choices';
import { ConfigurationPage } from './configuration';
import { ArchivePage } from './archive';
import { CreditsPage } from './credits';
import { ConfirmPage } from './dialogs';
import { ManualPage } from './manual';
import { NewNightPage } from './newNight';
import type { MenuProgram, ModelStatus, Page } from './MenuProgram';
/** Where each choice sits on the title page. */
const ROWS: Record<string, number> = {
  'RESUME NIGHT SHIFT': 9,
  'BEGIN A NEW NIGHT': 12,
  CONFIGURATION: 13,
  'OPERATOR MANUAL': 14,
  ARCHIVE: 15,
  CREDITS: 16,
  'POWER OFF': 18,
};
const FACE = { left: 35, top: 6 };
/** How long she keeps her eyes open after the highlight moves. */
const LOOK_MS = 3200;
/** The model's state in the title's status line. */
export function modelLine(model: ModelStatus) {
  const name = model.running ? '  ' + model.running.toUpperCase() : '';
  return {
    checking: 'LIMBIC BUS: CHECKING...',
    loading: 'LIMBIC BUS: LOADING' + name + '...',
    ready: 'LIMBIC BUS: READY' + name,
    off: 'LIMBIC BUS: NO MODEL (SCRIPTED REPLIES)',
    missing: 'LIMBIC BUS: NO MODEL RUNNING (SCRIPTED REPLIES)',
    failed: 'LIMBIC BUS: MODEL DID NOT START (SCRIPTED REPLIES)',
    external: 'LIMBIC BUS: EXTERNAL SERVER',
  }[model.state];
}
/**
 * The title: the lettering, the choices, and process 04's face in the dark beside them. She
 * keeps her eyes closed, opens them now and then and when the highlight moves, and the
 * picture tears once in a while.
 */
export class TitlePage implements Page {
  private choices: Choices;
  private face = new Portrait();
  private opened: number;
  private looked = -Infinity;
  private tears = 0;
  constructor(private menu: MenuProgram) {
    this.opened = menu.clock();
    this.face.set('closed');
    this.face.reveal(this.opened + 500);
    this.choices = new Choices(
      () => this.items(),
      (kind) => menu.host.sound(kind),
    );
  }
  private items(): Choice[] {
    const { host } = this.menu;
    const summary = host.summary();
    const open = (page: () => Page) => () => this.menu.push(page());
    return [
      ...(summary.kind === 'progress'
        ? [{ label: 'RESUME NIGHT SHIFT', hotkey: 'R', run: () => host.resume() }]
        : []),
      {
        label: 'BEGIN A NEW NIGHT',
        hotkey: 'N',
        // First the question of guidance; a night in progress is erased only after a yes.
        run: () =>
          summary.kind === 'progress'
            ? this.menu.push(
                new ConfirmPage(
                  this.menu,
                  this,
                  'BEGIN A NEW NIGHT',
                  ['The night in progress will be erased.', 'Begin again from the start?'],
                  () => this.menu.push(new NewNightPage(this.menu)),
                ),
              )
            : this.menu.push(new NewNightPage(this.menu)),
      },
      {
        label: 'CONFIGURATION',
        hotkey: 'C',
        run: () => this.menu.push(new ConfigurationPage(this.menu)),
      },
      {
        label: 'OPERATOR MANUAL',
        hotkey: 'M',
        run: open(() => new ManualPage(this.menu, host.manual())),
      },
      {
        label: 'ARCHIVE',
        hotkey: 'A',
        run: open(() => new ArchivePage(this.menu)),
      },
      {
        label: 'CREDITS',
        hotkey: 'T',
        run: open(() => new CreditsPage(this.menu)),
      },
      { label: 'POWER OFF', hotkey: 'P', run: () => host.powerOff() },
    ];
  }
  /** Her face for this moment: asleep, or looking at the highlighted choice. */
  private animate(now: number) {
    const { host } = this.menu;
    const { ending } = host.summary();
    const face = this.face;
    face.steady = host.settings.reducedFlicker;
    // What was left of her last night stays on the title until a new night begins.
    face.dissolve = ending === 'purge' || ending === 'silent' || ending === 'nobody' ? 0.82 : 0;
    const cycle = (now - this.opened) % 14000;
    const awake = now - this.looked < LOOK_MS || (cycle > 8000 && cycle < 11000);
    const label = this.choices.current?.label ?? '';
    face.set(!awake ? 'closed' : /NEW NIGHT|POWER/.test(label) ? 'worried' : 'calm');
    const tear = Math.floor((now - this.opened) / 47000);
    if (tear > this.tears) {
      this.tears = tear;
      face.glitch(now, 380);
    }
  }
  frame(now: number) {
    this.animate(now);
    const { host } = this.menu;
    const summary = host.summary();
    return [
      this.choices.index,
      summary.kind,
      summary.time,
      summary.cell,
      modelLine(host.model()),
      this.face.frame(now),
    ].join('|');
  }
  render(screen: Screen, now: number) {
    const { host } = this.menu;
    const summary = host.summary();
    screen.put(1, 0, 'AEGIS SYSTEMS DIVISION / OPERATOR DISPLAY M-88', { intensity: 0 });
    screen.put(68, 0, '08-DEC-1991', { intensity: 0 });
    screen.put(0, 1, '─'.repeat(80), { intensity: 0 });
    drawLogo(screen, 3, 2, 'SIGNAL/91', { intensity: 2 });
    screen.put(3, 6, 'BLACKRIDGE ANNEX  /  NIGHT SHIFT', { intensity: 0 });
    if (summary.ending !== 'release') this.face.draw(screen, FACE.left, FACE.top, now, false, true);
    if (summary.kind === 'progress')
      screen.put(
        7,
        10,
        `${summary.time}  CELL ${Math.floor(summary.cell)}%  ${summary.status}`.slice(0, 34),
        { intensity: 0 },
      );
    else if (summary.kind === 'ended') screen.put(7, 9, 'LAST NIGHT ENDED.', { intensity: 0 });
    this.choices.items.forEach((choice, n) =>
      drawChoice(screen, 5, ROWS[choice.label], 28, choice, n === this.choices.index),
    );
    // The rule trims the face's last row.
    screen.put(0, 22, '─'.repeat(80), { intensity: 0 });
    screen.uncover(0, 22, 80, 1);
    screen.put(1, 23, modelLine(host.model()));
    screen.put(1, 24, 'ARROWS SELECT   ENTER OPENS   ALT+ENTER FULL SCREEN', { intensity: 0 });
  }
  key(event: KeyEvent) {
    const before = this.choices.index;
    this.choices.key(event);
    if (this.choices.index !== before) this.looked = this.menu.clock();
  }
}
