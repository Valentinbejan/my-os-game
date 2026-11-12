import type { Settings } from '../game/types';
import { CUES, type Cue } from './cues';
export type { Cue } from './cues';
/** Which voice is typing: each has its own soft chatter under the text. */
export type Typist = 'assistant' | 'other' | 'anderson' | 'system';
/**
 * Sounds that repeat at random while they run: the bus's relays (in a burst, or for as long
 * as she composes a reply), static under Anderson, the units in the corridor.
 */
export type Chatter = 'relays' | 'thinking' | 'static' | 'robots' | 'corridor';
/**
 * The next variant to play out of `count`: any of them at first, never the one just played.
 */
export function pickVariant(count: number, last: number, random = Math.random) {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.floor(random() * count);
  const n = Math.floor(random() * (count - 1));
  return n >= last ? n + 1 : n;
}
/** Played at once, then the rest in the background. */
const EARLY: Cue[] = ['key', 'fkey', 'disk', 'move', 'ok', 'back', 'open', 'close', 'relay'];
const CHATTER: Record<Chatter, { cues: Cue[]; gap: [number, number]; level: number }> = {
  relays: { cues: ['tick'], gap: [35, 220], level: 1 },
  thinking: { cues: ['tick'], gap: [45, 320], level: 0.8 },
  static: { cues: ['scratch'], gap: [120, 380], level: 0.35 },
  robots: { cues: ['servo', 'servo', 'tool'], gap: [140, 900], level: 0.45 },
  corridor: { cues: ['servo', 'servo', 'tool'], gap: [2500, 9000], level: 0.25 },
};
/**
 * The workstation's sound: the mains hum and fans, the room, the keys, the drive, her
 * voice lines and every effect (the cues in cues.ts, built from the sound packs by
 * scripts/build-sounds.mjs). Nothing plays until a key or click starts it.
 */
