import type { KeyEvent } from '../../programs/Program';
import { drawLogo, LOGO_ROWS, logoWidth } from '../../screen/logo';
import type { Screen } from '../../screen/Screen';
import type { MenuProgram, Page } from './MenuProgram';
/** The lettering stands at the head of the credits; these lines follow it. */
const LINES = [
  'A NIGHT SHIFT AT THE BLACKRIDGE ANNEX',
  '',
  '',
  'A GAME BY',
  '*VALENTIN BEJAN',
  '',
  '',
  'THE FACES',
  'LINE DRAWINGS, REDRAWN IN THE TERMINAL AS ASCII',
  '',
  'THE CAMERA PICTURES AND THE CLIPS',
  'MADE WITH AI TOOLS AND EDITED FOR THE GAME:',
  'DITHERED, CROPPED AND TURNED TO ASCII; THE VOICES ROBOTISED',
  '',
  'THE VOICE OF PROCESS 04',
  'A LANGUAGE MODEL RUNNING ON THIS COMPUTER',
  '',
  '*MINICPM5-2B',
  'OPENBMB  /  APACHE-2.0',
  '',
  '*MINICPM5-1B ABLITERATED',
  'HUIHUI-AI, QUANTIZED BY MRADERMACHER  /  APACHE-2.0',
  '',
  '*K2 HORIZON',
  'IFM  /  APACHE-2.0',
  '',
  '*TERNARY BONSAI 2 27B ABLITERATED',
  'BOLDINGBUILDS, FROM PRISMML  /  APACHE-2.0',
  '',
  '*LLAMA.CPP',
  'THE GGML AUTHORS  /  MIT',
  '',
  '',
  'TYPE',
  '*VT323',
  'PETER HULL  /  SIL OPEN FONT LICENSE 1.1',
  '',
  'SOUND',
  '*SOUND EFFECTS PACK',
  'OWLISHMEDIA  /  CC0',
  '',
  '*INTERFACE SOUNDS',
  'KENNEY (KENNEY.NL)  /  CC0',
  '',
  '*TERMINAL USER INTERFACE SOUND EFFECTS PACK LITE',
  '*FREE CLICK SOUND EFFECTS PACK',
  'HOVE AUDIO  /  HOVEAUDIO.ITCH.IO',
  '',
  'EVERY SOUND FILTERED AND AGED FOR 1991',
  '',
  'BUILT WITH',
  '*TAURI  REACT  VITE  TYPESCRIPT  RUST',
  '',
  '',
  'THE ANNEX, AEGIS AND EVERYONE WHO WORKED THERE ARE FICTIONAL.',
  '',
  'FULL LICENCE TEXTS ARE IN THIRD_PARTY_NOTICES.MD',
  '',
  '',
  'THANK YOU FOR STAYING THE NIGHT.',
];
/** Rows the lettering takes, with a blank row under it. */
const HEAD = LOGO_ROWS + 1;
/** Milliseconds per row as the credits roll. */
const ROLL_MS = 650;
/** The credits, rolling slowly up the tube and round again; the arrows move them by hand. */
export class CreditsPage implements Page {
  private opened: number;
  private offset = 0;
  constructor(private menu: MenuProgram) {
    this.opened = menu.clock();
  }
  /** Which row of the credits is at the top of the screen. */
  private top(now: number) {
    const length = HEAD + LINES.length + 25;
    const rolled = Math.floor((now - this.opened) / ROLL_MS) + this.offset;
    return (((rolled - 23) % length) + length) % length;
  }
  frame(now: number) {
    return 'credits:' + this.top(now);
  }
  render(screen: Screen, now: number) {
    const top = this.top(now);
    const length = HEAD + LINES.length + 25;
    // The lettering, wherever it is in view: scrolling off the top, or coming round again.
    for (const at of [-top, length - top])
      if (at > -LOGO_ROWS && at < 24)
        drawLogo(screen, Math.floor((80 - logoWidth('SIGNAL/91')) / 2), at, 'SIGNAL/91', {
          intensity: 2,
        });
    for (let y = 0; y < 24; y++) {
      const row = (top + y) % length;
      if (row < HEAD) continue;
      const line = LINES[row - HEAD];
      if (!line) continue;
      // Names (marked with *) are bright.
      const name = line.startsWith('*');
      const text = name ? line.slice(1) : line;
      screen.put(Math.floor((80 - text.length) / 2), y, text, { intensity: name ? 2 : 1 });
    }
    screen.put(1, 24, 'UP/DOWN MOVE   ESC RETURNS', { intensity: 0 });
  }
  key(event: KeyEvent) {
    if (event.key === 'Escape') return this.menu.back();
    if (event.key === 'ArrowUp' || event.key === 'PageUp')
      this.offset -= event.key === 'PageUp' ? 10 : 1;
    if (event.key === 'ArrowDown' || event.key === 'PageDown')
      this.offset += event.key === 'PageDown' ? 10 : 1;
  }
}
/** How long the screen stays dark after an ending, before the credits roll. */
export const DARK_MS = 4000;
/**
 * After an ending: a few seconds of dark screen, then the credits roll up once from the
 * bottom, and the title. Any key goes to the title at once.
 */
export class EndingCreditsPage implements Page {
  private opened: number;
  private left = false;
  constructor(private menu: MenuProgram) {
    this.opened = menu.clock();
  }
  /** Rows rolled since the dark ended; negative while it is still dark. */
  private rolled(now: number) {
    return Math.floor((now - this.opened - DARK_MS) / ROLL_MS);
  }
  private leave() {
    if (this.left) return;
    this.left = true;
    this.menu.host.exitToTitle();
  }
  frame(now: number) {
    const rolled = this.rolled(now);
    // Rolled in from below and all the way off the top: the title.
    if (rolled >= 24 + HEAD + LINES.length) this.leave();
    return 'ending-credits:' + Math.max(-1, rolled);
  }
  render(screen: Screen, now: number) {
    const rolled = this.rolled(now);
    if (rolled < 0) return;
    // Row 0 of the credits starts just below the screen and rises one row at a time.
    const top = rolled - 24;
    drawLogo(screen, Math.floor((80 - logoWidth('SIGNAL/91')) / 2), -top, 'SIGNAL/91', {
      intensity: 2,
    });
    for (let y = 0; y < 25; y++) {
      const row = top + y - HEAD;
      const line = LINES[row];
      if (!line) continue;
      const name = line.startsWith('*');
      const text = name ? line.slice(1) : line;
      screen.put(Math.floor((80 - text.length) / 2), y, text, { intensity: name ? 2 : 1 });
    }
  }
  key() {
    this.leave();
  }
}
