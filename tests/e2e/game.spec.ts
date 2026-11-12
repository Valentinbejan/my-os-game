import { test, expect, type Page } from '@playwright/test';
type Snapshot = {
  phase: string;
  screen: string;
  menuText: string;
  state: { fictionalClockSeconds: number; connected?: boolean };
  text: string;
  screenText: string;
  busy: boolean;
  redCells: number;
  canInput: boolean;
  restartReady: boolean;
  settings: { reducedFlicker: boolean; volume: number };
  fps: number;
  p95: number;
  model: string;
  raster: { x: number; y: number; width: number; height: number };
};
declare global {
  interface Window {
    __signal91: {
      snapshot(): Snapshot;
      setSpeed(n: number): void;
      raw(n: boolean): void;
      restart(): Promise<void>;
      suspect(value: number): void;
      skip(seconds: number): void;
      cue(name: string): void;
      sounds(): string[];
      sign(kind: string): Promise<void>;
      cell(value: number): void;
    };
  }
}
async function state(page: Page) {
  return page.evaluate(() => window.__signal91.snapshot());
}
async function command(page: Page, text: string) {
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}
/** A whole night by keyboard takes a while: the full-night tests get two minutes. */
const NIGHT_MS = 120_000;
async function boot(page: Page) {
  await page.route('**/model/health', (route) => route.fulfill({ status: 503, body: 'offline' }));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__signal91);
  await page.evaluate(() => window.__signal91.setSpeed(0));
  // The display advisory, then the title, where a first night begins with Enter, and then
  // Enter again for a guided night (the first choice, the first time).
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('BEGIN A NEW NIGHT');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('BEFORE THE NIGHT BEGINS');
  await page.keyboard.press('Enter');
  // The opening; any key begins the night.
  await expect.poll(async () => (await state(page)).menuText).toContain('8 DECEMBER 1991');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).phase).toBe('operator_shell');
}
async function login(page: Page) {
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('LOGIN SUPERVISOR');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).text).toContain('PASSWORD:');
  await page.keyboard.type('WESTWING');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}
/** Opens one camera in CAMS, waits for its picture to load, and leaves. */
async function viewCamera(page: Page, camera: string) {
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('CAMS ' + camera);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText, { timeout: 15000 })
    .toContain('INDEX (PROCESS 04)');
  expect((await state(page)).redCells).toBeGreaterThan(0);
  await page.keyboard.press('F10');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}
