import { TEXT_SPEEDS, type ModelChoice } from '../../game/types';
import type { KeyEvent } from '../../programs/Program';
import type { Screen } from '../../screen/Screen';
import { bar } from './choices';
import type { MenuProgram, Page } from './MenuProgram';
/** The names the configuration page gives the models. */
export const MODEL_NAMES: Record<ModelChoice, string> = {
  auto: 'AUTOMATIC',
  minicpm2: 'MINICPM5-2B',
  small: 'MINICPM5-1B (SMALL)',
  horizon: 'K2 HORIZON 4B',
  bonsai: 'BONSAI 27B (SLOW)',
  off: 'OFF (SCRIPTED REPLIES)',
};
type Row =
  | { section: string }
  | {
      label: string;
      hint: string;
      value(): string;
      /** Left is -1; Right, Enter and Space are +1. */
      change(step: -1 | 1): void;
    };
type Level = 'bloom' | 'volume' | 'hum' | 'keyboard' | 'effects';
type Switch = 'reducedFlicker' | 'highContrast';
/** DISPLAY, SOUND, TEXT and the model: every setting on one framed page. */
export class ConfigurationPage implements Page {
  private index = 0;
  private rows: Row[];
  constructor(private menu: MenuProgram) {
    const { host } = menu;
    const settings = host.settings;
    const level = (key: Level, label: string, hint: string): Row => ({
      label,
      hint,
      value: () => bar(settings[key]),
      change: (step) => {
        settings[key] = Math.round(Math.max(0, Math.min(1, settings[key] + step * 0.1)) * 10) / 10;
        host.changed();
        // Higher as it goes up, and at the new volume.
        host.sound('move', 0.8 + settings[key] * 0.5);
      },
    });
    const toggle = (key: Switch, label: string, hint: string): Row => ({
      label,
      hint,
      value: () => (settings[key] ? 'ON' : 'OFF'),
      change: () => {
        settings[key] = !settings[key];
        host.changed();
        host.sound('toggle');
      },
    });
    const cycle = <T>(list: readonly T[], at: T, step: number) =>
      list[(list.indexOf(at) + step + list.length) % list.length];
    this.rows = [
      { section: 'DISPLAY' },
      toggle(
        'reducedFlicker',
        'REDUCED FLICKER',
        'Shorter phosphor trails; the picture holds still when it tears.',
      ),
      level('bloom', 'PHOSPHOR BLOOM', 'How far the glow spreads around bright text.'),
      toggle('highContrast', 'HIGH CONTRAST', 'Brighter text on a darker tube.'),
      {
        label: 'FULL SCREEN',
        hint: 'Switches between a window and the whole screen. Also F11 or Alt+Enter.',
        value: () => 'SWITCH',
        change: () => host.fullscreen(),
      },
      { section: '' },
      { section: 'SOUND' },
      level('volume', 'MASTER VOLUME', 'Everything the terminal plays.'),
      level('hum', 'ROOM', 'The mains hum, the fans and the air handling.'),
      level('keyboard', 'KEYBOARD CLICKS', 'The keys as you type.'),
      level(
        'effects',
        'EFFECTS',
        'The drive, the relays, the menus, the modem, the printer, and her.',
      ),
      { section: '' },
      { section: 'TEXT' },
      {
        label: 'TEXT SPEED',
        hint: 'How fast text types out. The night keeps its own pauses.',
        value: () => settings.textSpeed.toUpperCase(),
        change: (step) => {
          settings.textSpeed = cycle(TEXT_SPEEDS, settings.textSpeed, step);
          host.changed();
          host.sound('section');
        },
      },
      {
        label: 'TASK LINE',
        hint: "The strip's TASK instructions for this night. A new night asks again.",
        value: () => {
          const on = host.guidance();
          return on === null ? 'NO NIGHT' : on ? 'ON' : 'OFF';
        },
        change: () => {
          const on = host.guidance();
          if (on === null) return host.sound('error');
          host.setGuidance(!on);
          host.sound('toggle');
        },
      },
      { section: '' },
      { section: 'PROCESS 04' },
      {
        label: 'LANGUAGE MODEL',
        hint: 'The local model that answers as process 04. Changing it restarts the model.',
        value: () => {
          const model = host.model();
          const state = {
            checking: '',
            loading: 'LOADING',
            ready: 'READY',
            off: '',
            missing: 'NOT RUNNING',
            failed: 'DID NOT START',
            external: 'EXTERNAL',
          }[model.state];
          return (MODEL_NAMES[model.choice] + '  ' + state).trimEnd();
        },
        change: (step) => {
          const model = host.model();
          if (model.choices.length < 2) return host.sound('error');
          host.sound('section');
          host.selectModel(cycle(model.choices, model.choice, step));
        },
      },
      { section: '' },
      {
        label: 'RETURN',
        hint: 'Settings are saved as you change them.',
        value: () => '',
        change: () => menu.back(),
      },
    ];
    this.index = this.rows.findIndex((row) => 'label' in row);
  }
  private get selectable() {
    return this.rows.flatMap((row, n) => ('label' in row ? [n] : []));
  }
  private move(step: 1 | -1) {
    const rows = this.selectable;
    const at = rows.indexOf(this.index);
    this.index = rows[(at + step + rows.length) % rows.length];
    this.menu.host.sound('move');
  }
  frame() {
    return (
      this.index +
      ':' +
      this.rows.map((row) => ('label' in row ? row.value() : '')).join('|') +
      ':' +
      JSON.stringify(this.menu.host.settings)
    );
  }
  render(screen: Screen) {
    screen.box(0, 0, 80, 23, 'double');
    screen.put(28, 0, ' AEGIS / CONFIGURATION ', { intensity: 2 });
    this.rows.forEach((row, n) => {
      const y = 2 + n;
      if (!('label' in row)) {
        if (row.section) screen.put(3, y, row.section, { intensity: 2 });
        return;
      }
      const selected = n === this.index;
      if (selected) screen.put(3, y, '►', { intensity: 2 });
      screen.put(5, y, (' ' + row.label).padEnd(26) + row.value().padEnd(44), {
        inverse: selected,
      });
    });
    const current = this.rows[this.index];
    if ('label' in current) screen.put(3, 21, current.hint, { intensity: 0 });
    screen.put(1, 24, 'ARROWS CHOOSE   LEFT/RIGHT CHANGE   ENTER SWITCHES   ESC RETURNS', {
      intensity: 0,
    });
  }
  key(event: KeyEvent) {
    const row = this.rows[this.index];
    const key = event.key;
    if (key === 'Escape') return this.menu.back();
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Tab')
      return this.move(key === 'ArrowUp' || (key === 'Tab' && event.shift) ? -1 : 1);
    if (!('label' in row)) return;
    // Each row makes its own sound as it changes.
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter' || key === ' ')
      row.change(key === 'ArrowLeft' ? -1 : 1);
  }
}
