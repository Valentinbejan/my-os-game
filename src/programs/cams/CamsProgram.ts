import type { Screen } from '../../screen/Screen';
import type { KeyEvent, Program, ProgramSystem } from '../Program';
import { ARCHIVE, ARCHIVE_DATE, LIVE, type Camera } from './cameras';
import { Loader } from './Loader';
import { PICTURE_HEIGHT, PICTURE_WIDTH, loadPictures, picture, picturesLoaded } from './pictures';
/** Where the picture sits: two raster pixels a picture pixel, rows 1 to 22, centred. */
const AT = { x: 40, y: 16, scale: 2 };
const LIVE_PREFIX = 'LIVE:';
/** "1991-11-08 02:39:20" as the list shows it: 11-08-91 and 02:39:20. */
const listDate = (stamp: string) => {
  const [date, time] = stamp.split(' ');
  const [year, month, day] = date.split('-');
  return { date: `${month}-${day}-${year.slice(2)}`, time };
};
/**
 * CAMS.EXE, the security camera archive: the weekly round of pictures, and anything the
 * cameras took tonight. Pictures load slowly, in passes, off a tired disk.
 */
export class CamsProgram implements Program {
  private entries: Camera[];
  private selected = 0;
  private mode: 'list' | 'view' = 'list';
  /** Opened by the night itself on one camera: Esc goes straight back. */
  private live = false;
  private message = '';
  private loader: Loader | null = null;
  private started = 0;
  private pass = -1;
  constructor(
    private system: ProgramSystem,
    path: string | null,
    private now: () => number = () => performance.now(),
  ) {
    const captures = (system.captures?.() ?? []).flatMap((capture) => {
      const live = LIVE[capture.picture];
      return live ? [{ ...live, stamp: capture.stamp }] : [];
    });
    this.entries = [...ARCHIVE, ...captures];
    void loadPictures();
    if (path?.startsWith(LIVE_PREFIX)) {
      const at = this.entries.findIndex((e) => e.picture === path.slice(LIVE_PREFIX.length));
      if (at >= 0) {
        this.live = true;
        this.open(at);
      }
    } else if (path) {
      const number = path.replace(/^CAM/i, '').trim().padStart(2, '0');
      const at = this.entries.findIndex((e) => e.camera === number);
      if (at >= 0) this.open(at);
      else this.message = `CAM ${number.slice(0, 4)}: NO RECORDING IN THE ARCHIVE.`;
    }
  }
  /** Opens a picture: the remote picks the camera, or the tape deck steps to the next one. */
  private open(index: number, sound: 'cam-open' | 'cam-step' = 'cam-open') {
    this.system.cue(sound);
    this.selected = index;
    this.mode = 'view';
    this.loader = null;
    this.pass = -1;
    this.load();
  }
  /** Starts reading the picture off the disk, once the pictures are in memory. */
  private load() {
    const source = picture(this.camera.picture);
    if (!source) return;
    this.loader = new Loader(source, PICTURE_WIDTH, PICTURE_HEIGHT);
    this.started = this.now();
  }
  private get camera() {
    return this.entries[this.selected];
  }
  frame() {
    if (this.mode === 'view') {
      if (!this.loader) this.load();
      if (this.loader && !this.loader.done) {
        const pass = this.loader.advance(this.now() - this.started);
        // The drive seeks before each pass.
        if (pass !== this.pass && pass < 4) this.system.disk();
        this.pass = pass;
        if (this.loader.done) this.system.note('cam:' + this.camera.picture);
      }
    }
    return [
      this.mode,
      this.selected,
      picturesLoaded(),
      this.loader?.shown ?? -1,
      this.message,
    ].join(':');
  }
  render(screen: Screen) {
    screen.clear();
    screen.cursor = null;
    if (this.mode === 'list') this.renderList(screen);
    else this.renderView(screen);
  }
  private renderList(screen: Screen) {
    screen.put(0, 0, ' AEGIS CAMS 2.1'.padEnd(56) + 'SECURITY CAMERA ARCHIVE '.padStart(24), {
      inverse: true,
    });
    screen.put(2, 2, `WEEKLY ARCHIVE ${ARCHIVE_DATE}, TAKEN BY THE SITE ASSISTANT (PROCESS 04)`);
    screen.put(2, 4, 'CAM  PLACE              DATE      TIME      INDEX', { intensity: 2 });
    screen.put(2, 5, '---  -----------------  --------  --------  ---------------------', {
      intensity: 0,
    });
    this.entries.forEach((entry, n) => {
      const { date, time } = listDate(entry.stamp);
      const line = ` ${entry.camera}  ${entry.place.padEnd(17)}  ${date}  ${time}  ${entry.index}`;
      screen.put(1, 6 + n, line.padEnd(72), n === this.selected ? { inverse: true } : {});
    });
    if (this.message) screen.put(2, 22, this.message, { intensity: 2 });
    screen.put(0, 24, ' ↑↓ SELECT   ENTER VIEW   ESC EXIT'.padEnd(80), { inverse: true });
  }
  private renderView(screen: Screen) {
    const camera = this.camera;
    const where = this.live ? 'LIVE' : `FRAME ${this.selected + 1} OF ${this.entries.length}`;
    screen.put(
      0,
      0,
      ` CAM ${camera.camera}  ${camera.place}`.padEnd(62) + where.padStart(17) + ' ',
      {
        inverse: true,
      },
    );
    const loader = this.loader;
    if (!loader) {
      screen.put(2, 11, 'READING ARCHIVE...');
      return;
    }
    screen.picture = {
      pixels: loader.pixels,
      width: PICTURE_WIDTH,
      height: PICTURE_HEIGHT,
      ...AT,
      box: loader.done ? camera.box : null,
    };
    // The camera's own stamp, burned into the corner of the frame.
    screen.put(7, 2, `CAM ${camera.camera}  ${camera.stamp}`, { intensity: 2 });
    if (!loader.done) {
      const percent = Math.floor((loader.shown / PICTURE_HEIGHT) * 100);
      const bar = '█'.repeat(Math.floor(percent / 5)).padEnd(20, '·');
      screen.put(
        2,
        23,
        `READING FRAME  PASS ${Math.min(4, this.pass + 1)} OF 4  ${bar} ${percent}%`,
      );
    } else {
      screen.put(2, 23, `INDEX (PROCESS 04): ${camera.index}`, { intensity: 0 });
      if (camera.clue) screen.put(78 - camera.clue.length, 23, camera.clue, { intensity: 2 });
    }
    const keys = this.live ? ' ESC RETURN' : ' ←→ PREVIOUS/NEXT   ESC LIST   F10 EXIT';
    screen.put(0, 24, keys.padEnd(80), { inverse: true });
  }
  key(event: KeyEvent) {
    const { key } = event;
    if (key === 'F10' || (this.live && key === 'Escape')) {
      this.system.exit();
      return true;
    }
    if (this.mode === 'view') {
      if (key === 'Escape') {
        this.system.cue('cam-step');
        this.mode = 'list';
        this.loader = null;
        return true;
      }
      const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
      if (step && !this.live) {
        const count = this.entries.length;
        this.open((this.selected + step + count) % count, 'cam-step');
        return true;
      }
      return false;
    }
    this.message = '';
    const before = this.selected;
    if (key === 'Escape') this.system.exit();
    else if (key === 'ArrowDown')
      this.selected = Math.min(this.entries.length - 1, this.selected + 1);
    else if (key === 'ArrowUp') this.selected = Math.max(0, this.selected - 1);
    else if (key === 'Home') this.selected = 0;
    else if (key === 'End') this.selected = this.entries.length - 1;
    else if (key === 'Enter') this.open(this.selected);
    else return false;
    if (this.selected !== before && this.mode === 'list') this.system.cue('menu-move');
    return true;
  }
}
