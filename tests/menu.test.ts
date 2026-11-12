import { describe, expect, it } from 'vitest';
import { MenuProgram, type MenuHost, type ShiftSummary } from '../src/app/menu/MenuProgram';
import { TitlePage } from '../src/app/menu/title';
import { PausePage } from '../src/app/menu/pause';
import { ConfigurationPage } from '../src/app/menu/configuration';
import { ArchivePage } from '../src/app/menu/archive';
import { CreditsPage, EndingCreditsPage } from '../src/app/menu/credits';
import { manualSheets } from '../src/app/menu/manual';
import { decodeArchive, emptyArchive, recordArchive } from '../src/game/archive';
import { decodeSave } from '../src/game/saves';
import { GameEngine } from '../src/game/GameEngine';
import { ModelClient } from '../src/model/ModelClient';
import { defaultSettings, newGame, type Clock } from '../src/game/types';
import { Screen } from '../src/screen/Screen';
import { drawLogo, LOGO_ROWS, logoWidth } from '../src/screen/logo';
import type { KeyEvent } from '../src/programs/Program';
const press = (key: string, shift = false): KeyEvent => ({ key, ctrl: false, alt: false, shift });
function rig(summary: Partial<ShiftSummary> = {}) {
  const calls: string[] = [];
  const settings = { ...defaultSettings };
  const archive = emptyArchive();
  const guidance = { on: true as boolean | null };
  const host: MenuHost = {
    settings,
    changed: () => calls.push('changed'),
    summary: () => ({
      kind: 'none',
      time: '02:14',
      cell: 11,
      status: 'AT THE CONSOLE',
      ...summary,
    }),
    resume: () => calls.push('resume'),
    newNight: (guided) => calls.push(guided ? 'newNight:guided' : 'newNight:alone'),
    guidance: () => guidance.on,
    setGuidance: (on) => {
      guidance.on = on;
      calls.push('guidance:' + on);
    },
    exitToTitle: () => calls.push('exitToTitle'),
    close: () => calls.push('close'),
    powerOff: () => calls.push('powerOff'),
    fullscreen: () => calls.push('fullscreen'),
    sound: (kind) => calls.push('sound:' + kind),
    underlying: () => new Screen().cells,
    model: () => ({ choice: 'auto', choices: ['auto', 'off'], state: 'ready' }),
    selectModel: (choice) => calls.push('model:' + choice),
    manual: () => [{ title: 'ONE', lines: ['a'] }],
    archive: () => archive,
    eraseArchive: () => calls.push('erase'),
    clues: () => ({
      entries: [
        {
          phrase: 'HER GREEN COAT',
          title: 'The coat',
          where: 'BLACKRIDGE FREE-NET',
          tellHer: true,
        },
        {
          phrase: '14 CARS STILL PARKED',
          title: 'The cars',
          where: 'SECURITY.LOG',
          tellHer: false,
        },
      ],
      total: 25,
    }),
  };
  let now = 10_000;
  const menu = new MenuProgram(host, () => now);
  const screen = new Screen();
  const text = () => {
    menu.render(screen);
    return screen.text;
  };
  return {
    menu,
    host,
    calls,
    settings,
    archive,
    text,
    display: screen,
    advance: (ms: number) => (now += ms),
  };
}
describe('title', () => {
  it('offers a new night first when nothing is saved', () => {
    const { menu, calls, text, advance } = rig();
    menu.open(new TitlePage(menu));
    expect(text()).not.toContain('RESUME NIGHT SHIFT');
    expect(text()).toContain('BEGIN A NEW NIGHT');
    menu.key(press('Enter'));
    // Before the night begins, the player chooses whether the strip says what to do.
    expect(text()).toContain('BEFORE THE NIGHT BEGINS');
    expect(text()).toMatch(/►\s+SHOW ME WHAT TO DO/);
    expect(text()).toContain('PLAY ON MY OWN');
    // Everything on the page stays inside its window.
    const rows = text().split('\n');
    const top = rows.findIndex((row) => row.includes('BEFORE THE NIGHT BEGINS'));
    const right = rows[top].lastIndexOf('╗');
    for (const row of rows.slice(top, top + 11)) expect(row.slice(right + 1).trim()).toBe('');
    expect(calls).not.toContain('newNight:guided');
    menu.key(press('Enter'));
    // The opening comes first, typing out; a key begins the night.
    advance(2000);
    expect(text()).toContain('8 DECEMBER 1991. 02:14.');
    menu.key(press('Enter'));
    expect(calls).toContain('newNight:guided');
  });
  it('playing on my own starts an unguided night, and is remembered next time', () => {
    const { menu, calls, settings, text } = rig();
    menu.open(new TitlePage(menu));
    menu.key(press('Enter'));
    menu.key(press('ArrowDown'));
    menu.key(press('Enter'));
    menu.key(press('Enter'));
    expect(calls).toContain('newNight:alone');
    expect(settings.guided).toBe(false);
    expect(calls).toContain('changed');
    menu.open(new TitlePage(menu));
    menu.key(press('Enter'));
    expect(text()).toMatch(/►\s+PLAY ON MY OWN/);
    // Esc goes back to the title without starting anything.
    menu.key(press('Escape'));
    expect(text()).toContain('BEGIN A NEW NIGHT');
    expect(calls.filter((c) => c.startsWith('newNight'))).toHaveLength(1);
  });
  it('resumes a night in progress, and asks before erasing it', () => {
    const { menu, calls, text } = rig({ kind: 'progress' });
    menu.open(new TitlePage(menu));
    expect(text()).toMatch(/RESUME NIGHT SHIFT[\s\S]*02:14 {2}CELL 11% {2}AT THE CONSOLE/);
    menu.key(press('ArrowDown'));
    menu.key(press('Enter'));
    expect(menu.depth).toBe(2);
    expect(text()).toContain('The night in progress will be erased.');
    expect(calls).not.toContain('newNight');
    menu.key(press('n'));
    expect(menu.depth).toBe(1);
    menu.key(press('Enter'));
    menu.key(press('y'));
    // Erasing the old night leads to the same choice.
    expect(text()).toContain('BEFORE THE NIGHT BEGINS');
    menu.key(press('Enter'));
    menu.key(press('Enter'));
    expect(calls).toContain('newNight:guided');
    menu.open(new TitlePage(menu));
    menu.key(press('r'));
    expect(calls).toContain('resume');
  });
  it('says the last night ended, and Esc on the title does nothing', () => {
    const { menu, calls, text } = rig({ kind: 'ended', ending: 'purge' });
    menu.open(new TitlePage(menu));
    expect(text()).toContain('LAST NIGHT ENDED.');
    expect(text()).not.toContain('RESUME');
    menu.key(press('Escape'));
    expect(calls).not.toContain('close');
  });
  it('draws her face beside the choices, with the logo inside its rows', () => {
    const { menu, text, advance, display } = rig();
    menu.open(new TitlePage(menu));
    // Her face comes up half a second after the title opens.
    advance(3000);
    // Drawn in fine ASCII to the right of the choices, rows 6 to 21 (the rule trims row 22).
    expect(text().split('\n')[22]).toBe('─'.repeat(80));
    const fine = display.fine!;
    expect(fine).toMatchObject({ x: 35 * 9, y: 6 * 16 });
    const rows = Array.from({ length: fine.rows }, (_, row) =>
      fine.chars.slice(row * fine.columns, (row + 1) * fine.columns).join(''),
    );
    expect(rows.filter((row) => row.trim().length > 0).length).toBeGreaterThan(24);
    // Nothing of it lies under the rule.
    expect(rows.slice(32).join('').trim()).toBe('');
    const screen = new Screen();
    drawLogo(screen, 3, 2);
    screen.cells.forEach((cell, n) => {
      if (cell.char === ' ') return;
      expect(n % 80).toBeGreaterThanOrEqual(3);
      expect(n % 80).toBeLessThan(3 + logoWidth('SIGNAL/91'));
      expect(Math.floor(n / 80)).toBeGreaterThanOrEqual(2);
      expect(Math.floor(n / 80)).toBeLessThan(2 + LOGO_ROWS);
    });
  });
});
describe('the opening', () => {
  it('types out what the night is about, and any key then begins it', () => {
    const { menu, calls, text, advance } = rig();
    menu.open(new TitlePage(menu));
    menu.key(press('Enter'));
    menu.key(press('Enter'));
    expect(calls).not.toContain('newNight:guided');
    // It types out: the first words at once, the end of it later.
    expect(text()).not.toContain('TYPE HELP TO BEGIN');
    advance(40_000);
    const page = text();
    expect(page).toContain('8 DECEMBER 1991. 02:14.');
    expect(page).toContain('THE SITE ASSISTANT, PROCESS 04');
    expect(page).toContain('TYPE HELP TO BEGIN');
    expect(page).toContain('PRESS ANY KEY');
    menu.key(press('x'));
    expect(calls.filter((c) => c === 'newNight:guided')).toHaveLength(1);
  });
  it('any key skips it at once', () => {
    const { menu, calls } = rig();
    menu.open(new TitlePage(menu));
    menu.key(press('Enter'));
    menu.key(press('Enter'));
    menu.key(press(' '));
    expect(calls).toContain('newNight:guided');
  });
});
describe('after an ending', () => {
  it('goes dark, rolls the credits once, and lands on the title', () => {
    const { menu, calls, text, advance } = rig({ kind: 'ended', ending: 'purge' });
    menu.open(new EndingCreditsPage(menu));
    menu.frame();
    expect(text().trim()).toBe('');
    advance(3000);
    menu.frame();
    expect(text().trim()).toBe('');
    advance(20_000);
    menu.frame();
    expect(text()).toContain('A GAME BY');
    expect(calls).not.toContain('exitToTitle');
    advance(200_000);
    menu.frame();
    expect(calls).toContain('exitToTitle');
  });
  it('a key goes straight to the title', () => {
    const { menu, calls, advance } = rig({ kind: 'ended', ending: 'purge' });
    menu.open(new EndingCreditsPage(menu));
    advance(8000);
    menu.key(press('Escape'));
    expect(calls).toContain('exitToTitle');
  });
});
describe('pages', () => {
  it('stack, and Esc goes back one page or closes the pause menu', () => {
    const { menu, calls, text } = rig({ kind: 'progress' });
    menu.open(new PausePage(menu));
    expect(text()).toContain('SHIFT PAUSED');
    menu.key(press('c'));
    expect(text()).toContain('AEGIS / CONFIGURATION');
    menu.key(press('Escape'));
    expect(text()).toContain('SHIFT PAUSED');
    menu.key(press('Escape'));
    expect(calls).toContain('close');
  });
  it('sound as they move, change, ask and go back', () => {
    const { menu, calls } = rig({ kind: 'progress' });
    const sounds = () =>
      calls.flatMap((call) => (call.startsWith('sound:') ? [call.slice(6)] : []));
    menu.open(new PausePage(menu));
    menu.key(press('ArrowDown'));
    expect(sounds().at(-1)).toBe('move');
    menu.key(press('c'));
    expect(sounds().at(-1)).toBe('ok');
    menu.key(press('Enter'));
    expect(sounds().at(-1)).toBe('toggle');
    menu.key(press('Escape'));
    expect(sounds().at(-1)).toBe('back');
    menu.key(press('a'));
    menu.key(press('ArrowRight'));
    expect(sounds().at(-1)).toBe('section');
    // Erasing the archive asks first; NO goes back, YES confirms without the back sound.
    menu.key(press('e'));
    expect(sounds().at(-1)).toBe('ask');
    menu.key(press('n'));
    expect(sounds().at(-1)).toBe('back');
    menu.key(press('e'));
    const before = sounds().length;
    menu.key(press('y'));
    expect(sounds().slice(before)).toEqual(['yes']);
    expect(calls).toContain('erase');
  });
  it('lists the clues found, in red, and which ones she has not heard about', () => {
    const { menu, text } = rig({ kind: 'progress' });
    menu.open(new PausePage(menu));
    menu.key(press('l'));
    const page = text();
    expect(page).toContain('CLUES FOUND 2 OF 25');
    expect(page).toMatch(/ 1\. HER GREEN COAT +TELL HER/);
    expect(page).toContain('THE COAT / BLACKRIDGE FREE-NET');
    expect(page).not.toMatch(/14 CARS STILL PARKED +TELL HER/);
    menu.key(press('Escape'));
    expect(text()).toContain('SHIFT PAUSED');
  });
  it('the configuration turns the task line on or off for the night in progress', () => {
    const { menu, calls, text } = rig({ kind: 'progress' });
    menu.open(new ConfigurationPage(menu));
    expect(text()).toMatch(/TASK LINE\s+ON/);
    for (let n = 0; n < 20 && !/►\s+TASK LINE/.test(text()); n++) menu.key(press('ArrowDown'));
    menu.key(press('Enter'));
    expect(calls).toContain('guidance:false');
    expect(text()).toMatch(/TASK LINE\s+OFF/);
  });
  it('change settings from the configuration page', () => {
    const { menu, calls, settings, text } = rig();
    menu.open(new ConfigurationPage(menu));
    menu.key(press('Enter'));
    expect(settings.reducedFlicker).toBe(true);
    menu.key(press('ArrowDown'));
    menu.key(press('ArrowRight'));
    expect(settings.bloom).toBeCloseTo(0.5);
    for (let n = 0; n < 7; n++) menu.key(press('ArrowDown'));
    expect(text()).toMatch(/TEXT SPEED\s+NORMAL/);
    menu.key(press('ArrowRight'));
    expect(settings.textSpeed).toBe('fast');
    // Past the task line, to the model.
    menu.key(press('ArrowDown'));
    menu.key(press('ArrowDown'));
    menu.key(press('ArrowRight'));
    expect(calls).toContain('model:off');
    expect(calls.filter((call) => call === 'changed').length).toBe(3);
  });
  it('the archive hides what has not been found, and the credits name the maker', () => {
    const { menu, archive, advance, text } = rig();
    archive.endings.push('purge');
    archive.memories.push('M2');
    archive.nights = 1;
    menu.open(new ArchivePage(menu));
    expect(text()).toContain('PURGE');
    expect(text()).toContain('????????');
    expect(text()).not.toContain('RELEASE');
    menu.key(press('ArrowRight'));
    expect(text()).toContain('M2  HER NAME');
    expect(text()).toContain('NOT RECOVERED');
    menu.open(new CreditsPage(menu));
    let seen = false;
    for (let n = 0; n < 80 && !seen; n++) {
      advance(650);
      seen = text().includes('VALENTIN BEJAN');
    }
    expect(seen).toBe(true);
  });
});
describe('the night around the menus', () => {
  it('stands still while paused', async () => {
    let now = 0;
    const clock: Clock = {
      now: () => now,
      wait: async (ms) => {
        now += ms;
      },
    };
    const game = new GameEngine(
      async () => undefined,
      new ModelClient({ health: async () => false, stream: async () => undefined }, 'test', true),
      () => undefined,
      clock,
    );
    await game.start();
    const before = game.state.fictionalClockSeconds;
    const cell = game.machine.state.cell;
    game.freeze();
    now += 600_000;
    game.pulse();
    expect(game.shift().cell).toBe(cell);
    game.thaw();
    expect(game.state.fictionalClockSeconds).toBe(before);
    now += 5_000;
    game.shift();
    expect(game.state.fictionalClockSeconds).toBe(before + 5);
  });
  it('keeps an archive across nights: endings once, memories, faces', () => {
    const archive = emptyArchive();
    const state = newGame();
    state.flags['memory:M2'] = true;
    expect(recordArchive(archive, state, ['worried'])).toBe(true);
    expect(archive.faces).toEqual(['worried', 'closed']);
    state.phase = 'terminated';
    state.ending = 'purge';
    state.flags.silentPurge = true;
    recordArchive(archive, state, []);
    recordArchive(archive, state, []);
    expect(archive).toMatchObject({ nights: 1, endings: ['silent'], memories: ['M2'] });
    expect(decodeArchive({ nights: -3, endings: ['purge', 'win'], faces: 'x' })).toEqual({
      nights: 0,
      endings: ['purge'],
      memories: [],
      faces: [],
    });
  });
  it('saves the new settings and the archive, and defaults anything unknown', () => {
    const save = (settings: object, archive?: object) =>
      decodeSave(JSON.stringify({ version: 2, game: newGame(), settings, archive }));
    expect(save({ textSpeed: 'fast', model: 'small' }, { nights: 2 })).toMatchObject({
      settings: { textSpeed: 'fast', model: 'small' },
      archive: { nights: 2 },
    });
    expect(save({ textSpeed: 'warp', model: 'gpt' })!.settings).toMatchObject({
      textSpeed: 'normal',
      model: 'auto',
    });
    expect(save({})!.archive).toEqual(emptyArchive());
  });
  it('builds the manual from the commands the shell has, without story-hidden ones', () => {
    const game = new GameEngine(
      async () => undefined,
      new ModelClient({ health: async () => false, stream: async () => undefined }, 'test', true),
    );
    const sheets = manualSheets(game.shell);
    const lines = sheets.flatMap((sheet) => sheet.lines);
    expect(lines.some((line) => line.startsWith('DIR '))).toBe(true);
    expect(lines.some((line) => /^(PURGE|RESTORE|DISCONNECT)\b/.test(line))).toBe(false);
    for (const sheet of sheets) expect(sheet.lines.length).toBeLessThanOrEqual(19);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
  });
});