export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private humGain?: GainNode;
  /** The room's loops (fans, air), which follow the ROOM slider with the hum. */
  private roomGain?: GainNode;
  private samples = new Map<string, AudioBuffer>();
  private variants = new Map<Cue, AudioBuffer[]>();
  private loading = new Map<Cue, Promise<void>>();
  private last = new Map<Cue, number>();
  private loops = new Map<Cue, { source: AudioBufferSourceNode; gain: GainNode; level: number }>();
  private chatters = new Map<Chatter, number>();
  private typist: Typist | null = null;
  /** The power is on: the hum and the room run. */
  private powered = true;
  /** The last cues asked for, newest last (for the developer tools and the tests). */
  readonly played: string[] = [];
  constructor(private settings: () => Settings) {}
  async start() {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.humGain = this.context.createGain();
    this.humGain.connect(this.master);
    this.roomGain = this.context.createGain();
    this.roomGain.connect(this.master);
    for (const [frequency, level] of [
      [50, 0.55],
      [100, 0.18],
      [150, 0.08],
    ]) {
      const osc = this.context.createOscillator();
      osc.frequency.value = frequency;
      const gain = this.context.createGain();
      gain.gain.value = level;
      osc.connect(gain);
      gain.connect(this.humGain);
      osc.start();
    }
    const noise = this.context.createBuffer(
      1,
      this.context.sampleRate * 3,
      this.context.sampleRate,
    );
    const channel = noise.getChannelData(0);
    for (let n = 0; n < channel.length; n++) channel[n] = (Math.random() * 2 - 1) * 0.12;
    const fan = this.context.createBufferSource();
    fan.buffer = noise;
    fan.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 440;
    fan.connect(filter);
    filter.connect(this.humGain);
    fan.start();
    this.update();
    await Promise.all(EARLY.map((cue) => this.load(cue)));
    if (this.powered) this.hold('room', true);
    // The rest arrive while the player reads the title.
    void (async () => {
      for (const cue of Object.keys(CUES) as Cue[]) await this.load(cue);
    })();
  }
  /** Fetches and decodes a cue's variants, once. A variant that fails is left out. */
  private load(cue: Cue) {
    let pending = this.loading.get(cue);
    if (!pending) {
      pending = (async () => {
        const context = this.context!;
        const buffers = await Promise.all(
          Array.from({ length: CUES[cue].variants }, async (_, n) => {
            try {
              const response = await fetch(
                `/audio/sfx/${cue}-${String(n + 1).padStart(2, '0')}.ogg`,
              );
              if (!response.ok) return null;
              return await context.decodeAudioData(await response.arrayBuffer());
            } catch {
              return null;
            }
          }),
        );
        this.variants.set(
          cue,
          buffers.filter((buffer): buffer is AudioBuffer => !!buffer),
        );
      })();
      this.loading.set(cue, pending);
    }
    return pending;
  }
  /** How loud a cue plays: its own level times its slider. */
  private volume(cue: Cue) {
    const settings = this.settings();
    const { level, group } = CUES[cue];
    return (
      level * (group === 'keyboard' ? settings.keyboard : group === 'room' ? 1 : settings.effects)
    );
  }
  /**
   * Plays one variant of a cue, `delay` seconds from now, a little off its pitch each time.
   * `rate` shifts it further (below 1 is lower and slower).
   */
  cue(cue: Cue, options: { level?: number; rate?: number; delay?: number } = {}) {
    this.played.push(cue);
    if (this.played.length > 50) this.played.shift();
    this.sound(cue, options);
  }
  /** Plays a cue without recording it (the chatters' many small ticks). */
  private sound(cue: Cue, options: { level?: number; rate?: number; delay?: number } = {}) {
    if (!this.context || !this.master) return;
    const buffers = this.variants.get(cue);
    if (!buffers) {
      // Not loaded yet: it plays as soon as it is.
      void this.load(cue).then(() => {
        if (this.variants.get(cue)?.length) this.play(cue, options);
      });
      return;
    }
    if (buffers.length) this.play(cue, options);
    else this.fallback(cue);
  }
  private play(cue: Cue, { level = 1, rate = 1, delay = 0 }) {
    const context = this.context!;
    const buffers = this.variants.get(cue)!;
    const n = pickVariant(buffers.length, this.last.get(cue) ?? -1);
    this.last.set(cue, n);
    const source = context.createBufferSource();
    source.buffer = buffers[n];
    source.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const gain = context.createGain();
    gain.gain.value = this.volume(cue) * level;
    source.connect(gain);
    gain.connect(this.master!);
    source.start(context.currentTime + delay);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
  /** A synthesised stand-in when a cue's files could not load. */
  private fallback(cue: Cue) {
    const volume = this.settings().effects;
    if (cue === 'key' || cue === 'fkey')
      this.tone(1800, 0.013, this.settings().keyboard * 0.024, 'triangle');
    else if (cue === 'bad' || cue === 'beep' || cue === 'denied' || cue === 'error')
      this.tone(220, 0.12, volume * 0.06);
    else if (
      cue === 'ok' ||
      cue === 'yes' ||
      cue === 'saved' ||
      cue === 'granted' ||
      cue === 'clue'
    )
      this.tone(880, 0.09, volume * 0.08);
    else if (cue === 'relay' || cue === 'headset') this.tone(120, 0.04, volume * 0.08, 'triangle');
    else if (cue === 'disk') this.tone(340, 0.055, volume * 0.05);
  }
  /** Starts or stops a looping cue, fading it in and out. */
  loop(cue: Cue, on: boolean, level = 1) {
    if (!this.context || !this.master) return;
    const context = this.context;
    const running = this.loops.get(cue);
    const now = context.currentTime;
    if (!on) {
      if (!running) return;
      this.loops.delete(cue);
      running.gain.gain.setTargetAtTime(0, now, 0.08);
      running.source.stop(now + 0.5);
      return;
    }
    if (running) {
      running.level = level;
      running.gain.gain.setTargetAtTime(this.volume(cue) * level, now, 0.1);
      return;
    }
    const buffers = this.variants.get(cue);
    if (!buffers?.length) {
      void this.load(cue).then(() => {
        // Still wanted once it has loaded?
        if (this.variants.get(cue)?.length && this.wanted(cue)) this.loop(cue, true, level);
      });
      return;
    }
    const source = context.createBufferSource();
    source.buffer = buffers[0];
    source.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(this.volume(cue) * level, now, 0.1);
    source.connect(gain);
    gain.connect(CUES[cue].group === 'room' ? this.roomGain! : this.master);
    source.start(now, Math.random() * buffers[0].duration);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    this.loops.set(cue, { source, gain, level });
  }
  /** What the loops should be doing right now, for a loop whose sound arrives late. */
  private wantedLoops = new Set<Cue>();
  private wanted(cue: Cue) {
    return this.wantedLoops.has(cue);
  }
  /** Loops the game asks for: remembered, so one that is still loading starts when it can. */
  hold(cue: Cue, on: boolean, level = 1) {
    if (on) this.wantedLoops.add(cue);
    else this.wantedLoops.delete(cue);
    this.loop(cue, on, level);
  }
  /** The chatter under typed text: one voice at a time, none when `who` is null. */
  typing(who: Typist | null) {
    if (who === this.typist) return;
    if (this.typist) this.hold(`typing-${this.typist}`, false);
    this.typist = who;
    if (who) this.hold(`typing-${who}`, true);
    this.chatter('static', who === 'anderson');
  }
  /** Starts or stops a chatter. */
  chatter(kind: Chatter, on: boolean) {
    if (!on) {
      clearTimeout(this.chatters.get(kind));
      this.chatters.delete(kind);
      return;
    }
    if (this.chatters.has(kind)) return;
    const { cues, gap, level } = CHATTER[kind];
    const next = () => {
      if (!this.chatters.has(kind)) return;
      this.sound(cues[Math.floor(Math.random() * cues.length)], {
        level,
        rate: kind === 'robots' || kind === 'corridor' ? 0.7 : 1,
      });
      this.chatters.set(kind, window.setTimeout(next, gap[0] + Math.random() * (gap[1] - gap[0])));
    };
    this.chatters.set(kind, window.setTimeout(next, gap[0]));
  }
  /** A chatter for a while, then quiet again. */
  burst(kind: Chatter, ms: number) {
    if (this.chatters.has(kind)) return;
    this.chatter(kind, true);
    window.setTimeout(() => this.chatter(kind, false), ms);
  }
  /**
   * A run of one cue, `count` times, `gap` seconds apart, starting `delay` seconds from now
   * (the camera's motor, the low-cell beeps).
   */
  run(
    cue: Cue,
    count: number,
    gap: number,
    options: { level?: number; rate?: number } = {},
    delay = 0,
  ) {
    for (let n = 0; n < count; n++)
      this.cue(cue, { level: options.level, rate: options.rate, delay: delay + n * gap });
  }
  /** The printer in the room runs a page by itself: the head, the last line, the paper bail. */
  printer() {
    this.played.push('printer');
    this.hold('printer', true);
    window.setTimeout(() => {
      this.hold('printer', false);
      this.cue('printer-end');
      this.cue('paper', { delay: 0.45 });
    }, 3200);
  }
  /** A dip in the supply: a switch clicks, the hum and the fans sag, then a relay catches. */
  brownout() {
    this.cue('light');
    this.cue('relay', { delay: 1.4 });
    if (!this.context || !this.humGain || !this.roomGain || !this.powered) return;
    const now = this.context.currentTime;
    const hum = this.settings().hum;
    for (const [gain, level] of [
      [this.humGain, hum * 0.0016],
      [this.roomGain, hum],
    ] as const) {
      gain.gain.setTargetAtTime(level * 0.2, now, 0.05);
      gain.gain.setTargetAtTime(level, now + 1.4, 0.3);
    }
  }
  /** The mains: the hum, the fans and the room come and go with the power. */
  power(on: boolean) {
    this.powered = on;
    this.update();
    if (on) this.hold('room', true);
    else for (const cue of [...this.wantedLoops]) this.hold(cue, false);
    if (!on) for (const kind of [...this.chatters.keys()]) this.chatter(kind, false);
  }
  /** A voice line from the clips, loaded the first time it plays. */
  async voice(name: string) {
    if (!this.context || !this.master) return;
    let buffer = this.samples.get('voice:' + name);
    if (!buffer) {
      try {
        const response = await fetch('/audio/voice/' + name + '.ogg');
        if (!response.ok) return;
        buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.samples.set('voice:' + name, buffer);
      } catch {
        return;
      }
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, 0.4 + this.settings().effects);
    source.connect(gain);
    gain.connect(this.master);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
  update() {
    if (!this.context || !this.master || !this.humGain || !this.roomGain) return;
    const settings = this.settings();
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.volume, now, 0.03);
    // When the power goes, the hum runs down over a second or so.
    this.humGain.gain.setTargetAtTime(
      this.powered ? settings.hum * 0.0016 : 0,
      now,
      this.powered ? 0.1 : 0.4,
    );
    this.roomGain.gain.setTargetAtTime(
      this.powered ? settings.hum : 0,
      now,
      this.powered ? 0.1 : 0.4,
    );
    for (const [cue, loop] of this.loops)
      loop.gain.gain.setTargetAtTime(this.volume(cue) * loop.level, now, 0.1);
  }
  private tone(
    frequency: number,
    duration: number,
    level: number,
    type: OscillatorType = 'square',
  ) {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain(),
      now = this.context.currentTime;
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(now + duration + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  /** A key on the keyboard; Enter and the function keys land heavier. */
  key(kind: 'key' | 'enter' | 'function' = 'key') {
    if (kind === 'function') this.cue('fkey');
    else this.cue('key', kind === 'enter' ? { rate: 0.86, level: 1.25 } : {});
  }
  /** The effects the engine has always asked for by name. */
  effect(kind: 'ok' | 'error' | 'relay' | 'disk' | 'sync') {
    if (kind === 'ok') this.cue('granted');
    if (kind === 'error') this.cue('bad');
    if (kind === 'relay') this.cue('relay');
    if (kind === 'disk') this.cue('disk');
    if (kind === 'sync') {
      // The picture tears: the line's low buzz and the glitch together.
      this.tone(90, 0.2, this.settings().effects * 0.035, 'sawtooth');
      this.cue('glitch');
      this.cue('scratch', { level: 0.6, delay: 0.04 });
    }
  }
  /** Two sine tones together (dial tone, DTMF, ringback, busy), starting `delay` s from now. */
  private dual(low: number, high: number, delay: number, duration: number, level: number) {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.01);
    gain.gain.setValueAtTime(level, start + duration - 0.01);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    gain.connect(this.master);
    for (const frequency of [low, high]) {
      const osc = this.context.createOscillator();
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration + 0.02);
      osc.onended = () => osc.disconnect();
    }
    window.setTimeout(() => gain.disconnect(), (delay + duration + 0.1) * 1000);
  }
  /** The answering modem's 2100 Hz tone, then the scrambled carriers of a 2400 bps handshake. */
  private handshake(level: number) {
    if (!this.context || !this.master) return;
    this.dual(2100, 2100, 0, 1.0, level * 0.5);
    const start = this.context.currentTime + 1.15;
    const length = 1.5;
    const noise = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * length),
      this.context.sampleRate,
    );
    const data = noise.getChannelData(0);
    for (let n = 0; n < data.length; n++) data[n] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    source.buffer = noise;
    const band = this.context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 1.2;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * 1.4, start + 0.05);
    gain.gain.setValueAtTime(level * 1.4, start + length - 0.1);
    gain.gain.linearRampToValueAtTime(0, start + length);
    source.connect(band);
    band.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.onended = () => {
      source.disconnect();
      band.disconnect();
      gain.disconnect();
    };
    this.dual(1200, 2400, 1.15, length, level * 0.25);
  }
  /** Phone-line sounds while COMLINK places a call. */
  line(
    sound: 'dialtone' | 'dtmf' | 'ringback' | 'busy' | 'handshake' | 'ring' | 'click',
    digits = '',
  ) {
    const level = this.settings().effects * 0.05;
    const dtmf: Record<string, [number, number]> = {
      '1': [697, 1209],
      '2': [697, 1336],
      '3': [697, 1477],
      '4': [770, 1209],
      '5': [770, 1336],
      '6': [770, 1477],
      '7': [852, 1209],
      '8': [852, 1336],
      '9': [852, 1477],
      '*': [941, 1209],
      '0': [941, 1336],
      '#': [941, 1477],
    };
    switch (sound) {
      case 'dialtone':
        return this.dual(350, 440, 0, 0.6, level);
      case 'dtmf':
        return [...digits].forEach((digit, n) => {
          const pair = dtmf[digit];
          if (pair) this.dual(pair[0], pair[1], n * 0.11, 0.07, level);
        });
      case 'ringback':
        return this.dual(440, 480, 0.2, 1.8, level * 0.6);
      case 'busy':
        for (let n = 0; n < 4; n++) this.dual(480, 620, n * 0.6, 0.3, level * 0.7);
        return;
      case 'handshake':
        return this.handshake(level);
      case 'ring':
        for (let n = 0; n < 2; n++) this.dual(440, 480, n * 0.5, 0.4, level);
        return;
      case 'click':
        return this.cue('headset');
    }
  }
  async dispose() {
    for (const kind of [...this.chatters.keys()]) this.chatter(kind, false);
    await this.context?.close();
  }
}
