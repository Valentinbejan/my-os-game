import { GameEngine } from '../game/GameEngine';
import { decodeSave } from '../game/saves';
import {
  defaultSettings,
  realClock,
  type ModelChoice,
  type Settings,
  type TerminalEvent,
} from '../game/types';
import { TerminalBuffer } from '../terminal/TerminalBuffer';
import { TerminalInput } from '../terminal/TerminalInput';
import { GlyphAtlas } from '../terminal/GlyphAtlas';
import { TerminalRenderer } from '../terminal/TerminalRenderer';
import { TextWriter } from '../terminal/TextWriter';
import { ProgramHost, keyEvent, type ProgramName } from '../programs/Program';
import { ShellProgram } from '../programs/ShellProgram';
import { CharsetProgram } from '../programs/CharsetProgram';
import { EditProgram } from '../programs/edit/EditProgram';
import { WriteProProgram } from '../programs/writepro/WriteProProgram';
import { CalcPlanProgram } from '../programs/calcplan/CalcPlanProgram';
import { ComLinkProgram } from '../programs/comlink/ComLinkProgram';
import { CamsProgram } from '../programs/cams/CamsProgram';
import { CrtRenderer } from '../crt/CrtRenderer';
import { ModelClient } from '../model/ModelClient';
import { AudioEngine, type Cue } from '../audio/AudioEngine';
import { CUES } from '../audio/cues';
import { config } from './config';
import {
  isDesktop,
  modelState,
  readSave,
  selectModel,
  startModel,
  writeSave,
  transport,
  type ServerState,
} from './platform';
import {
  MenuProgram,
  type MenuHost,
  type ModelStatus,
  type ShiftSummary,
} from './menu/MenuProgram';
import { TitlePage } from './menu/title';
import { PausePage } from './menu/pause';
import { EndingCreditsPage } from './menu/credits';
import { OpeningPage } from './menu/opening';
import type { Sign } from '../story/director';
import { ConfigurationPage, MODEL_NAMES } from './menu/configuration';
import { OffPage } from './menu/dialogs';
import { manualSheets } from './menu/manual';
import { emptyArchive, recordArchive, type Archive } from '../game/archive';
import { CLUES, clue, markClues } from '../story/clues';
import { loadVideo, type VideoName } from '../screen/videos';
/** What fills the tube: the night, a menu, or one of the system pages. */
type View = 'terminal' | 'warning' | 'menu' | 'developer' | 'scrollback';
/** The programs as the strip names them. */
const PROGRAM_TITLES: Record<ProgramName, string> = {
  EDIT: 'EDIT',
  WPRO: 'WRITEPRO',
  CALC: 'CALCPLAN',
  COMLINK: 'COMLINK',
  CAMS: 'CAMS',
};
/** Text speed as a factor on the typing delay. */
const PACE = { normal: 1, fast: 0.35, instant: 0 } as const;
export class Runtime {
  buffer = new TerminalBuffer();
  input = new TerminalInput();
  settings: Settings = { ...defaultSettings, volume: config.volume };
  engine!: GameEngine;
  crt!: CrtRenderer;
  private renderer!: TerminalRenderer;
  private writer!: TextWriter;
  private audio = new AudioEngine(() => this.settings);
  private model = new ModelClient(transport, config.modelId, config.mock);
  private overlay = new TerminalBuffer();
  private host = new ProgramHost();
  private shellProgram!: ShellProgram;
  /** The menus (title, pause, configuration ...) on their own page. */
  private menu!: MenuProgram;
  private menuDisplay = new ProgramHost();
  /** The night has been started or resumed in this session. */
  private started = false;
  /** Endings, memories and faces found over every night. */
  private archive: Archive = emptyArchive();
  /** "NEW CLUE: ..." on the strip for a few seconds after a clue is found. */
  private flash: { text: string; until: number } | null = null;
  /** The cue the developer page's sound check plays. */
  private soundCheck = 0;
  /** What the sounds last heard of the night, so each change plays once (null: not yet). */
  private heard: { camera: string; task: string; cell: number; tally: boolean } | null = null;
  private stripText = '';
  /** The program on the screen, by the name the strip gives it. */
  private programTitle = '';
  private modelCheck = 0;
  /** The desktop model server as last reported (null in the browser build). */
  private server: ServerState | null = null;
  private transcriptPage = '';
  private screen: View = 'terminal';
  private selection = 0;
  private scrollOffset = 0;
  private frame = 0;
  private speed = 1;
  private disposed = false;
  private saved = Promise.resolve();
  private saveFault = false;
  private mouseTimer = 0;
  private frames: number[] = [];
  private frameLast = 0;
  private restored = false;
  private diskTimer = 0;
  constructor(private canvas: HTMLCanvasElement) {}
  async initialize() {
    let saved = null;
    try {
      saved = decodeSave(await readSave());
    } catch {
      this.saveFault = true;
    }
    if (saved) {
      this.settings = saved.settings;
      this.archive = saved.archive;
      this.restored = true;
    }
    // The model loads while the title is up, so it is ready when the night begins. A model
    // chosen in a copy of the game that had more of them falls back to AUTOMATIC.
    void (async () => {
      const server = await modelState();
      if (server && !['auto', 'off', ...server.installed].includes(this.settings.model))
        this.settings.model = 'auto';
      await startModel(this.settings.model);
    })();
    const atlas = new GlyphAtlas();
    await atlas.initialize();
    if (this.disposed) return;
    this.renderer = new TerminalRenderer(atlas);
    this.crt = new CrtRenderer(this.canvas, this.renderer.plane.width, this.renderer.plane.height);
    // Without WebGL the game still plays on a plain display, without the tube.
    if (this.crt.status === 'CRT UNAVAILABLE')
      throw new Error('DISPLAY ADAPTER UNAVAILABLE.\nENABLE HARDWARE ACCELERATION AND RESTART.');
    const clock = {
      now: () => Date.now(),
      wait: (ms: number, signal?: AbortSignal) =>
        this.speed === 0
          ? signal?.aborted
            ? Promise.reject(new DOMException('Cancelled', 'AbortError'))
            : Promise.resolve()
          : realClock.wait(ms * this.speed, signal),
    };
    this.writer = new TextWriter(
      this.buffer,
      clock,
      () => this.refresh(),
      () => PACE[this.settings.textSpeed],
      (on, cadence, dim, inverse) =>
        this.audio.typing(
          !on
            ? null
            : inverse
              ? 'other'
              : dim
                ? 'anderson'
                : cadence === 'voice'
                  ? 'assistant'
                  : 'system',
        ),
    );
    this.engine = new GameEngine(
      (event, signal) => this.event(event, signal),
      this.model,
      () => {
        if (this.engine.state.phase !== 'cold_boot') this.settings.bootCompleted = true;
        recordArchive(this.archive, this.engine.state, this.engine.portrait.seen);
        this.persist();
        this.refresh();
      },
      clock,
      saved?.game,
    );
    // Nothing moves on the night until the operator resumes it or begins a new one.
    this.engine.freeze();
    this.model.forceMock ||= this.settings.model === 'off';
    this.shellProgram = new ShellProgram({
      buffer: this.buffer,
      input: this.input,
      engine: () => this.engine,
      typed: (kind) => this.audio.key(kind),
      // F2 on an ended night: the opening, then a night like the last one (guided or not).
      newNight: () => {
        this.menu.open(new OpeningPage(this.menu, () => this.startNight()));
        this.showMenu();
      },
      refresh: () => this.refresh(),
    });
    this.host.push(this.shellProgram);
    // Every page the player sees is read for clues: their words turn red and count as found.
    this.host.decorate = (screen) => this.cluesShown(markClues(screen.cells));
    this.menu = new MenuProgram(this.menuHost());
    this.menuDisplay.push(this.menu);
    this.menuDisplay.decorate = (screen) => void markClues(screen.cells);
    document.addEventListener('keydown', this.keydown);
    document.addEventListener('paste', this.paste);
    document.addEventListener('pointerdown', this.pointer);
    document.addEventListener('pointermove', this.mouse);
    document.addEventListener('contextmenu', this.contextmenu);
    if (this.settings.warningSeen) this.openTitle();
    else this.screen = 'warning';
    this.makeOverlay();
    this.frame = requestAnimationFrame(this.render);
    this.canvas.focus({ preventScroll: true });
    if (config.developer) {
      (window as unknown as { __signal91: unknown }).__signal91 = {
        snapshot: () => ({
          phase: this.engine.state.phase,
          state: structuredClone(this.engine.state),
          text: this.buffer.text,
          screenText: this.host.screen.text,
          scrollback: this.buffer.scrollback.slice(),
          prompt: this.engine.prompt,
          busy: this.engine.busy,
          canInput: this.engine.canInput,
          restartReady: this.engine.restartReady,
          model: this.engine.model.status,
          screen: this.screen,
          menuText: this.screen === 'menu' ? this.menuDisplay.screen.text : '',
          strip: this.stripText,
          settings: { ...this.settings },
          redCells: this.host.screen.cells.filter((c) => c.palette === 'red').length,
          renderer: this.crt.status,
          raster: { ...this.crt.raster },
          fps: this.frames.length
            ? 1000 / (this.frames.reduce((a, b) => a + b, 0) / this.frames.length)
            : 0,
          p95: this.frames.length
            ? [...this.frames].sort((a, b) => a - b)[Math.floor(this.frames.length * 0.95)]
            : 0,
          saveFault: this.saveFault,
        }),
        setSpeed: (value: number) => {
          this.speed = Math.max(0, Math.min(5, value));
        },
        restart: () => {
          this.startNight();
          return Promise.resolve();
        },
        raw: (enabled: boolean) => {
          this.crt.preset.raw = enabled;
        },
        // For tests of the danger: set her suspicion, and let night-time minutes pass at once.
        suspect: (value: number) => {
          this.engine.state.suspicion = Math.max(0, Math.min(100, value));
        },
        skip: (seconds: number) => {
          this.engine.state.fictionalClockSeconds += Math.max(0, seconds);
        },
        // One of her small signs, now; the backup cell's charge (0 ends the night).
        sign: (kind: Sign) => this.engine.sign(kind),
        cell: (value: number) => {
          this.engine.machine.state.cell = Math.max(0, Math.min(100, value));
        },
        // Plays a sound effect; the last cues asked for, newest last.
        cue: (name: Cue) => this.audio.cue(name),
        sounds: () => this.audio.played.slice(),
        // Plays one of the clips in the face with its voice (the channel must be open to see it).
        clip: async (name: VideoName) => {
          this.engine.portrait.play(await loadVideo(name), performance.now());
          void this.audio.voice(name);
        },
        charset: () => {
          this.started = true;
          this.engine.thaw();
          this.screen = 'terminal';
          this.host.push(new CharsetProgram((program) => this.host.exit(program)));
        },
      };
    }
    this.refresh();
  }
  // ----- the menus -----
  /** What the menus may do to the rest of the game. */
  private menuHost(): MenuHost {
    const settings = () => this.settings;
    return {
      get settings() {
        return settings();
      },
      changed: () => {
        this.audio.update();
        this.persist();
      },
      summary: () => this.summary(),
      resume: () => this.resumeNight(),
      newNight: (guided) => this.startNight(guided),
      // The night in progress (a saved one included) has its own choice; none without a night.
      guidance: () =>
        this.summary().kind === 'progress' ? !this.engine.state.flags.unguided : null,
      setGuidance: (on) => {
        if (on) delete this.engine.state.flags.unguided;
        else this.engine.state.flags.unguided = true;
        this.settings.guided = on;
        this.persist();
      },
      exitToTitle: () => {
        this.persist();
        this.openTitle();
      },
      close: () => this.closeMenu(),
      powerOff: () => void this.powerOff(),
      fullscreen: () => void this.fullscreen(),
      sound: (kind, rate) => this.audio.cue(kind, { rate }),
      underlying: () => this.host.screen.cells,
      model: () => this.modelStatus(),
      selectModel: (choice) => this.selectModel(choice),
      manual: () => manualSheets(this.engine.shell),
      archive: () => this.archive,
      clues: () => ({
        entries: (this.engine.state.clueOrder ?? []).flatMap((id) => {
          const item = clue(id);
          if (!item) return [];
          return [
            {
              phrase: item.phrases[0],
              title: item.title,
              where: item.where,
              tellHer: !!item.tell && !this.engine.state.flags['told:' + id],
            },
          ];
        }),
        total: CLUES.length,
      }),
      eraseArchive: () => {
        this.archive = emptyArchive();
        this.engine.portrait.seen.clear();
        this.persist();
      },
    };
  }
  /** Clues that were just on screen; new ones flash on the strip. */
  private cluesShown(ids: string[]) {
    if (!ids.length || !this.started) return;
    const fresh = this.engine.discover(ids);
    if (!fresh.length) return;
    const title = clue(fresh[fresh.length - 1])!.title.toUpperCase();
    this.flash = { text: 'NEW CLUE: ' + title, until: performance.now() + 4000 };
    this.audio.cue('clue');
  }
  /**
   * The night's sounds that follow its state, about once a second: the ceiling camera turning
   * as her light changes, a new task, the cell running low, the building's air and the units
   * moving in the corridor.
   */
  private listen() {
    const status = this.started ? this.engine.status() : null;
    this.audio.hold('air', !!status?.air);
    this.audio.chatter('corridor', status?.camera === 'TRACKING' && !!status.robots);
    if (!status) return;
    const heard = this.heard;
    this.heard = {
      camera: status.camera,
      task: status.task,
      cell: status.cell,
      tally: heard?.tally || status.camera !== 'OFF',
    };
    // The first look after a start or a resume only takes note.
    if (!heard) return;
    const order = ['OFF', 'WATCHING', 'RECORDING', 'TRACKING'];
    const rise = order.indexOf(status.camera) - order.indexOf(heard.camera);
    if (rise > 0) {
      // The camera in the ceiling turns to the operator; its tally light comes on the first time.
      if (!heard.tally) this.audio.cue('light');
      this.audio.run('servo', status.camera === 'TRACKING' ? 7 : 4, 0.09, {}, 0.25);
      if (status.camera === 'RECORDING') this.audio.cue('cam-step', { delay: 0.9 });
    } else if (rise < 0) this.audio.cue('servo', { rate: 0.8 });
    if (status.task !== heard.task) this.audio.cue('task');
    for (const mark of [25, 10, 5])
      if (heard.cell > mark && status.cell <= mark)
        this.audio.run('cell-low', mark === 5 ? 3 : 2, 0.3);
  }
  /** The strip on the monitor frame: the task, the clue count, the cell, the camera. */
  private updateStrip(now: number) {
    const playing = this.started && this.screen !== 'menu' && this.screen !== 'warning';
    let task = 'AEGIS OPERATOR DISPLAY M-88',
      info = '',
      keys = '',
      mode = 'idle';
    if (playing) {
      const status = this.engine.status();
      const flashing = !!this.flash && now < this.flash.until;
      // The TASK line only for a night that asked for it; a new clue still flashes.
      task = flashing ? this.flash!.text : status.guided ? 'TASK: ' + status.task : '';
      info = `CLUES ${status.clues}/${status.total}   CELL ${status.cell}%   CAMERA: ${status.camera}`;
      keys = this.escapeHint();
      mode = flashing ? 'flash' : '';
    }
    const key = [task, keys, info, mode].join('|');
    if (key === this.stripText) return;
    this.stripText = key;
    const strip = document.querySelector('.strip');
    if (!strip) return;
    strip.className = 'strip' + (mode ? ' ' + mode : '');
    document.getElementById('strip-task')!.textContent = task;
    document.getElementById('strip-keys')!.textContent = keys;
    document.getElementById('strip-info')!.textContent = info;
  }
  /** What Esc does from here, for the strip: it always takes the player back a step. */
  private escapeHint() {
    if (this.screen === 'scrollback') return 'ESC: BACK TO THE PROMPT';
    if (this.host.active !== this.shellProgram) return 'ESC: LEAVE ' + this.programTitle;
    if (this.engine.state.connected) return 'ESC: CLOSE THE CHANNEL';
    return 'ESC: MENU';
  }
  /** The saved night as the title describes it. */
  private summary(): ShiftSummary {
    const state = this.engine.state;
    if (state.phase === 'terminated')
      return {
        kind: 'ended',
        time: '',
        cell: 0,
        status: '',
        ending: state.ending === 'purge' && state.flags.silentPurge ? 'silent' : state.ending,
      };
    if (!this.started && !(this.restored && state.phase !== 'cold_boot'))
      return { kind: 'none', time: '', cell: 0, status: '' };
    const shift = this.engine.shift();
    const status = state.connected
      ? 'CHANNEL 04 OPEN'
      : state.flags.anomaly
        ? 'RECOVERY PENDING'
        : state.flags.contact
          ? 'CONTACT MADE'
          : 'AT THE CONSOLE';
    return { kind: 'progress', time: shift.time, cell: shift.cell, status };
  }
  private showMenu() {
    this.engine.freeze();
    this.screen = 'menu';
    this.refresh();
  }
  private openTitle() {
    this.menu.open(new TitlePage(this.menu));
    this.showMenu();
  }
  /** Esc at the prompt: the night stops while the pause menu is open. */
  private pause() {
    this.menu.open(new PausePage(this.menu));
    this.audio.cue('open');
    this.showMenu();
  }
  private closeMenu() {
    if (!this.started) return this.openTitle();
    this.audio.cue('close');
    this.screen = 'terminal';
    this.engine.thaw();
    this.refresh();
  }
  private resumeNight() {
    this.screen = 'terminal';
    this.engine.thaw();
    if (!this.started) {
      this.started = true;
      void this.engine.start(this.restored).then(() => this.refresh());
    }
    this.refresh();
  }
  /** A new night; `guided` puts the TASK line on the strip (F2 keeps the night's choice). */
  private startNight(guided = !this.engine.state.flags.unguided) {
    this.started = true;
    this.heard = null;
    this.restored = false;
    this.screen = 'terminal';
    this.scrollOffset = 0;
    this.input.reset();
    this.engine.thaw();
    void this.engine.restart(guided).then(() => this.refresh());
    this.refresh();
  }
  private async powerOff() {
    this.persist();
    // The supply runs down, then the strip's switch.
    this.audio.cue('power-down');
    this.audio.cue('strip', { delay: 0.55 });
    this.audio.power(false);
    await Promise.all([this.saved, new Promise((done) => setTimeout(done, 900))]);
    if (isDesktop) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow()
        .close()
        .catch(() => undefined);
      return;
    }
    this.menu.open(new OffPage(() => this.openTitle()));
  }
  private modelStatus(): ModelStatus {
    const choice = this.settings.model;
    const server = this.server;
    const installed = (server?.installed ?? []) as ModelChoice[];
    const choices: ModelChoice[] = isDesktop ? ['auto', ...installed, 'off'] : ['auto', 'off'];
    if (choice === 'off') return { choice, choices, state: 'off' };
    const live = this.model.status === 'live';
    // The browser build talks to a separately started server, if there is one.
    if (!server)
      return {
        choice,
        choices,
        state: live ? 'external' : this.model.status === 'unchecked' ? 'checking' : 'missing',
      };
    if (!server.owned)
      return {
        choice,
        choices,
        state: live ? 'external' : installed.length ? 'checking' : 'missing',
      };
    if (server.active)
      return {
        choice,
        choices,
        state: server.ready ? 'ready' : 'loading',
        running: MODEL_NAMES[server.active as ModelChoice],
      };
    return { choice, choices, state: 'failed' };
  }
  private selectModel(choice: ModelChoice) {
    this.settings.model = choice;
    this.model.forceMock = choice === 'off';
    this.model.status = 'unchecked';
    this.persist();
    void selectModel(choice).then(() => this.checkModel());
  }
  private checkModel() {
    void modelState().then((state) => (this.server = state));
    if (!this.model.forceMock)
      void this.model.health(AbortSignal.timeout(2500)).catch(() => undefined);
  }
  /** While a menu shows the model's state, ask the server how it is every few seconds. */
  private watchModel(now: number) {
    if (this.screen !== 'menu' || now - this.modelCheck < 2000) return;
    this.modelCheck = now;
    this.checkModel();
  }
  private persist() {
    if (!this.engine) return;
    const json = JSON.stringify({
      version: 2,
      game: this.engine.state,
      settings: this.settings,
      archive: this.archive,
    });
    this.saved = this.saved
      .catch(() => undefined)
      .then(() => writeSave(json))
      .catch(() => {
        this.saveFault = true;
        this.refresh();
      });
  }
  private async event(event: TerminalEvent, signal?: AbortSignal) {
    if (this.disposed) return;
    if (event.type === 'write')
      await this.writer.write(event.text, event.cadence, signal, event.dim, event.other);
    if (event.type === 'clear') {
      this.buffer.clear();
      this.refresh();
    }
    if (event.type === 'fault') {
      // The picture loses sync with a burst of static.
      this.crt.fault(event.duration);
      this.audio.cue('scratch', { level: 0.8 });
    }
    if (event.type === 'voice') void this.audio.voice(event.name);
    if (event.type === 'intrude') {
      this.host.overlay = { text: event.text, until: performance.now() + event.ms };
      this.audio.effect('sync');
    }
    if (event.type === 'line') this.audio.line(event.sound, event.digits);
    if (event.type === 'cue')
      this.audio.run(
        event.name,
        event.count ?? 1,
        event.gap ?? 0,
        { level: event.level, rate: event.rate },
        event.delay ?? 0,
      );
    if (event.type === 'loop') this.audio.hold(event.name, event.on);
    if (event.type === 'chatter') this.audio.burst(event.kind, event.ms);
    if (event.type === 'power') this.audio.power(event.on);
    if (event.type === 'printer') this.audio.printer();
    if (event.type === 'brownout') {
      // The supply sags: the tube warms up again and the hum drops for a moment.
      this.crt.rewarm();
      this.audio.brownout();
    }
    if (event.type === 'credits') {
      // The night is over: dark, then the credits, then the title.
      this.menu.open(new EndingCreditsPage(this.menu));
      this.showMenu();
    }
    if (event.type === 'beep') {
      this.audio.effect(event.tone);
      if (event.tone === 'disk') {
        document.querySelector('.lamp.disk')?.classList.add('active');
        clearTimeout(this.diskTimer);
        this.diskTimer = window.setTimeout(
          () => document.querySelector('.lamp.disk')?.classList.remove('active'),
          400,
        );
      }
    }
    if (event.type === 'halt') this.closeProgram?.();
    if (event.type === 'program') this.programTitle = PROGRAM_TITLES[event.name];
    if (event.type === 'program')
      await new Promise<void>((done) => {
        const system = {
          ...event.system,
          exit: () => {
            this.host.exit(program);
            this.closeProgram = null;
            this.refresh();
            done();
          },
        };
        this.closeProgram = system.exit;
        const program =
          event.name === 'WPRO'
            ? new WriteProProgram(system, event.path)
            : event.name === 'CALC'
              ? new CalcPlanProgram(system, event.path)
              : event.name === 'COMLINK'
                ? new ComLinkProgram(system, event.path)
                : event.name === 'CAMS'
                  ? new CamsProgram(system, event.path)
                  : new EditProgram(system, event.path);
        this.host.push(program);
      });
    if (event.type === 'config') {
      this.menu.open(new ConfigurationPage(this.menu));
      this.showMenu();
    }
  }
  private refresh() {
    if (!this.engine) return;
    this.canvas.dataset.phase = this.engine.state.phase;
    const transcript = document.getElementById('terminal-transcript');
    if (transcript)
      transcript.textContent =
        this.screen === 'menu'
          ? this.menuDisplay.screen.text
          : this.screen === 'terminal' && this.host.active !== this.shellProgram
            ? this.host.screen.text
            : this.screen === 'terminal'
              ? this.buffer.text +
                '\n' +
                (this.engine.canInput
                  ? this.engine.prompt +
                    (this.engine.secretInput
                      ? '*'.repeat(this.input.value.length)
                      : this.input.value)
                  : '')
              : this.overlay.text;
  }
  /** Closes the program the engine started (the bus died under it). */
  private closeProgram: (() => void) | null = null;
  private pulseAt = 0;
  private render = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
    if (document.hidden) {
      this.frameLast = 0;
      return;
    }
    if (this.frameLast) {
      this.frames.push(now - this.frameLast);
      if (this.frames.length > 180) this.frames.shift();
    }
    this.frameLast = now;
    // The engine's clock, the backup cell and timed story events move about once a second
    // (not while a menu has stopped the night).
    if (now - this.pulseAt >= 1000) {
      this.pulseAt = now;
      this.engine.pulse();
      this.listen();
    }
    // While she composes a reply, the bus's relays chatter.
    this.audio.chatter('thinking', this.started && this.engine.typing);
    const blink = this.engine.state.phase === 'terminated' || Math.floor(now / 530) % 2 === 0;
    // With reduced flicker, process 04's face holds still when the picture tears.
    this.engine.portrait.steady = this.settings.reducedFlicker;
    // System screens (advisory, configuration, scrollback) sit above whatever program runs.
    // The active program repaints first, so the cursor drawn belongs to this frame.
    this.watchModel(now);
    this.updateStrip(now);
    const page =
      this.screen === 'terminal'
        ? this.host.frame()
        : this.screen === 'menu'
          ? 'menu:' + this.menuDisplay.frame()
          : '';
    if (
      page !== this.transcriptPage &&
      (this.screen === 'menu' || this.host.active !== this.shellProgram)
    ) {
      this.transcriptPage = page;
      this.refresh();
    }
    const dirty =
      this.screen === 'terminal'
        ? this.renderer.draw(
            this.host.screen.cells,
            this.host.screen.cursor,
            blink,
            page,
            this.host.screen.picture,
            this.host.screen.fine,
          )
        : this.screen === 'menu'
          ? this.renderer.draw(
              this.menuDisplay.screen.cells,
              null,
              blink,
              page,
              null,
              this.menuDisplay.screen.fine,
            )
          : this.renderer.draw(
              this.overlay.cells,
              null,
              blink,
              this.screen + ':' + this.overlay.revision,
            );
    this.crt.draw(this.renderer.plane, dirty, this.settings, now);
  };
  private pointer = () => {
    void this.audio.start();
  };
  private mouse = () => {
    document.body.classList.remove('keyboard-active');
    clearTimeout(this.mouseTimer);
  };
  private contextmenu = (event: Event) => event.preventDefault();
  private paste = (event: ClipboardEvent) => {
    if (this.screen !== 'terminal') return;
    if (this.host.paste(event.clipboardData?.getData('text') || '')) event.preventDefault();
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.metaKey || (event.altKey && event.key === 'F4')) return;
    const letter = event.key.toLowerCase();
    // Clipboard paste and a developer's hard reload keep their browser meaning.
    if (
      (event.ctrlKey && letter === 'v') ||
      (event.shiftKey && event.key === 'Insert') ||
      (event.ctrlKey && event.shiftKey && letter === 'r')
    )
      return;
    // Every other key belongs to the terminal. An unhandled F10 or Alt would also put the
    // window into its menu mode and swallow the keys that follow.
    event.preventDefault();
    if (event.ctrlKey && ['+', '-', '=', '0'].includes(event.key)) return;
    void this.audio.start();
    clearTimeout(this.mouseTimer);
    this.mouseTimer = window.setTimeout(() => document.body.classList.add('keyboard-active'), 2000);
    const atShell = this.host.active === this.shellProgram;
    // Programs use F11 and F12 themselves (Reveal Codes, Block); Alt+Enter works everywhere.
    if ((event.key === 'F11' && atShell) || (event.altKey && event.key === 'Enter')) {
      void this.fullscreen();
      return;
    }
    if (event.key === 'F12' && event.ctrlKey && config.developer) {
      this.screen = this.screen === 'developer' ? 'terminal' : 'developer';
      this.makeOverlay();
      return;
    }
    if (this.screen === 'menu') {
      this.menu.key(keyEvent(event));
      return;
    }
    if (event.key === 'Escape' && this.screen !== 'terminal') {
      this.screen = 'terminal';
      this.scrollOffset = 0;
      this.makeOverlay();
      return;
    }
    if (event.key === 'Escape' && atShell && this.screen === 'terminal') {
      // On later nights Esc skips the boot. In an open channel it closes the channel (the
      // next Esc pauses); otherwise it pauses the night.
      if (this.engine.state.phase === 'cold_boot' && this.settings.bootCompleted)
        this.engine.bootFast = true;
      else if (this.engine.state.connected && this.engine.canInput)
        void this.engine.submit('/EXIT').then(() => this.refresh());
      else this.pause();
      return;
    }
    if (this.screen === 'warning') {
      if (event.key === 'Enter' || event.key.toLowerCase() === 'r') {
        if (event.key.toLowerCase() === 'r') this.settings.reducedFlicker = true;
        this.audio.cue('yes');
        this.settings.warningSeen = true;
        this.persist();
        this.openTitle();
      }
      return;
    }
    if (this.screen === 'developer') {
      this.menuKey(event.key);
      return;
    }
    if (atShell && (event.key === 'PageUp' || event.key === 'PageDown')) {
      const before = this.scrollOffset;
      this.scrollOffset = Math.max(
        0,
        Math.min(
          this.buffer.scrollback.length,
          this.scrollOffset + (event.key === 'PageUp' ? 20 : -20),
        ),
      );
      this.screen = this.scrollOffset ? 'scrollback' : 'terminal';
      if (this.scrollOffset !== before) this.audio.cue('scroll');
      this.makeOverlay();
      return;
    }
    if (this.screen === 'scrollback') {
      this.screen = 'terminal';
      this.scrollOffset = 0;
    }
    // Programs click as the prompt does; function keys and Alt combinations land heavier.
    if (!atShell && !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key))
      this.audio.key(
        /^F\d+$/.test(event.key) || event.altKey
          ? 'function'
          : event.key === 'Enter'
            ? 'enter'
            : 'key',
      );
    this.host.key(keyEvent(event));
  };
  /** The engineering page (Ctrl+F12 in development builds). */
  private menuKey(key: string) {
    const count = 8;
    if (key === 'ArrowUp') this.selection = (this.selection + count - 1) % count;
    if (key === 'ArrowDown') this.selection = (this.selection + 1) % count;
    const amount =
      key === 'ArrowLeft' ? -0.1 : ['ArrowRight', 'Enter', ' '].includes(key) ? 0.1 : 0;
    // The sound check: Left and Right choose a cue and play it, Enter plays it again.
    const cues = Object.keys(CUES) as Cue[];
    if (this.selection === 7 && amount) {
      if (key === 'ArrowLeft' || key === 'ArrowRight')
        this.soundCheck = (this.soundCheck + (amount < 0 ? cues.length - 1 : 1)) % cues.length;
      const cue = cues[this.soundCheck];
      if (CUES[cue].loop) {
        this.audio.hold(cue, true);
        window.setTimeout(() => this.audio.hold(cue, false), 3000);
      } else this.audio.cue(cue);
    } else if (amount) {
      const name = (
        ['curvature', 'scanlines', 'noise', 'vignette', 'persistence', 'raw', 'speed'] as const
      )[this.selection];
      if (name === 'raw') this.crt.preset.raw = !this.crt.preset.raw;
      else if (name === 'speed') this.speed = this.speed === 0 ? 1 : 0;
      else
        this.crt.preset[name] = Math.max(
          0,
          Math.min(
            1,
            this.crt.preset[name] + amount * (name === 'curvature' || name === 'noise' ? 0.05 : 1),
          ),
        );
    }
    if (key === 'F2') return this.startNight();
    this.makeOverlay();
  }
  private makeOverlay() {
    this.overlay = new TerminalBuffer();
    const bar = '----------------------------------------------------------------';
    if (this.screen === 'warning')
      this.overlay.write(
        '\r\n\r\n  AEGIS SYSTEMS DIVISION\r\n  OPERATOR DISPLAY M-88\r\n\r\n  ' +
          bar +
          '\r\n\r\n  DISPLAY ADVISORY\r\n\r\n  This terminal simulates CRT flicker and brief signal faults.\r\n  A reduced-flicker configuration is available.\r\n\r\n  Sound begins with your first key press.\r\n  Low volume is recommended.\r\n\r\n  ENTER   INITIALIZE TERMINAL\r\n  R       INITIALIZE WITH REDUCED FLICKER\r\n\r\n  ' +
          bar +
          '\r\n  LOCAL OPERATION ONLY. NO SITE CARRIER.',
      );
    if (this.screen === 'developer') {
      const p = this.crt.preset;
      const rows = [
        ['CURVATURE', p.curvature.toFixed(3)],
        ['SCANLINES', p.scanlines.toFixed(2)],
        ['NOISE', p.noise.toFixed(3)],
        ['VIGNETTE', p.vignette.toFixed(2)],
        ['PERSISTENCE', p.persistence.toFixed(2)],
        ['RAW FRAMEBUFFER', p.raw ? 'ON' : 'OFF'],
        ['INSTANT TIMING', this.speed === 0 ? 'ON' : 'OFF'],
        ['SOUND CHECK', (Object.keys(CUES)[this.soundCheck] ?? '').toUpperCase()],
      ];
      this.overlay.write(
        '  AEGIS / ENGINEERING ACCESS\r\n  ' +
          bar +
          '\r\n  PHASE: ' +
          this.engine.state.phase.toUpperCase() +
          '\r\n  MODEL: ' +
          this.engine.model.status.toUpperCase() +
          '\r\n  FRAME: ' +
          (this.frames.at(-1) || 0).toFixed(1) +
          ' MS / 720 X 400\r\n  SAVE: ' +
          (this.saveFault ? 'UNAVAILABLE' : 'LOCAL') +
          '\r\n\r\n' +
          rows
            .map(
              ([label, value], i) =>
                '  ' + (i === this.selection ? '> ' : '  ') + label.padEnd(29) + value,
            )
            .join('\r\n\r\n') +
          '\r\n\r\n  F2 RESET   F12 RETURN',
      );
    }
    if (this.screen === 'scrollback') {
      const history = [...this.buffer.scrollback, ...this.buffer.text.split('\n')];
      const end = history.length - this.scrollOffset;
      this.overlay.write(
        history.slice(Math.max(0, end - 24), end).join('\r\n') +
          '\r\n[SCROLLBACK / PAGE DOWN TO RETURN]',
      );
      // Paging back counts as seeing: clues that scrolled past too fast turn red here.
      this.cluesShown(markClues(this.overlay.cells));
    }
    this.refresh();
  }
  private percent(value: number) {
    return String(Math.round(value * 100)).padStart(3) + ' %';
  }
  private async fullscreen() {
    try {
      if (isDesktop) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const w = getCurrentWindow();
        const full = !(await w.isFullscreen());
        this.audio.cue(full ? 'rise' : 'fall');
        await w.setFullscreen(full);
      } else if (document.fullscreenElement) {
        this.audio.cue('fall');
        await document.exitFullscreen();
      } else {
        this.audio.cue('rise');
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* Window managers may refuse fullscreen; the terminal stays usable. */
    }
  }
  async dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.engine?.dispose();
    this.crt?.dispose();
    await this.audio.dispose();
    clearTimeout(this.mouseTimer);
    clearTimeout(this.diskTimer);
    document.removeEventListener('keydown', this.keydown);
    document.removeEventListener('paste', this.paste);
    document.removeEventListener('pointerdown', this.pointer);
    document.removeEventListener('pointermove', this.mouse);
    document.removeEventListener('contextmenu', this.contextmenu);
  }
}