test('the night sounds: the power, the keys, a bad command, the pause menu and CAMS', async ({
  page,
}) => {
  const failed: string[] = [];
  let loaded = 0;
  page.on('response', (response) => {
    if (!response.url().includes('/audio/sfx/')) return;
    if (response.ok()) loaded++;
    else failed.push(response.url());
  });
  await boot(page);
  const sounds = () => page.evaluate(() => window.__signal91.sounds());
  // The power strip, the machine's switch, the supply, the one beep.
  expect(await sounds()).toEqual(
    expect.arrayContaining(['strip', 'power-button', 'power-up', 'post']),
  );
  await command(page, 'FROBNICATE');
  expect(await sounds()).toEqual(expect.arrayContaining(['key', 'bad']));
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('SHIFT PAUSED');
  expect((await sounds()).at(-1)).toBe('open');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('terminal');
  expect((await sounds()).at(-1)).toBe('close');
  await viewCamera(page, '14');
  expect(await sounds()).toEqual(expect.arrayContaining(['cam-open', 'disk', 'fkey']));
  // Every sound the game asked for came from the game itself.
  await expect.poll(() => loaded, { timeout: 15000 }).toBeGreaterThan(300);
  expect(failed).toEqual([]);
});
test('Esc always backs out, and the strip says what it will do', async ({ page }) => {
  await boot(page);
  const keys = page.locator('#strip-keys');
  await expect(keys).toHaveText('ESC: MENU');
  await command(page, 'STATUS');
  await command(page, 'TYPE SHIFT_17.TXT');
  await command(page, 'CONNECT 04');
  // In the channel: the strip, the bar at the foot of the screen, and Esc closes it.
  await expect(keys).toHaveText('ESC: CLOSE THE CHANNEL');
  expect((await state(page)).screenText).toContain('ESC OR EXIT CLOSES THE CHANNEL');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).state.connected).toBe(false);
  await expect(keys).toHaveText('ESC: MENU');
  expect((await state(page)).screen).toBe('terminal');
  // In a program: Esc leaves it, asking first.
  await page.keyboard.type('WPRO');
  await page.keyboard.press('Enter');
  await expect(keys).toHaveText('ESC: LEAVE WRITEPRO');
  expect((await state(page)).screenText).toContain('Esc or F7 Exit');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).screenText).toContain('Save document?');
  await page.keyboard.press('n');
  await expect.poll(async () => (await state(page)).screenText).toContain('Exit WRITEPRO?');
  await page.keyboard.press('y');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await expect(keys).toHaveText('ESC: MENU');
  // At the prompt: the menu, with POWER OFF.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('POWER OFF');
});
test('the TASK line shows only when the player asks for it', async ({ page }) => {
  await page.route('**/model/health', (route) => route.fulfill({ status: 503, body: 'offline' }));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__signal91);
  await page.evaluate(() => window.__signal91.setSpeed(0));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('BEGIN A NEW NIGHT');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('PLAY ON MY OWN');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('8 DECEMBER 1991');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).phase).toBe('operator_shell');
  const task = page.locator('#strip-task');
  // On their own: the strip keeps the clues, the cell, the camera and Esc, but no task.
  await expect(page.locator('#strip-info')).toContainText('CLUES 0/25');
  await expect(page.locator('#strip-keys')).toHaveText('ESC: MENU');
  await expect(task).toHaveText('');
  await command(page, 'STATUS');
  await expect(task).toHaveText('');
  // Stuck, they can turn it on from the configuration.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('SHIFT PAUSED');
  await page.keyboard.press('c');
  await expect.poll(async () => (await state(page)).menuText).toMatch(/TASK LINE\s+OFF/);
  // Down to the row, waiting for each move to reach the screen before looking again.
  for (let n = 0; n < 20; n++) {
    const before = (await state(page)).menuText;
    if (/►\s+TASK LINE/.test(before)) break;
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await state(page)).menuText).not.toBe(before);
  }
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toMatch(/TASK LINE\s+ON/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('terminal');
  await expect(task).toHaveText("TASK: READ OP-17'S SHIFT NOTE: TYPE SHIFT_17.TXT");
});
test('after an ending the screen goes dark, the credits roll, then the title', async ({ page }) => {
  test.setTimeout(NIGHT_MS);
  await boot(page);
  // The quickest ending: the backup cell runs out.
  await page.evaluate(() => window.__signal91.cell(0));
  await expect
    .poll(async () => (await state(page)).text, { timeout: 30000 })
    .toContain('SESSION TERMINATED');
  // Dark first: the menu screen, with nothing on it.
  await expect.poll(async () => (await state(page)).screen, { timeout: 15000 }).toBe('menu');
  expect((await state(page)).menuText.trim()).toBe('');
  await expect
    .poll(async () => (await state(page)).menuText, { timeout: 20000 })
    .toContain('A GAME BY');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('LAST NIGHT ENDED.');
  expect((await state(page)).menuText).toContain('BEGIN A NEW NIGHT');
});
test('her signs play in the real game', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await boot(page);
  for (const kind of ['line', 'personal', 'glass', 'prompt', 'clock', 'file', 'brownout', 'flash'])
    await page.evaluate((k) => window.__signal91.sign(k), kind);
  await expect.poll(async () => (await state(page)).text).toContain('SYSTEM DATE: 31-OCT-1991');
  // The next command is typed after the prompt she took, and lists the file she wrote.
  await command(page, 'DIR');
  expect((await state(page)).text).toMatch(/(SEE\\YOU|ARE\\YOU|B3-2|NOBODY\\LEFT)> DIR/);
  expect((await state(page)).text).toContain('OPERATOR LOG');
  expect(failures).toEqual([]);
});
/** Takes her hands off the bus, as the task strip says: robots, air, doors. */
async function protect(page: Page) {
  const task = page.locator('#strip-task');
  await expect(task).toHaveText('TASK: PROTECT YOURSELF: SUSPEND 05 ROBOTS, 06 AIR, 03 DOORS');
  for (const id of ['05', '06', '03']) await command(page, 'SUSPEND ' + id);
  expect((await state(page)).text).toContain('THAT WAS MINE.');
  await expect(task).toHaveText('TASK: DECIDE: PURGE 04 OR RESTORE 04');
}
/**
 * One night up to the decision, by keyboard: every clue is found by being on screen, and the
 * strip on the monitor frame says what to do next.
 */
