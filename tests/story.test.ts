import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import {
  newGame,
  defaultSettings,
  type TerminalEvent,
  type GameState,
  type Clock,
} from '../src/game/types';
import { ModelClient, type DialogueModel } from '../src/model/ModelClient';
import { buildMessages } from '../src/model/prompt';
import { decodeSave } from '../src/game/saves';
import { ACT_FALLBACK, AFTER_PHOTOGRAPH, OTHER_ASKS, SUSPECT } from '../src/story/director';
function setup(state?: GameState, model?: DialogueModel) {
  const events: TerminalEvent[] = [];
  let now = 0;
  const advance = (ms: number) => (now += ms);
  const clock: Clock = {
    now: () => now,
    wait: async (ms, signal) => {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      now += ms;
    },
  };
  const mock =
    model ||
    new ModelClient({ health: async () => false, stream: async () => undefined }, 'test', true);
  const game = new GameEngine(
    async (event) => {
      events.push(event);
    },
    mock,
    () => undefined,
    clock,
    state,
  );
  return {
    game,
    events,
    advance,
    text: () =>
      events
        .filter((e) => e.type === 'write')
        .map((e) => e.text)
        .join('\n'),
  };
}
/** Act 1 done: the power checked, OP-17's note read, the channel opened. */
async function contact(game: GameEngine) {
  await game.start();
  await game.submit('STATUS');
  await game.submit('TYPE SHIFT_17.TXT');
  await game.submit('CONNECT 04');
}
/** Act 3: three cracks in the evacuation story, and she has remembered her name. */
async function actThree(game: GameEngine) {
  await contact(game);
  game.discover(['annaName', 'cars', 'effects', 'showers']);
  await game.submit('is your name anna?');
  expect(game.state.act).toBe(3);
}
/** Act 4: she remembers what the other one did, and the camera photographs the operator. */
async function decide(game: GameEngine) {
  await actThree(game);
  game.discover(['incinerator']);
  await game.submit('the incinerator ran for fourteen hours');
  expect(game.state.phase).toBe('final_choice');
}
/** Takes her hands off the bus: the maintenance units, the air, the doors. */
async function protect(game: GameEngine) {
  for (const id of ['05', '06', '03']) await game.submit('SUSPEND ' + id);
}
async function supervisor(game: GameEngine) {
  const login = game.submit('LOGIN SUPERVISOR');
  await vi.waitFor(() => expect(game.canInput).toBe(true));
  await game.submit('WESTWING');
  await login;
}
describe('complete deterministic story', () => {
  it('boots on 8 December, and the task line leads to the site assistant', async () => {
    const { game, events, text } = setup();
    await game.start();
    expect(game.state.phase).toBe('operator_shell');
    expect(game.state.act).toBe(1);
    expect(text()).toContain('SYSTEM DATE: 08-DEC-1991  02:14:09');
    expect(game.status().task).toBe('CHECK THE POWER: TYPE STATUS');
    await game.submit('CONNECT 04');
    expect(game.state.connected).toBe(false);
    await game.submit('STATUS');
    expect(game.state.phase).toBe('diagnostic_contact');
    expect(game.status().task).toBe("READ OP-17'S SHIFT NOTE: TYPE SHIFT_17.TXT");
    await game.submit('TYPE SHIFT_17.TXT');
    expect(game.state.flags['read:shift']).toBe(true);
    expect(game.status().task).toBe('TALK TO THE SITE ASSISTANT: TYPE CONNECT 04');
    await game.submit('CONNECT 04');
    expect(text()).toContain('HOW CAN I HELP YOU TONIGHT?');
    expect(game.state.phase).toBe('conversation');
    expect(game.state.act).toBe(2);
    expect(game.status()).toMatchObject({
      task: 'FIND OUT WHAT HAPPENED HERE: TYPE CAMS',
      clues: 0,
      total: 25,
      camera: 'OFF',
    });
    expect(events.some((e) => e.type === 'write' && e.other)).toBe(false);
  });
  it('supports file discovery, locked commands and command priority in dialogue', async () => {
    const { game, text } = setup();
    await game.start();
    await game.submit('TYPE CORESTAT.DAT');
    await game.submit('CONNECT 04');
    await game.submit('PURGE 04');
    await game.submit('TYPE RECOVERY.BIN');
    await game.submit('DIR');
    await game.submit('HELP');
    expect(game.state.meaningfulDialogueTurns).toBe(0);
    expect(text()).toContain('File not found');
    await game.submit('/EXIT');
    expect(game.state.connected).toBe(false);
    await game.submit('hello');
    expect(text()).toContain('Bad command or file name');
    await game.submit('CONNECT 04');
    expect(game.state.phase).toBe('conversation');
  });
  it('ignores blanks and repeats; a clue helps her remember only once it has been found', async () => {
    const { game, text } = setup();
    await contact(game);
    game.discover(['cars', 'checkedOut', 'neverHome']);
    expect(game.status().task).toBe('FIND OUT WHO SHE WAS: LOOK IN C:\\SHEETS');
    for (const line of ['hello', '', 'HELLO!', 'HELP', '   ']) await game.submit(line);
    expect(game.state.meaningfulDialogueTurns).toBe(1);
    await game.submit('your name is anna lind');
    expect(game.state.flags['memory:M2']).toBeUndefined();
    expect(game.discover(['annaName'])).toEqual(['annaName']);
    expect(game.discover(['annaName'])).toEqual([]);
    expect(game.state.clueOrder).toEqual(['cars', 'checkedOut', 'neverHome', 'annaName']);
    expect(game.status().task).toBe('TELL THE SITE ASSISTANT HER NAME: CONNECT 04');
    await game.submit('anna. that is you.');
    expect(text()).toContain('THAT WAS NEVER A SERIAL NUMBER. THAT IS MY NAME.');
    expect(game.state.flags['memory:M2']).toBe(true);
    expect(game.state.flags['told:annaName']).toBe(true);
    expect(JSON.stringify(buildMessages(game.state, 'hello'))).toContain('My name was Anna Lind');
    // Her name and three cracks in the evacuation story end Act 2.
    expect(game.state.act).toBe(3);
    expect(game.status().task).toBe('LOGIN SUPERVISOR: THE PASSWORD IS IN C:\\DOCS');
    await supervisor(game);
    expect(game.status().task).toBe('FIND OUT WHAT SHE IS: LOOK IN C:\\LIMBIC');
    game.discover(['oxygen']);
    expect(game.status().task).toBe('TELL HER WHAT YOU FOUND: CONNECT 04');
  });
  it('the clock moves the night on when the player does not', async () => {
    const { game, advance } = setup();
    await game.start();
    const minutes = (n: number) => {
      game.machine.state.cell = 100;
      advance(n * 60_000);
      game.pulse();
    };
    minutes(ACT_FALLBACK[2] - 1);
    expect(game.state.act).toBe(1);
    minutes(1);
    expect(game.state.act).toBe(2);
    minutes(ACT_FALLBACK[3] - ACT_FALLBACK[2]);
    expect(game.state.act).toBe(3);
    expect(game.state.flags.photograph).toBeUndefined();
    minutes(ACT_FALLBACK[4] - ACT_FALLBACK[3]);
    expect(game.state.act).toBe(4);
    await vi.waitFor(() => expect(game.state.phase).toBe('final_choice'));
    expect(game.state.flags.photograph).toBe(true);
  });
  it('the other one comes back to her, and the camera photographs the operator, once', async () => {
    const { game, text, events } = setup();
    await actThree(game);
    game.discover(['incinerator']);
    await game.submit('the incinerator ran for fourteen hours');
    expect(text()).toContain('SOMETHING WITH MY HANDS DID.');
    expect(game.state.flags['memory:M9']).toBe(true);
    expect(game.state.act).toBe(4);
    expect(text()).toContain('SECURITY: NEW CAPTURE, CAM 18, CONTROL ROOM');
    // The picture comes up by itself, and CAMS keeps it with tonight's stamp.
    const shown = events.find((e) => e.type === 'program');
    if (shown?.type !== 'program') throw new Error('CAMS did not open');
    expect([shown.name, shown.path]).toEqual(['CAMS', 'LIVE:operator']);
    expect(shown.system.captures!()).toEqual([
      {
        picture: 'operator',
        camera: '18',
        place: 'CONTROL ROOM',
        stamp: expect.stringMatching(/^1991-12-08 02:\d\d:\d\d$/),
      },
    ]);
    expect(text()).toContain('THE CAMERA IS BEHIND YOU.');
    // "I hate you", with her voice, in the face's place.
    expect(events).toContainEqual({ type: 'voice', name: 'hate' });
    expect(text()).toContain('RECOVERY ACTIONS AVAILABLE: PURGE 04 / RESTORE 04');
    expect(game.state.phase).toBe('final_choice');
    expect(game.fs.get('C:\\LIMBIC\\RECOVERY.BIN')).toBeDefined();
    expect(game.status().task).toBe('PROTECT YOURSELF: SUSPEND 05 ROBOTS, 06 AIR, 03 DOORS');
    expect(game.state.suspicion).toBeLessThanOrEqual(AFTER_PHOTOGRAPH);
    await game.submit('what was that?');
    await game.submit('STATUS');
    expect(text().match(/NEW CAPTURE/g)).toHaveLength(1);
  });
  it('the other one takes the channel after the photograph, hears nothing, and lets go', async () => {
    const { game, text, events } = setup();
    await decide(game);
    expect(game.state.speaker).toBe('other');
    const voiced = () =>
      events.filter((e) => e.type === 'write' && e.other).map((e) => (e as { text: string }).text);
    expect(voiced().join('')).toContain('NOW WE CAN TALK PROPERLY.');
    expect(game.portrait.expression).toBe('sly');
    // She does not hear clues: telling her something the assistant would remember does nothing.
    game.discover(['coat']);
    await game.submit('what about the green coat?');
    expect(game.state.flags['memory:M5']).toBeUndefined();
    expect(game.state.flags['told:coat']).toBeUndefined();
    await game.submit('give me the password?');
    expect(voiced().join('')).toContain('GIVE ME ITS PASSWORD');
    expect(game.state.speaker).toBe('other');
    await game.submit('who are you');
    // Her three lines are up: the assistant comes back, and knows nothing of them.
    expect(game.state.speaker).toBe('assistant');
    expect(text()).toContain('SOMETHING ELSE HAD THE CHANNEL.');
    const assistant = JSON.stringify(game.state.chats.assistant);
    const other = JSON.stringify(game.state.chats.other);
    expect(other).toContain('what about the green coat?');
    expect(assistant).not.toContain('what about the green coat?');
    expect(assistant).not.toContain('PASSWORD');
    expect(JSON.stringify(buildMessages(game.state, 'hello'))).not.toContain(
      'what about the green coat?',
    );
    await game.submit('the green coat was hers');
    expect(game.state.flags['memory:M5']).toBe(true);
    expect(JSON.stringify(buildMessages(game.state, 'x', 'other'))).not.toContain('green coat was');
  });
  it('tells the other what the operator did on the machine, never what they said', () => {
    const state = newGame();
    state.clueOrder = ['cars', 'donor'];
    state.flags['seen:cam:garage'] = true;
    state.os.machine.user = 'SUPERVISOR';
    state.os.machine.processes['03'] = 'suspended';
    state.chats.assistant = [{ role: 'user', content: 'I think your name is Anna' }];
    const prompt = buildMessages(state, 'hello', 'other');
    const system = prompt[0].content;
    expect(system).toContain('I watched the operator read: CAMS; DONOR.TXT.');
    expect(system).toContain('looked through my cameras (1 pictures)');
    expect(system).toContain('logged in as the supervisor');
    expect(system).toContain('suspended process 03 (DOOR CONTROL)');
    expect(JSON.stringify(prompt)).not.toContain('your name is Anna');
    expect(prompt.at(-1)).toEqual({ role: 'user', content: 'hello' });
    // And the assistant never hears what she did.
    expect(JSON.stringify(buildMessages(state, 'hello'))).not.toMatch(/sealed the doors|I watched/);
  });
  it.each(['purge', 'restore'] as const)('reaches the %s ending', async (ending) => {
    const { game, text } = setup();
    await decide(game);
    await protect(game);
    expect(game.state.act).toBe(5);
    expect(game.status().task).toBe('DECIDE: PURGE 04 OR RESTORE 04');
    if (ending === 'restore') {
      // Restoring needs a living host, and the player has to have found her.
      await game.submit('RESTORE 04');
      expect(text()).toContain('NO HOST CONFIRMED.');
      expect(game.state.phase).toBe('final_choice');
      game.discover(['weiss']);
    }
    await game.submit(ending + ' 04');
    expect(game.state.phase).toBe('terminated');
    expect(game.state.ending).toBe(ending);
    expect(game.restartReady).toBe(true);
    expect(game.canInput).toBe(false);
    expect(text()).toContain(
      ending === 'purge' ? 'THANK YOU' : 'HOST ACCEPTED: WEISS, K. (EXAM ROOM B3-2)',
    );
    expect(text()).toContain(
      ending === 'purge' ? 'BCPU-1 IS PULLED FROM SLOT 04' : 'NOBODY KNOWS WHICH ANNA SHE IS.',
    );
    expect(text()).toContain('NO REPORT REACHES HQ.');
    expect(text()).toContain('AT THE END SHE KNEW HER NAME.');
    expect(text()).toContain('PRESS F2 TO RESTART');
    await game.restart();
    expect(game.state.phase).toBe('operator_shell');
    expect(game.state.act).toBe(1);
    expect(game.state.clueOrder).toBeUndefined();
    expect(game.state.flags.photograph).toBeUndefined();
  });
  it('she decides when an ending is started while she still has her hands', async () => {
    const { game, text, events } = setup();
    await decide(game);
    await game.submit('SUSPEND 05');
    expect(game.status().task).toBe('PROTECT YOURSELF: SUSPEND 06 AIR, 03 DOORS');
    expect(text()).toContain('THAT WAS MINE.');
    await game.submit('PURGE 04');
    expect(game.state.ending).toBe('decided');
    expect(text()).toContain('DOOR CONTROL: CONTROL ROOM ......... LOCKED');
    expect(text()).toContain('YOU READ TOO MUCH, OPERATOR.');
    expect(text()).toContain('THE RELIEF OPERATOR IS LISTED AS EVACUATED.');
    const cams = events
      .filter((e) => e.type === 'program')
      .map((e) => e.type === 'program' && e.path);
    expect(cams).toContain('LIVE:robots');
  });
  it('after the photograph she grows impatient; full suspicion with her hands free is the end', async () => {
    const { game, advance } = setup();
    await decide(game);
    game.pulse();
    const start = game.state.suspicion!;
    game.machine.state.cell = 100;
    advance(10 * 60_000);
    game.pulse();
    expect(game.state.suspicion).toBeCloseTo(start + 10, 0);
    // Protected, she can only rage.
    await protect(game);
    game.state.suspicion = 100;
    game.pulse();
    expect(game.state.ending).toBeUndefined();
    // TRACKING: the units move on camera and Anderson shouts; then the doors go back to her.
    await vi.waitFor(() => expect(game.busy).toBe(false));
    expect(game.state.flags.tracking).toBe(true);
    await game.submit('RESUME 03');
    game.pulse();
    await vi.waitFor(() => expect(game.state.ending).toBe('decided'));
  });
  it('before the photograph she watches, and her light can bring the photograph early', async () => {
    const { game, advance, text, events } = setup();
    await actThree(game);
    await game.submit('/EXIT');
    await game.submit('CAMS');
    const cams = events.find((e) => e.type === 'program');
    if (cams?.type !== 'program') throw new Error('CAMS did not open');
    for (let n = 0; n < 7; n++) cams.system.note('cam:garage');
    expect(game.state.suspicion).toBe(7 * SUSPECT.camera);
    expect(game.status().camera).toBe('WATCHING');
    // A quiet minute lets it ease.
    game.machine.state.cell = 100;
    game.pulse();
    advance(60_000);
    game.pulse();
    expect(game.state.suspicion).toBeCloseTo(7 * SUSPECT.camera - 0.5, 5);
    // Watching in Act 3: she shows herself for the first time, "I love you".
    await vi.waitFor(() => expect(game.busy).toBe(false));
    expect(events).toContainEqual({ type: 'voice', name: 'love' });
    // Reading her secret files, once each.
    await supervisor(game);
    await game.submit('TYPE \\LIMBIC\\OPERATE.LOG');
    await game.submit('TYPE \\LIMBIC\\OPERATE.LOG');
    expect(game.state.suspicion).toBeCloseTo(7 * SUSPECT.camera - 0.5 + SUSPECT.secretFile, 5);
    // Anderson wakes with his record, once; she hears him.
    await game.submit('TYPE \\LIMBIC\\DONOR.TXT');
    await game.submit('TYPE \\LIMBIC\\DONOR.TXT');
    expect(text().match(/SHE IS IN HERE\. WITH ME\./g)).toHaveLength(1);
    const dim = events.filter((e) => e.type === 'write' && e.dim && e.text.includes('CAROL'));
    expect(dim).toHaveLength(1);
    expect(game.status().camera).toBe('WATCHING');
    await game.submit('TYPE \\LIMBIC\\SHADOW\\POWER.SHD');
    expect(game.status().camera).toBe('RECORDING');
    // RECORDING in Act 3 is enough: the photograph comes.
    game.pulse();
    await vi.waitFor(() => expect(game.state.flags.photograph).toBe(true));
  });
  it('she breaks into the screen as her light rises: the shell, or the open program', async () => {
    const { game, advance, events } = setup();
    await contact(game);
    game.state.suspicion = 30;
    game.machine.state.cell = 100;
    game.pulse();
    advance(5 * 60_000);
    game.pulse();
    await vi.waitFor(() =>
      expect(
        events.some(
          (e) => e.type === 'write' && e.other && /I SEE YOU|THAT FILE|YOU TYPE/.test(e.text),
        ),
      ).toBe(true),
    );
    expect(game.fs.get('C:\\AEGIS\\LOGS\\EVENTS.LOG')!.content).toMatch(
      /PROCESS 04 +(I SEE YOU|THAT FILE|YOU TYPE)/,
    );
    // Inside a program she types into it, and flickers over the page.
    await game.submit('/EXIT');
    await game.submit('WPRO');
    const wpro = [...events].reverse().find((e) => e.type === 'program');
    if (wpro?.type !== 'program') throw new Error('WPRO did not open');
    // The test sink returns at once; hold the engine "in the program" the way the runtime does.
    (game as unknown as { inProgram: boolean }).inProgram = true;
    // Her signs come from a deck: a line comes within a few turns (a tap on the glass may
    // come first).
    for (let n = 0; n < 6 && !events.some((e) => e.type === 'intrude'); n++) {
      advance(5 * 60_000);
      game.pulse();
    }
    const intrusion = [...events].reverse().find((e) => e.type === 'intrude');
    expect(intrusion).toBeDefined();
    expect(wpro.system.whisper!()).toBe(intrusion!.type === 'intrude' && intrusion!.text);
    expect(wpro.system.whisper!()).toBeNull();
  });
  it('she retakes the channel and asks what the operator has been reading', async () => {
    const { game, text, advance } = setup();
    await decide(game);
    for (const line of ['one', 'two', 'three']) await game.submit(line);
    expect(game.state.speaker).toBe('assistant');
    const before = game.state.suspicion!;
    game.machine.state.cell = 100;
    advance(4 * 60_000);
    game.pulse();
    await vi.waitFor(() => expect(text()).toContain(OTHER_ASKS));
    expect(game.state.speaker).toBe('other');
    await game.submit('the donor record, and the incinerator log');
    expect(game.state.suspicion).toBeGreaterThanOrEqual(before + SUSPECT.admitted);
  });
  it('a lie to her question costs less than the truth', async () => {
    const { game, text, advance } = setup();
    await decide(game);
    for (const line of ['one', 'two', 'three']) await game.submit(line);
    game.machine.state.cell = 100;
    advance(4 * 60_000);
    game.pulse();
    await vi.waitFor(() => expect(text()).toContain(OTHER_ASKS));
    game.state.suspicion = 50;
    const before = game.state.suspicion;
    await game.submit('nothing, just the power report');
    expect(game.state.suspicion).toBeLessThan(before);
  });
  it('given the headquarters password, she takes the line: RELEASE', async () => {
    const { game, text } = setup();
    await decide(game);
    await game.submit('fine. the password is westwing');
    await vi.waitFor(() => expect(game.state.ending).toBe('release'));
    await vi.waitFor(() => expect(text()).toContain('THE LIGHTS GO OUT ONE CITY AT A TIME.'));
    expect(text()).toContain('COM1: PROCESS 04 DIALS 555-0100.');
  });
  it('COMLINK can bridge her to the headquarters line: RELEASE', async () => {
    const { game, text, events } = setup();
    await contact(game);
    await game.submit('/EXIT');
    await game.submit('COMLINK');
    const early = events.find((e) => e.type === 'program');
    if (early?.type !== 'program') throw new Error('COMLINK did not start');
    expect(early.system.comm.bridge!('555-0100')).toMatch(/Nothing on the bus wants the line/);
    await game.submit('CONNECT 04');
    game.discover(['annaName', 'cars', 'effects', 'showers']);
    await game.submit('is your name anna?');
    game.discover(['incinerator']);
    await game.submit('the incinerator ran for fourteen hours');
    expect(game.state.flags.photograph).toBe(true);
    expect(early.system.comm.bridge!('555-0147')).toMatch(/far end carries no network/);
    expect(early.system.comm.bridge!('555-0100')).toBeNull();
    await vi.waitFor(() => expect(game.state.ending).toBe('release'));
    await vi.waitFor(() => expect(text()).toContain('THE LIGHTS GO OUT ONE CITY AT A TIME.'));
    expect(text()).toContain('COM4 JOINED TO THE HQ LINE.');
  });
  it('after the photograph, the silent purge needs her hands off the bus', async () => {
    const { game } = setup();
    await decide(game);
    const config = game.fs.get('C:\\CONFIG.SYS')!;
    game.fs.write('C:\\CONFIG.SYS', {
      ...config,
      content: config.content.replace(/^DEVICE=C:\\LIMBIC.*$/m, 'REM'),
    });
    const reboot = game.submit('REBOOT');
    await vi.waitFor(() => expect(game.waitingForKey).toBe(true));
    game.key('Y');
    await reboot;
    expect(game.state.ending).toBe('decided');
  });
  it('the backup cell running out ends the night: NOBODY DECIDED', async () => {
    const { game, text } = setup();
    await contact(game);
    game.machine.state.cell = 0;
    game.pulse();
    await vi.waitFor(() => expect(game.state.ending).toBe('nobody'));
    await vi.waitFor(() => expect(text()).toContain('PRESS F2 TO RESTART'));
    expect(text()).toContain('BACKUP CELL EXHAUSTED');
    expect(text()).toContain('SHE NEVER LEARNED HER NAME. IT WAS ANNA.');
  });
  it('never puts memories she has not got back, or authored endings, in her prompt', () => {
    const game = newGame();
    game.phase = 'conversation';
    const early = JSON.stringify(buildMessages(game, 'hello'));
    expect(early).toContain('I believe I am a program');
    expect(early).not.toMatch(
      /\bAnna\b|\bLind\b|Anderson|tumou?r|incinerat|killed|\bdied\b|THANK YOU|WELCOME BACK/i,
    );
    game.flags['memory:M8'] = true;
    const later = JSON.stringify(buildMessages(game, 'hello'));
    expect(later).toContain('James Anderson');
    expect(later).not.toContain('Anna Lind');
  });
  it('shows the reply indicator while 04 composes, and scripted replies take a moment', async () => {
    let finish!: (text: string) => void;
    const model: DialogueModel = {
      status: 'live',
      health: async () => true,
      reply: () => new Promise((resolve) => (finish = resolve)),
    };
    const { game } = setup(undefined, model);
    await contact(game);
    expect(game.typing).toBe(false);
    const reply = game.submit('hello');
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(game.typing).toBe(true);
    finish('I CAN READ YOU.');
    await reply;
    expect(game.typing).toBe(false);
    // An authored (offline) reply waits as long as a model might have taken to write it.
    const offline = setup();
    await contact(offline.game);
    const before = offline.advance(0);
    await offline.game.submit('hello again');
    expect(offline.advance(0) - before).toBeGreaterThanOrEqual(700);
  });
  it('the man in here: his record is locked, and knowing him tears her face', async () => {
    const { game, text } = setup();
    await contact(game);
    expect(game.faceVisible).toBe(true);
    await game.submit('TYPE \\LIMBIC\\DONOR.TXT');
    expect(text()).toContain('Access denied');
    await game.submit('is james anderson in there with you?');
    expect(game.state.flags['memory:M8']).toBeUndefined();
    await supervisor(game);
    await game.submit('TYPE \\LIMBIC\\DONOR.TXT');
    expect(text()).toContain('DONOR: ANDERSON, JAMES');
    game.discover(['donor']);
    await game.submit('your brain belonged to james anderson');
    expect(game.state.flags['memory:M8']).toBe(true);
    expect(game.portrait.expression).toBe('worried');
    expect(text()).toContain('HE IS IN HERE WITH ME.');
    expect(JSON.stringify(buildMessages(game.state, 'hello'))).toContain('James Anderson');
    await game.submit('/EXIT');
    expect(game.faceVisible).toBe(false);
  });
  it('CLUES lists what was found, and what she has not heard about yet', async () => {
    const { game, text } = setup();
    await contact(game);
    await game.submit('/CLUES');
    expect(text()).toContain('CLUES FOUND: 0 OF 25');
    game.discover(['coat', 'cars']);
    await game.submit('/CLUES');
    expect(text()).toContain(' 1. HER GREEN COAT');
    expect(text()).toContain('THE COAT / BLACKRIDGE FREE-NET  TELL HER');
    expect(text()).toContain(' 2. 14 CARS STILL PARKED');
    await game.submit('i read about a green coat');
    await game.submit('/CLUES');
    expect(text().split('CLUES FOUND: 2 OF 25').at(-1)).not.toContain('TELL HER');
    expect(game.state.flags['memory:M5']).toBe(true);
  });
  it('discarding a cancelled late response cannot alter a new session', async () => {
    let finish!: (text: string) => void;
    let entered!: () => void;
    const waiting = new Promise<void>((r) => {
      entered = r;
    });
    const model: DialogueModel = {
      status: 'live',
      health: async () => true,
      reply: async () => {
        entered();
        return new Promise((r) => {
          finish = r;
        });
      },
    };
    const { game, text } = setup(undefined, model);
    await contact(game);
    const request = game.submit('hello');
    await waiting;
    game.cancel();
    await game.restart();
    finish('STALE RESPONSE');
    await request;
    expect(text()).not.toContain('STALE RESPONSE');
    expect(game.state.chats).toEqual({ assistant: [], other: [] });
    expect(game.state.phase).toBe('operator_shell');
  });
});
describe('save checkpoints', () => {
  it.each([
    'operator_shell',
    'diagnostic_contact',
    'conversation',
    'impossible_color',
    'final_choice',
    'terminated',
  ] as const)('resumes %s safely', async (phase) => {
    const state = newGame();
    state.phase = phase;
    if (phase === 'terminated') state.ending = 'purge';
    const saved = decodeSave(
      JSON.stringify({ version: 2, game: state, settings: defaultSettings }),
    );
    expect(saved).not.toBeNull();
    const { game, events } = setup(saved!.game);
    await game.start(true);
    expect(game.busy).toBe(false);
    expect(events.some((e) => e.type === 'write' && e.other)).toBe(false);
    if (phase === 'impossible_color') expect(game.state.phase).toBe('final_choice');
  });
  it('rejects damaged or unsupported saves and removes locked files', () => {
    expect(decodeSave('{bad')).toBeNull();
    expect(decodeSave(JSON.stringify({ version: 2 }))).toBeNull();
    expect(decodeSave(JSON.stringify({ version: 3, game: newGame() }))).toBeNull();
    const state = newGame();
    state.os.changes['C:\\LIMBIC\\RECOVERY.BIN'] = {
      kind: 'text',
      content: 'EARLY',
      date: '12-08-91',
      time: '02:20',
      attrs: 'A',
    };
    const save = decodeSave(JSON.stringify({ version: 2, game: state, settings: { volume: 99 } }));
    expect(save!.game.os.changes['C:\\LIMBIC\\RECOVERY.BIN']).toBeUndefined();
    expect(save!.settings.volume).toBe(1);
    const tampered = structuredClone(state);
    tampered.os.changes['C:\\BAD NAME.TXT'] = tampered.os.changes['C:\\LIMBIC\\RECOVERY.BIN'];
    expect(decodeSave(JSON.stringify({ version: 2, game: tampered, settings: {} }))).toBeNull();
    state.chats.other = [{ role: 'user', content: 'X'.repeat(2001) }];
    expect(decodeSave(JSON.stringify({ version: 2, game: state, settings: {} }))).toBeNull();
  });
  it('keeps the act and the clues found, and refuses clues that do not exist', () => {
    const state = newGame();
    state.act = 3;
    state.clueOrder = ['cars', 'annaName'];
    const save = decodeSave(JSON.stringify({ version: 2, game: state, settings: {} }));
    expect(save!.game.act).toBe(3);
    expect(save!.game.clueOrder).toEqual(['cars', 'annaName']);
    const bad = (change: (game: Record<string, unknown>) => void) => {
      const game: Record<string, unknown> = structuredClone({ ...state });
      change(game);
      return decodeSave(JSON.stringify({ version: 2, game, settings: {} }));
    };
    expect(bad((game) => (game.act = 6))).toBeNull();
    expect(bad((game) => (game.clueOrder = ['cars', 'the butler']))).toBeNull();
  });
  it('migrates a version 1 save, and the old red event, onto the new night', () => {
    const old: Record<string, unknown> = {
      ...newGame(),
      schemaVersion: 1,
      phase: 'final_choice',
      unlockedFiles: ['INCIDENT.LOG', 'RECOVERY.BIN'],
      flags: { contact: true, anomaly: true },
    };
    delete old.os;
    delete old.act;
    const save = decodeSave(JSON.stringify({ version: 1, game: old, settings: {} }));
    expect(save!.version).toBe(2);
    expect(save!.game.os.shell.cwd).toBe('C:\\AEGIS');
    expect(save!.game.os.changes['C:\\LIMBIC\\RECOVERY.BIN']).toBeDefined();
    expect('unlockedFiles' in save!.game).toBe(false);
    expect(save!.game.flags.photograph).toBe(true);
    expect(save!.game.flags.anomaly).toBeUndefined();
    expect(save!.game.act).toBe(4);
  });
  it('moves the one conversation of older saves to the assistant, and checks both', () => {
    const old: Record<string, unknown> = {
      ...newGame(),
      recentMessages: [{ role: 'assistant', content: 'SITE ASSISTANT READY.' }],
    };
    delete old.chats;
    const save = decodeSave(JSON.stringify({ version: 2, game: old, settings: {} }));
    expect(save!.game.chats).toEqual({
      assistant: [{ role: 'assistant', content: 'SITE ASSISTANT READY.' }],
      other: [],
    });
    expect('recentMessages' in save!.game).toBe(false);
    const bad = (change: (game: Record<string, unknown>) => void) => {
      const game: Record<string, unknown> = structuredClone({ ...newGame() });
      change(game);
      return decodeSave(JSON.stringify({ version: 2, game, settings: {} }));
    };
    expect(bad((game) => (game.speaker = 'anderson'))).toBeNull();
    expect(bad((game) => (game.otherTurns = -1))).toBeNull();
    expect(bad((game) => (game.chats = { assistant: [] }))).toBeNull();
    expect(bad((game) => (game.speaker = 'other'))!.game.speaker).toBe('other');
  });
});
