import { beforeAll, describe, expect, it } from 'vitest';
import {
  PICTURE_DATA,
  PICTURE_HEIGHT as BUILT_H,
  PICTURE_WIDTH as BUILT_W,
} from '../src/programs/cams/pictureData';
import {
  PICTURE_HEIGHT,
  PICTURE_WIDTH,
  loadPictures,
  picture,
  unpack,
} from '../src/programs/cams/pictures';
import { ARCHIVE, LIVE } from '../src/programs/cams/cameras';
import { Loader, ROWS_PER_SECOND, SEEK_MS } from '../src/programs/cams/Loader';
import { CamsProgram } from '../src/programs/cams/CamsProgram';
import type { Capture, ProgramSystem } from '../src/programs/Program';
import { Screen } from '../src/screen/Screen';
import { Portrait } from '../src/screen/face';
import { markClues } from '../src/story/clues';
const key = (key: string) => ({ key, alt: false, ctrl: false, shift: false });
/** Long enough for any picture to finish loading. */
const LOADED = 4 * SEEK_MS + (PICTURE_HEIGHT * 1000) / ROWS_PER_SECOND + 1;
beforeAll(() => loadPictures());
describe('camera pictures', () => {
  it('has every picture the cameras show, 320 x 176 in four levels', () => {
    expect([BUILT_W, BUILT_H]).toEqual([PICTURE_WIDTH, PICTURE_HEIGHT]);
    const ids = [...ARCHIVE, ...Object.values(LIVE)].map((camera) => camera.picture);
    expect(new Set(ids).size).toBe(15);
    for (const id of ids) {
      const pixels = picture(id)!;
      expect(pixels).toHaveLength(PICTURE_WIDTH * PICTURE_HEIGHT);
      const levels = new Set(pixels);
      expect([...levels].sort()).toEqual([0, 1, 2, 3]);
    }
    expect(Object.keys(PICTURE_DATA).sort()).toEqual([...ids].sort());
  });
  it('unpacks four pixels a byte, first pixel in the top bits', () => {
    expect([...unpack(btoa(String.fromCharCode(0b00011011)), 4)]).toEqual([0, 1, 2, 3]);
  });
  it('keeps every red box inside its picture', () => {
    for (const camera of [...ARCHIVE, ...Object.values(LIVE)])
      if (camera.box) {
        const { x, y, width, height } = camera.box;
        expect(x >= 0 && y >= 0 && width > 8 && height > 8).toBe(true);
        expect(x + width <= PICTURE_WIDTH && y + height <= PICTURE_HEIGHT).toBe(true);
      }
  });
});
describe('loading a picture', () => {
  const source = Uint8Array.from({ length: 32 * 16 }, (_, n) => n % 4);
  it('waits for the drive, then draws every eighth row eight tall and eight wide', () => {
    const loader = new Loader(source, 32, 16);
    expect(loader.advance(SEEK_MS - 1)).toBe(0);
    expect(loader.shown).toBe(0);
    loader.advance(SEEK_MS + 1000 / ROWS_PER_SECOND);
    expect(loader.shown).toBe(1);
    // Row 0 is exact; it stands in for rows 1-7, coarsely, eight pixels to a block.
    expect(loader.pixels[5]).toBe(source[5]);
    for (let y = 1; y < 8; y++) expect(loader.pixels[y * 32 + 5]).toBe(source[y * 32]);
    expect(loader.pixels[8 * 32]).toBe(0);
  });
  it('sharpens pass by pass and ends with the whole picture', () => {
    const loader = new Loader(source, 32, 16);
    const passes = new Set<number>();
    for (let t = 0; t <= 2000; t += 20) passes.add(loader.advance(t));
    expect([...passes]).toEqual([0, 1, 2, 3, 4]);
    expect(loader.done).toBe(true);
    expect([...loader.pixels]).toEqual([...source]);
  });
});
function rig(captures: Capture[] = [], path: string | null = null) {
  let now = 0;
  const calls: string[] = [];
  const system: ProgramSystem = {
    cwd: 'C:\\AEGIS',
    resolve: (p) => p,
    read: () => 'missing',
    write: () => 'ok',
    list: () => [],
    folders: () => [],
    stat: () => null,
    now: () => ({ date: '12-08-91', time: '02:40:00', weekday: 'Sun' }),
    disk: () => calls.push('disk'),
    beep: () => undefined,
    sound: () => undefined,
    cue: () => undefined,
    loop: () => undefined,
    note: (event) => calls.push('note:' + event),
    comm: {
      dial: () => 'NO ANSWER',
      openBus: () => ({ error: 'none' }),
      talk: async () => ({ reply: '' }),
      distort: () => undefined,
      ringing: () => false,
      pickUp: () => '',
      nudge: () => null,
      portrait: new Portrait(),
      closeBus: () => undefined,
    },
    captures: () => captures,
    exit: () => calls.push('exit'),
  };
  const program = new CamsProgram(system, path, () => now);
  const show = () => {
    program.frame();
    const screen = new Screen();
    program.render(screen);
    return screen;
  };
  return { program, calls, show, wait: (ms: number) => (now += ms) };
}
describe('CAMS', () => {
  it('lists the archive the site assistant indexed, with nothing out of place', () => {
    const { show } = rig();
    const text = show().text;
    expect(text).toContain('WEEKLY ARCHIVE 11-08-91, TAKEN BY THE SITE ASSISTANT (PROCESS 04)');
    expect(text).toMatch(/14 +GARAGE B2 +11-08-91 +02:39:20 +NO ACTIVITY/);
    expect(text).not.toContain('CONTROL ROOM');
  });
  it('loads a picture in passes, then boxes what the index left out and names it in red', () => {
    const { program, show, calls, wait } = rig();
    for (let n = 0; n < 7; n++) program.key(key('ArrowDown'));
    program.key(key('Enter'));
    let screen = show();
    expect(screen.text).toMatch(/^ CAM 14 {2}GARAGE B2 +FRAME 8 OF 13/);
    expect(screen.text).toContain('CAM 14  1991-11-08 02:39:20');
    expect(screen.picture!.box).toBeNull();
    wait(SEEK_MS + 500);
    screen = show();
    expect(screen.text).toMatch(/READING FRAME {2}PASS [12] OF 4/);
    expect(screen.picture!.pixels.some((level) => level > 0)).toBe(true);
    expect(markClues(screen.cells)).toEqual([]);
    // Frame by frame, as the tube asks for them.
    for (let t = 0; t < LOADED; t += 50) {
      wait(50);
      screen = show();
    }
    expect(screen.picture!.box).toEqual(ARCHIVE[7].box);
    expect(screen.text).toContain('INDEX (PROCESS 04): NO ACTIVITY');
    expect(markClues(screen.cells)).toEqual(['cars']);
    expect(calls.filter((call) => call === 'disk')).toHaveLength(4);
    expect(calls.filter((call) => call.startsWith('note:'))).toEqual(['note:cam:garage']);
    // Right to the next picture, Esc to the list, Esc out.
    program.key(key('ArrowRight'));
    expect(show().text).toMatch(/^ CAM 17 {2}ARCHIVE B6/);
    program.key(key('Escape'));
    expect(show().text).toContain('SECURITY CAMERA ARCHIVE');
    program.key(key('Escape'));
    expect(calls).toContain('exit');
  });
  it('opens a camera by number, and says when there is none', () => {
    expect(rig([], '21').show().text).toMatch(/^ CAM 21 {2}DECONTAMINATION/);
    expect(rig([], '99').show().text).toContain('CAM 99: NO RECORDING IN THE ARCHIVE.');
  });
  it("shows tonight's capture of the operator live, and in the archive afterwards", () => {
    const capture = {
      picture: 'operator',
      camera: '18',
      place: 'CONTROL ROOM',
      stamp: '1991-12-08 02:51:07',
    };
    const live = rig([capture], 'LIVE:operator');
    live.wait(LOADED);
    const screen = live.show();
    expect(screen.text).toMatch(/^ CAM 18 {2}CONTROL ROOM +LIVE/);
    expect(screen.text).toContain('CAM 18  1991-12-08 02:51:07');
    expect(screen.text).toContain('THE CAMERA IS BEHIND YOU.');
    live.program.key(key('ArrowLeft'));
    live.program.key(key('Escape'));
    expect(live.calls).toContain('exit');
    expect(rig([capture]).show().text).toMatch(/18 +CONTROL ROOM +12-08-91 +02:51:07 +NEW CAPTURE/);
  });
});