async function decide(page: Page) {
  const task = page.locator('#strip-task');
  const info = page.locator('#strip-info');
  await expect(task).toHaveText('TASK: CHECK THE POWER: TYPE STATUS');
  await expect(info).toContainText('CLUES 0/25');
  await command(page, 'STATUS');
  await expect(task).toHaveText("TASK: READ OP-17'S SHIFT NOTE: TYPE SHIFT_17.TXT");
  await command(page, 'TYPE SHIFT_17.TXT');
  await command(page, 'CONNECT 04');
  expect((await state(page)).text).toContain('HOW CAN I HELP YOU TONIGHT?');
  await expect(task).toHaveText('TASK: FIND OUT WHAT HAPPENED HERE: TYPE CAMS');
  await command(page, 'hello');
  await command(page, '/EXIT');
  // Three cracks in the evacuation story, in the camera pictures her index calls quiet.
  for (const camera of ['14', '21', '31']) await viewCamera(page, camera);
  await expect(info).toContainText('CLUES 3/25');
  await expect(task).toHaveText('TASK: FIND OUT WHO SHE WAS: LOOK IN C:\\SHEETS');
  // Her name, on the patients' sheet.
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('CALC \\SHEETS\\PATIENTS.WK1');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('LIND, ANNA M.');
  await expect(task).toContainText('NEW CLUE: ');
  expect((await state(page)).redCells).toBeGreaterThan(0);
  await page.keyboard.type('/QY');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await command(page, 'CONNECT 04');
  await command(page, 'is your name anna?');
  expect((await state(page)).text).toContain('THAT IS MY NAME.');
  await expect(task).toHaveText('TASK: LOGIN SUPERVISOR: THE PASSWORD IS IN C:\\DOCS');
  await login(page);
  await expect(task).toHaveText('TASK: FIND OUT WHAT SHE IS: LOOK IN C:\\LIMBIC');
  // What the other one did, in the power monitor's own record.
  await command(page, 'TYPE \\LIMBIC\\SHADOW\\POWER.SHD');
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('the incinerator ran for fourteen hours');
  await page.keyboard.press('Enter');
  // CAM 18 comes up by itself: the operator, from behind, stamped with tonight's time.
  await expect
    .poll(async () => (await state(page)).screenText, { timeout: 20000 })
    .toMatch(/CAM 18 {2}1991-12-08 02:\d\d:\d\d/);
  await expect
    .poll(async () => (await state(page)).screenText, { timeout: 15000 })
    .toContain('THE CAMERA IS BEHIND YOU.');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/photograph.png' });
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).busy, { timeout: 15000 }).toBe(false);
  const night = await state(page);
  expect(night.text).toContain('SOMETHING WITH MY HANDS DID.');
  expect(night.text).toContain('THE CAMERA IS BEHIND YOU.');
  expect(night.phase).toBe('final_choice');
  await expect(task).toHaveText('TASK: PROTECT YOURSELF: SUSPEND 05 ROBOTS, 06 AIR, 03 DOORS');
}
test('keyboard playthrough: red clues, the task strip, the photograph, purge and restart', async ({
  page,
}) => {
  test.setTimeout(NIGHT_MS);
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await boot(page);
  expect((await state(page)).text).toContain('SYSTEM DATE: 08-DEC-1991  02:14:09');
  expect((await state(page)).redCells).toBe(0);
  await decide(page);
  // The other one has the channel now: she answers in reverse video.
  expect((await state(page)).text).toContain('NOW WE CAN TALK PROPERLY.');
  await command(page, 'who are you');
  expect((await state(page)).text).toContain('WHAT SHE BECAME WHEN SHE WOKE UP');
  const inverse = await page.evaluate(() =>
    window.__signal91
      .snapshot()
      .screenText.split('\n')
      .findIndex((line) => line.includes('WHAT SHE BECAME')),
  );
  expect(inverse).toBeGreaterThan(-1);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/other.png' });
  await protect(page);
  await command(page, 'PURGE 04');
  expect((await state(page)).text).toContain('THANK YOU');
  expect((await state(page)).restartReady).toBe(true);
  // Dark, then the credits; a key goes to the title, and a new night begins from there.
  await expect.poll(async () => (await state(page)).screen, { timeout: 15000 }).toBe('menu');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('LAST NIGHT ENDED.');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('BEFORE THE NIGHT BEGINS');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).menuText).toContain('8 DECEMBER 1991');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).phase).toBe('operator_shell');
  expect((await state(page)).redCells).toBe(0);
  await expect(page.locator('#strip-info')).toContainText('CLUES 0/25');
  expect(failures).toEqual([]);
});
test('restore needs the woman in B3-2, disables input, and resumes terminated', async ({
  page,
}) => {
  test.setTimeout(NIGHT_MS);
  await boot(page);
  await decide(page);
  await protect(page);
  await command(page, 'RESTORE 04');
  expect((await state(page)).text).toContain('NO HOST CONFIRMED.');
  await command(page, 'TYPE \\LIMBIC\\EXP\\SUBJ01.DAT');
  await command(page, 'RESTORE 04');
  expect((await state(page)).text).toContain('HOST ACCEPTED: WEISS, K. (EXAM ROOM B3-2)');
  expect((await state(page)).canInput).toBe(false);
  await page.keyboard.type('HELP');
  expect((await state(page)).phase).toBe('terminated');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/restore.png' });
  await page.reload();
  await page.waitForFunction(() => !!window.__signal91);
  await page.evaluate(() => window.__signal91.setSpeed(0));
  // The title remembers how the night ended and offers a new one.
  await expect.poll(async () => (await state(page)).menuText).toContain('LAST NIGHT ENDED.');
  expect((await state(page)).menuText).not.toContain('RESUME NIGHT SHIFT');
  expect((await state(page)).phase).toBe('terminated');
});
test('CAMS loads a picture in passes and marks what the index left out', async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('CAMS');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toContain('SECURITY CAMERA ARCHIVE');
  expect((await state(page)).screenText).toMatch(/14 +GARAGE B2 +11-08-91 +02:39:20 +NO ACTIVITY/);
  for (let n = 0; n < 7; n++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toMatch(/READING FRAME {2}PASS [23]/);
  await page.screenshot({ path: 'artifacts/cams-loading.png' });
  expect((await state(page)).redCells).toBe(0);
  await expect
    .poll(async () => (await state(page)).screenText, { timeout: 15000 })
    .toContain('INDEX (PROCESS 04): NO ACTIVITY');
  expect((await state(page)).redCells).toBe('14 CARS STILL PARKED'.length);
  await expect(page.locator('#strip-task')).toHaveText('NEW CLUE: THE CARS IN THE GARAGE');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/cams-garage.png' });
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await state(page)).screenText).toMatch(/^ CAM 17 {2}ARCHIVE B6/);
  await page.keyboard.press('F10');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await expect(page.locator('#strip-info')).toContainText('CLUES 1/25');
});
test('as her light rises she breaks into the open document, and the strip shows it', async ({
  page,
}) => {
  await boot(page);
  await command(page, 'STATUS');
  await command(page, 'TYPE SHIFT_17.TXT');
  await command(page, 'CONNECT 04');
  await command(page, '/EXIT');
  await expect(page.locator('#strip-info')).toContainText('CAMERA: OFF');
  await page.evaluate(() => window.__signal91.suspect(30));
  await expect(page.locator('#strip-info')).toContainText('CAMERA: WATCHING');
  await page.keyboard.type('WPRO');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('Doc 1 Pg 1');
  await page.keyboard.type('NIGHT LOG. ALL QUIET.');
  // Five minutes of the night go by: she types a line of her own into the document.
  await page.evaluate(() => window.__signal91.skip(300));
  await expect
    .poll(async () => (await state(page)).screenText, { timeout: 5000 })
    .toMatch(/I SEE YOU READING\.|THAT FILE IS MINE\.|YOU TYPE SLOWLY, OPERATOR\./);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/intrusion.png' });
  await page.keyboard.press('F7');
  await expect.poll(async () => (await state(page)).screenText).toContain('Save document?');
  await page.keyboard.press('n');
  await page.keyboard.press('y');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
});
test('settings, long pasted input, scrollback and aspect ratios', async ({ page }) => {
  await boot(page);
  // Esc pauses the night; C opens the configuration, where Enter switches the first row.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('SHIFT PAUSED');
  await page.keyboard.press('c');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect((await state(page)).settings.reducedFlicker).toBe(true);
  expect((await state(page)).screen).toBe('terminal');
  await command(page, 'TYPE SHIFT_17.TXT');
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageDown');
  await page.evaluate(() =>
    document.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: (() => {
          const d = new DataTransfer();
          d.setData('text', 'A'.repeat(510) + '\u0000\n');
          return d;
        })(),
        bubbles: true,
      }),
    ),
  );
  await page.keyboard.press('Control+c');
  await command(page, 'CLS');
  await command(page, 'HELP');
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
    [480, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(1000);
    const { raster } = await state(page);
    expect(raster.width / raster.height).toBeCloseTo(4 / 3, 2);
    expect(raster.x).toBeGreaterThan(0);
    expect(raster.y).toBeGreaterThan(0);
    expect(raster.x + raster.width).toBeLessThanOrEqual(width);
    expect(raster.y + raster.height).toBeLessThanOrEqual(height);
    // The tube fills the window; only a thin strip of bezel stays visible.
    const glass = await page.locator('.glass').boundingBox();
    expect(glass!.width).toBeGreaterThan(width * 0.9);
    // The amber task strip under the tube takes a little of the height.
    expect(glass!.height).toBeGreaterThan(height * 0.85);
    await page.screenshot({ path: 'artifacts/display-' + width + 'x' + height + '.png' });
  }
});
test('game sends no off-device requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url());
  });
  await boot(page);
  await command(page, 'STATUS');
  await command(page, 'CONNECT 04');
  await command(page, 'hello');
  expect(external).toEqual([]);
});

test('phosphor trails decay completely after clearing the screen', async ({ page }) => {
  await boot(page);
  await command(page, 'STATUS');
  await page.evaluate(() => window.__signal91.raw(true));
  await page.waitForTimeout(200);
  await command(page, 'CLS');
  await page.waitForTimeout(1200);
  const brightest = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl')!;
    const height = Math.floor(canvas.height * 0.8);
    const data = new Uint8Array(canvas.width * height * 4);
    gl.readPixels(0, 0, canvas.width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let maximum = 0;
    for (let index = 0; index < data.length; index += 4)
      maximum = Math.max(maximum, data[index], data[index + 1], data[index + 2]);
    return maximum;
  });
  expect(brightest).toBe(0);
});

test('cancelling live inference returns control and discards its late text', async ({ page }) => {
  await boot(page);
  await page.unroute('**/model/health');
  await page.route('**/model/health', (route) => route.fulfill({ status: 200, body: '{}' }));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The warm-up read of the prompt (one token) goes through; the reply itself is held.
  const warmUp = (body: string | null) => /"max_tokens":1\b/.test(body ?? '');
  await page.route('**/model/v1/chat/completions', async (route) => {
    if (!warmUp(route.request().postData())) await pending;
    await route
      .fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"choices":[{"delta":{"content":"STALE TEXT"}}]}\n\ndata: [DONE]\n\n',
      })
      .catch(() => undefined);
  });
  await command(page, 'STATUS');
  await command(page, 'CONNECT 04');
  const sent = page.waitForRequest(
    (request) =>
      request.url().includes('/model/v1/chat/completions') && !warmUp(request.postData()),
  );
  await page.keyboard.type('hello');
  await page.keyboard.press('Enter');
  await sent;
  await page.keyboard.press('Control+c');
  await command(page, 'DISCONNECT');
  release();
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('DATE');
  await page.keyboard.press('Enter');
  // DATE asks for a new date, as on DOS; Enter keeps the current one.
  await expect.poll(async () => (await state(page)).text).toContain('Enter new date (mm-dd-yy):');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  expect((await state(page)).text).not.toContain('STALE TEXT');
  expect((await state(page)).text).toContain('Current date is Sun 12-08-1991');
});

test('function, Alt and browser shortcut keys stay inside the terminal', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  for (const key of ['F5', 'F7', 'F10', 'Alt', 'Control+f', 'Control+p', 'Shift+F10'])
    await page.keyboard.press(key);
  await command(page, 'VER');
  expect((await state(page)).text).toContain('REMOTE OPERATIONS BIOS');
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});

test('EDIT writes a new file that the shell can read back', async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('EDIT C:\\TEMP\\NOTE.TXT');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain(' NOTE.TXT ');
  await page.keyboard.type('RELIEVED BY: THE NIGHT OPERATOR');
  await page.keyboard.press('Alt+f');
  await expect.poll(async () => (await state(page)).screenText).toContain('Save As...');
  await page.keyboard.press('x');
  await expect.poll(async () => (await state(page)).screenText).toContain('Save it now?');
  await page.keyboard.press('y');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await command(page, 'TYPE C:\\TEMP\\NOTE.TXT');
  expect((await state(page)).text).toContain('RELIEVED BY: THE NIGHT OPERATOR');
});

test('WRITEPRO saves bold text that TYPE shows between format codes', async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('WPRO');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('Doc 1 Pg 1');
  await page.keyboard.type('SHIFT NOTE ');
  await page.keyboard.press('F6');
  await page.keyboard.type('DO NOT OPEN');
  await page.keyboard.press('F6');
  await page.keyboard.press('F11');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toContain('[BOLD]DO NOT OPEN[bold]');
  await page.keyboard.press('F11');
  await page.keyboard.press('F7');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toContain('Save document? Yes (No)');
  await page.keyboard.press('y');
  await page.keyboard.type('NOTE.WP');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toContain('Exit WRITEPRO? No (Yes)');
  await page.keyboard.press('y');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await command(page, 'TYPE NOTE.WP');
  expect((await state(page)).text).toContain('SHIFT NOTE ▒DO NOT OPEN╢');
});

test('CALCPLAN reveals the hidden roster row, recalculates and saves a sheet', async ({ page }) => {
  await boot(page);
  await command(page, 'CD \\SHEETS');
  await page.keyboard.type('CALC ROSTER.WK1');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('READY');
  const screen = (await state(page)).screenText;
  expect(screen).toMatch(/\n6 +ABERNATHY, R\./);
  expect(screen).not.toContain('WEISS');
  // Rows 27 and 29 meet where Dr Weiss's row was hidden.
  await page.keyboard.press('F5');
  await page.keyboard.type('A29');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toMatch(/\n27 +WEBB, R\.[^\n]*\n29 +=/);
  await page.keyboard.type('/WRD');
  await expect.poll(async () => (await state(page)).screenText).toMatch(/\n28\* +WEISS, K\./);
  await page.keyboard.type('A28');
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await page.keyboard.press('F5');
  await page.keyboard.type('H30');
  await page.keyboard.press('Enter');
  await page.keyboard.type('+D30-D31');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toMatch(/^H30: \+D30-D31/);
  await page.keyboard.type('/FS');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toContain('Cancel  Replace  Backup');
  await page.keyboard.press('r');
  await page.keyboard.type('/QY');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await command(page, 'TYPE ROSTER.WK1');
  expect((await state(page)).text).toContain('WEISS, K.');
  await page.keyboard.type('CALC ROSTER.WK1');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('READY');
  await page.keyboard.press('F5');
  await page.keyboard.type('A28');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toMatch(/\n28 +WEISS, K\./);
});

test('COMLINK talks to process 04 on COM4 and dials the phone line', async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await state(page)).canInput).toBe(true);
  await page.keyboard.type('COMLINK');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('2400 N81 COM1');
  await page.keyboard.press('F4');
  await expect.poll(async () => (await state(page)).screenText).toContain('PORT / LINE SETTINGS');
  await page.keyboard.press('4');
  await expect
    .poll(async () => (await state(page)).screenText)
    .toContain('HOW CAN I HELP YOU TONIGHT?');
  await page.keyboard.type('hello, can you hear me');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screenText).toContain('SITE ASSISTANT HERE.');
  await page.keyboard.press('F3');
  await expect.poll(async () => (await state(page)).screenText).toContain('2400 N81 COM1');
  await page.keyboard.type('ATDT555-0199');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await state(page)).screenText, { timeout: 15000 })
    .toMatch(/ATDT555-0199\s+BUSY/);
  await page.keyboard.press('F10');
  await page.keyboard.press('y');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await command(page, 'TYPE \\AEGIS\\LOGS\\EVENTS.LOG');
  expect((await state(page)).text).toContain('COM4 OPENED BY OP-17');
  expect((await state(page)).text).toContain('COM1 DIAL 5550199');
});

test('the title, pause menu, manual, archive and credits', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await boot(page);
  await command(page, 'STATUS');
  // Paused, the night's clock stands still.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menuText).toContain('SHIFT PAUSED');
  const paused = (await state(page)).state.fictionalClockSeconds;
  await page.waitForTimeout(2200);
  // The clues found so far: none yet.
  await page.keyboard.press('l');
  await expect.poll(async () => (await state(page)).menuText).toContain('CLUES FOUND 0 OF 25');
  await page.keyboard.press('Escape');
  // The operator manual lists the commands, sheet by sheet.
  await page.keyboard.press('m');
  await expect.poll(async () => (await state(page)).menuText).toContain('THE NIGHT SHIFT');
  await page.keyboard.press('PageDown');
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await state(page)).menuText).toContain('COMMANDS');
  await page.keyboard.press('Escape');
  // Exit to the title, and the same night resumes.
  await page.keyboard.press('t');
  await expect.poll(async () => (await state(page)).menuText).toContain('RESUME NIGHT SHIFT');
  expect((await state(page)).menuText).toContain('CELL 11%');
  await page.keyboard.press('a');
  await expect.poll(async () => (await state(page)).menuText).toContain('ENDINGS');
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  // The credits roll up from below; PgDn brings them on sooner.
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await state(page)).menuText).toContain('A GAME BY');
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await expect.poll(async () => (await state(page)).screen).toBe('terminal');
  expect((await state(page)).state.fictionalClockSeconds).toBe(paused);
  await command(page, 'VER');
  expect((await state(page)).text).toContain('REMOTE OPERATIONS BIOS');
  expect(failures).toEqual([]);
});
test('a finished night is kept in the archive', async ({ page }) => {
  test.setTimeout(NIGHT_MS);
  await boot(page);
  await decide(page);
  await protect(page);
  await command(page, 'PURGE 04');
  await expect.poll(async () => (await state(page)).restartReady).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__signal91);
  await expect.poll(async () => (await state(page)).menuText).toContain('LAST NIGHT ENDED.');
  await page.keyboard.press('a');
  await expect.poll(async () => (await state(page)).menuText).toContain('PURGE');
  expect((await state(page)).menuText).toContain('NIGHTS ENDED   1');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await state(page)).menuText).toContain('M2  HER NAME');
});
test('every program and the prompt survive a storm of random keys', async ({ page }) => {
  test.setTimeout(NIGHT_MS);
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    // The test's own model endpoint answers 503 (no model), which the console reports.
    if (message.type() === 'error' && !/status of 503/.test(message.text()))
      failures.push(message.text());
  });
  await boot(page);
  // A fixed seed, so a failure can be played again key for key.
  let seed = Number(process.env.STORM_SEED ?? 91);
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const keys = [
    ...'abcxyz019 ./\\-*:',
    'Enter',
    'Escape',
    'Backspace',
    'Delete',
    'Tab',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Insert',
    'F1',
    'F2',
    'F3',
    'F4',
    'F5',
    'F6',
    'F7',
    'F8',
    'F9',
    'F10',
    'F12',
    'Alt+f',
    'Alt+x',
    'Alt+=',
    'Shift+F7',
    'Shift+Tab',
    'Control+Home',
    'Control+y',
  ];
  for (const program of ['EDIT', 'WPRO', 'CALC', 'COMLINK', 'CAMS', 'CLUES', 'DIR /A']) {
    // Back to a plain prompt first, the way a player leaves: no to saving, yes to leaving.
    for (let n = 0; n < 20; n++) {
      const now = await state(page);
      if (now.screen === 'terminal' && now.canInput) break;
      const text = now.screen === 'menu' ? '' : now.screenText;
      if (/Save document\?|not saved\. Save it now\?/.test(text)) await page.keyboard.press('n');
      else if (/Exit WRITEPRO\?|Exit COMLINK|Hang up and exit|End CALCPLAN|anyway\?/.test(text))
        await page.keyboard.press('y');
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
    }
    await expect.poll(async () => (await state(page)).canInput).toBe(true);
    await page.keyboard.type(program);
    await page.keyboard.press('Enter');
    for (let n = 0; n < 160; n++) {
      const key = keys[Math.floor(random() * keys.length)];
      await page.keyboard.press(key);
      // Her signs that come over a program too, in the middle of it all.
      if (n % 40 === 20) {
        const sign = ['line', 'personal', 'glass', 'brownout', 'file'][Math.floor(random() * 5)];
        await page.evaluate((kind) => window.__signal91.sign(kind), sign);
      }
    }
    // The pause menu may have opened: close it and carry on.
    if ((await state(page)).screen === 'menu') await page.keyboard.press('Escape');
  }
  expect(failures).toEqual([]);
});
test('without WebGL the game still plays, on a plain display', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  // A PC whose graphics driver gives the browser no WebGL at all.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type, options);
    } as typeof original;
  });
  await boot(page);
  const snapshot = (await page.evaluate(() => window.__signal91.snapshot())) as unknown as {
    renderer: string;
  };
  expect(snapshot.renderer).toBe('PLAIN DISPLAY');
  await command(page, 'DIR');
  expect((await state(page)).text).toContain('Directory of C:');
  await page.screenshot({ path: 'artifacts/plain-display.png' });
  expect(failures).toEqual([]);
});
