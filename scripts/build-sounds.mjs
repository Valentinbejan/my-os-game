// Builds the game's sound effects from the packs in audio-effects/ and the six Owlish sounds
// already in public/audio/. Every source file becomes one variant of a cue: mono, 22.05 kHz,
// its silences trimmed, cut to the cue's length, aged to 1991 (the highs cut; the digital
// beeps crushed a little, like a PC speaker), matched in loudness to the other variants and
// kept under -2 dBFS; very short ones are padded so they still decode. Loops are crossfaded
// end into start so they repeat without a seam.
//
// Written to public/audio/sfx/<cue>-<nn>.ogg, src/audio/cues.ts (what the engine loads) and
// the table of sources in public/audio/ASSETS.md.
//
//   node scripts/build-sounds.mjs          rebuild every cue (needs FFmpeg)
//   node scripts/build-sounds.mjs --list   show which files go to which cue, and write nothing
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KENNEY = 'audio-effects/Audio/';
const HOVE = 'audio-effects/Terminal UI SFX Pack LITE Edition/';
const CLICK = 'audio-effects/Click_SFX_Pack/';
const OWLISH = 'public/audio/';
const PACKS = [
  [KENNEY, 'Kenney Interface Sounds 1.0 (kenney.nl), CC0'],
  [HOVE, 'Terminal User Interface Sound Effects Pack LITE Edition, Hove Audio (hoveaudio.itch.io)'],
  [CLICK, 'Free Click Sound Effects Pack, Hove Audio (hoveaudio.itch.io)'],
  [OWLISH, 'OwlishMedia Sound Effects Pack, CC0 (the derived file above)'],
];
/** How each kind of source is aged. */
const PRESETS = {
  mechanical: { filter: 'highpass=f=60,lowpass=f=7000', note: 'high-pass 60 Hz, low-pass 7 kHz' },
  digital: {
    filter: 'lowpass=f=4500,acrusher=bits=8:mix=0.25:mode=log:aa=1',
    note: 'low-pass 4.5 kHz, 8-bit crush at 25%',
  },
  ui: {
    filter: 'lowpass=f=6000,acrusher=bits=10:mix=0.15:mode=log:aa=1',
    note: 'low-pass 6 kHz, 10-bit crush at 15%',
  },
  loop: { filter: 'highpass=f=40,lowpass=f=5000', note: 'low-pass 5 kHz, seamless loop' },
};
/**
 * The cues: where their variants come from, how they are aged, how long each may last (s),
 * how loud the cue plays (before the player's sliders) and which slider it follows.
 */
const CUES = {
  // ----- the machine and the room -----
  strip: { from: [CLICK + 'Powerstrip/'], preset: 'mechanical', max: 0.5, level: 0.3 },
  'power-button': {
    from: [HOVE + 'Mechanical/Buttons/Computer/'],
    preset: 'mechanical',
    max: 0.8,
    level: 0.3,
  },
  'power-up': {
    from: [HOVE + 'Mechanical/Power/*PowerUp*'],
    preset: 'mechanical',
    max: 1.2,
    level: 0.3,
  },
  'power-down': {
    from: [HOVE + 'Mechanical/Power/*PowerDown*'],
    preset: 'mechanical',
    max: 1.2,
    level: 0.32,
  },
  post: {
    from: [HOVE + 'Navigation/Beeps/*_04.wav', HOVE + 'Navigation/Beeps/*_09.wav'],
    preset: 'digital',
    max: 0.35,
    level: 0.1,
  },
  disk: {
    from: [OWLISH + 'drive-seek-*.ogg', HOVE + 'Mechanical/MiscComputerHardware/'],
    preset: 'mechanical',
    max: 0.8,
    level: 0.2,
  },
  relay: { from: [OWLISH + 'relay.ogg'], preset: 'mechanical', max: 0.4, level: 0.24 },
  key: {
    from: [CLICK + 'Keyboard/', HOVE + 'Mechanical/Keyboard/', OWLISH + 'key-0*.ogg'],
    preset: 'mechanical',
    max: 0.22,
    level: 0.16,
    group: 'keyboard',
  },
  fkey: {
    from: [CLICK + 'Gamecube_Controller/', CLICK + 'PS4_Controller/'],
    preset: 'mechanical',
    max: 0.25,
    level: 0.14,
    group: 'keyboard',
  },
  tick: { from: [CLICK + 'Mouse/', CLICK + 'Pens/'], preset: 'mechanical', max: 0.12, level: 0.05 },
  'relay-bank': {
    from: [CLICK + 'Guitar_Pedals/Guitar_Pedal_A/', CLICK + 'Guitar_Pedals/Guitar_Pedal_B/'],
    preset: 'mechanical',
    max: 0.45,
    level: 0.28,
  },
  'relay-release': {
    from: [CLICK + 'Guitar_Pedals/Guitar_Pedal_C/'],
    preset: 'mechanical',
    max: 0.45,
    level: 0.26,
  },
  protected: {
    from: [HOVE + 'TerminalFeedback/Positive/PosArpLow/'],
    preset: 'digital',
    max: 0.4,
    level: 0.12,
  },
  'cell-low': {
    from: [HOVE + 'Navigation/Beeps/*_30.wav', HOVE + 'Navigation/Beeps/*_34.wav'],
    preset: 'digital',
    max: 0.35,
    level: 0.1,
  },
  light: { from: [CLICK + 'Light_Switches/'], preset: 'mechanical', max: 0.4, level: 0.24 },
  room: {
    from: [HOVE + 'Mechanical/MechAmbienceLoops/*_02.wav'],
    preset: 'loop',
    max: 6,
    level: 0.35,
    group: 'room',
    loop: 0.5,
  },
  air: {
    from: [HOVE + 'Mechanical/MechAmbienceLoops/*_06.wav'],
    preset: 'loop',
    max: 6,
    level: 0.3,
    group: 'room',
    loop: 0.5,
  },
  // ----- the shell and the programs -----
  bad: {
    from: [HOVE + 'TerminalFeedback/Negative/NegLow/'],
    preset: 'digital',
    max: 0.3,
    level: 0.1,
  },
  beep: {
    from: [HOVE + 'TerminalFeedback/Negative/NegHigh/'],
    preset: 'digital',
    max: 0.3,
    level: 0.08,
  },
  denied: {
    from: [HOVE + 'TerminalFeedback/Negative/NegativeFB/'],
    preset: 'digital',
    max: 0.9,
    level: 0.1,
  },
  saved: {
    from: [HOVE + 'TerminalFeedback/Positive/PosLow/'],
    preset: 'digital',
    max: 0.3,
    level: 0.08,
  },
  granted: {
    from: [HOVE + 'TerminalFeedback/Positive/PosHigh/'],
    preset: 'digital',
    max: 0.3,
    level: 0.09,
  },
  'menu-open': {
    from: [HOVE + 'Navigation/Clicks/*_09.wav', HOVE + 'Navigation/Clicks/*_1*.wav'],
    preset: 'digital',
    max: 0.3,
    level: 0.08,
  },
  'menu-close': {
    from: [HOVE + 'Navigation/Clicks/*_85.wav', HOVE + 'Navigation/Clicks/*_92.wav'],
    preset: 'digital',
    max: 0.3,
    level: 0.08,
  },
  'menu-move': { from: [KENNEY + 'click_00[2-5].ogg'], preset: 'ui', max: 0.1, level: 0.08 },
  dialog: { from: [HOVE + 'Misc/'], preset: 'digital', max: 0.6, level: 0.08 },
  'typing-assistant': {
    from: [HOVE + 'PrintScreenLoops/*_17.wav'],
    preset: 'loop',
    max: 4,
    level: 0.05,
    loop: 0.1,
  },
  'typing-other': {
    from: [HOVE + 'PrintScreenLoops/*_49.wav'],
    preset: 'loop',
    max: 4,
    level: 0.05,
    loop: 0.15,
  },
  'typing-system': {
    from: [HOVE + 'PrintScreenLoops/*_08.wav'],
    preset: 'loop',
    max: 4,
    level: 0.04,
    loop: 0.12,
  },
  'typing-anderson': {
    from: [HOVE + 'PrintScreenLoops/*_46.wav'],
    preset: 'loop',
    max: 4,
    level: 0.04,
    loop: 0.12,
  },
  transfer: {
    from: [HOVE + 'PrintScreenLoops/*_39.wav'],
    preset: 'loop',
    max: 4,
    level: 0.06,
    loop: 0.12,
  },
  'cam-open': { from: [CLICK + 'TV_Remote/'], preset: 'mechanical', max: 0.5, level: 0.22 },
  'cam-step': {
    from: [HOVE + 'Mechanical/Buttons/VCR/', CLICK + 'Fightstick/'],
    preset: 'mechanical',
    max: 0.45,
    level: 0.18,
  },
  headset: { from: [CLICK + 'Headphones/'], preset: 'mechanical', max: 0.3, level: 0.2 },
  whoosh: { from: [HOVE + 'Whooshes/'], preset: 'digital', max: 0.9, level: 0.1 },
  port: { from: [CLICK + 'Case_A/'], preset: 'mechanical', max: 0.35, level: 0.22 },
  // ----- her presence -----
  servo: { from: [CLICK + 'Ratchet/'], preset: 'mechanical', max: 0.25, level: 0.12 },
  glitch: { from: [KENNEY + 'glitch_*.ogg'], preset: 'ui', max: 0.1, level: 0.14 },
  scratch: { from: [KENNEY + 'scratch_*.ogg'], preset: 'ui', max: 0.35, level: 0.1 },
  glass: { from: [KENNEY + 'glass_*.ogg'], preset: 'ui', max: 0.7, level: 0.1 },
  printer: {
    from: [HOVE + 'Mechanical/Printing/Loop/'],
    preset: 'loop',
    max: 2,
    level: 0.16,
    loop: 0.06,
  },
  'printer-end': {
    from: [HOVE + 'Mechanical/Printing/OneShot/'],
    preset: 'mechanical',
    max: 0.5,
    level: 0.16,
  },
  paper: { from: [CLICK + 'Clip/'], preset: 'mechanical', max: 0.35, level: 0.16 },
  tool: {
    from: [CLICK + 'Knife_A/', CLICK + 'Knife_B/'],
    preset: 'mechanical',
    max: 0.35,
    level: 0.08,
  },
  door: { from: [CLICK + 'Case_B/'], preset: 'mechanical', max: 0.35, level: 0.3 },
  memory: { from: [KENNEY + 'bong_*.ogg'], preset: 'ui', max: 0.4, level: 0.12 },
  told: { from: [KENNEY + 'drop_*.ogg'], preset: 'ui', max: 0.3, level: 0.1 },
  clue: {
    from: [HOVE + 'TerminalFeedback/Positive/PosArpHigh/'],
    preset: 'digital',
    max: 0.35,
    level: 0.1,
  },
  task: { from: [KENNEY + 'pluck_*.ogg'], preset: 'ui', max: 0.2, level: 0.08 },
  'tray-open': {
    from: [HOVE + 'Mechanical/DiskTray/*Open*'],
    preset: 'mechanical',
    max: 1.7,
    level: 0.24,
  },
  'tray-close': {
    from: [HOVE + 'Mechanical/DiskTray/*Close*'],
    preset: 'mechanical',
    max: 1.4,
    level: 0.24,
  },
  // Both the full-screen switch and two of the endings.
  rise: { from: [KENNEY + 'maximize_*.ogg'], preset: 'ui', max: 0.55, level: 0.1 },
  fall: { from: [KENNEY + 'minimize_*.ogg'], preset: 'ui', max: 0.55, level: 0.1 },
  // ----- the frame's menus -----
  move: {
    from: [KENNEY + 'tick_*.ogg', KENNEY + 'click_001.ogg'],
    preset: 'ui',
    max: 0.1,
    level: 0.09,
  },
  ok: { from: [KENNEY + 'select_*.ogg'], preset: 'ui', max: 0.4, level: 0.1 },
  yes: { from: [KENNEY + 'confirmation_*.ogg'], preset: 'ui', max: 0.55, level: 0.1 },
  error: { from: [KENNEY + 'error_*.ogg'], preset: 'ui', max: 0.5, level: 0.1 },
  back: { from: [KENNEY + 'back_*.ogg'], preset: 'ui', max: 0.1, level: 0.1 },
  open: { from: [KENNEY + 'open_*.ogg'], preset: 'ui', max: 0.35, level: 0.1 },
  close: { from: [KENNEY + 'close_*.ogg'], preset: 'ui', max: 0.35, level: 0.1 },
  ask: { from: [KENNEY + 'question_*.ogg'], preset: 'ui', max: 0.5, level: 0.1 },
  toggle: { from: [KENNEY + 'toggle_*.ogg'], preset: 'ui', max: 0.15, level: 0.1 },
  section: { from: [KENNEY + 'switch_*.ogg'], preset: 'ui', max: 0.35, level: 0.08 },
  scroll: { from: [KENNEY + 'scroll_*.ogg'], preset: 'ui', max: 0.3, level: 0.08 },
};
/**
 * Variants are matched to this loudness (RMS, dBFS), peaks kept under PEAK: two decibels
 * of room, because Vorbis overshoots a little on sharp transients.
 */
const TARGET = -18;
const PEAK = -2;
/** Shorter files are padded with silence to this (s): Vorbis may decode a few ms to nothing. */
const SHORTEST = 0.08;
const RATE = 22050;
const OUT = 'public/audio/sfx';

/** The files a source pattern names: a folder (every sound in it) or a file glob. */
function files(pattern) {
  const folder = pattern.endsWith('/');
  const dir = folder ? pattern : pattern.slice(0, pattern.lastIndexOf('/') + 1);
  const glob = folder ? '*' : pattern.slice(dir.length);
  const match = new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
    'i',
  );
  const found = [];
  const walk = (at) => {
    for (const item of readdirSync(at, { withFileTypes: true })) {
      if (item.isDirectory() && folder) walk(join(at, item.name));
      else if (item.isFile() && /\.(wav|ogg)$/i.test(item.name) && match.test(item.name))
        found.push(join(at, item.name).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return found.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
const pack = (file) => PACKS.find(([prefix]) => file.startsWith(prefix));
function ffmpeg(args) {
  return execFileSync('ffmpeg', ['-v', 'fatal', '-y', ...args], { encoding: 'utf8' });
}
/** Peak and mean (RMS) level of a file, in dBFS. */
function measure(file) {
  const text = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  ).stderr;
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(text)?.[1] ?? -90);
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(text)?.[1] ?? -90);
  return { peak, mean };
}
const duration = (file) =>
  Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' },
    ).trim(),
  );

const plan = Object.entries(CUES).map(([name, cue]) => ({
  name,
  cue,
  sources: [...new Set(cue.from.flatMap(files))],
}));
const used = new Set(plan.flatMap((entry) => entry.sources));
if (process.argv.includes('--list')) {
  for (const { name, sources } of plan) {
    console.log(`${name} (${sources.length})`);
    for (const source of sources) console.log('  ' + source);
  }
  // What the packs have that no cue uses.
  const all = [KENNEY, HOVE, CLICK].flatMap((prefix) => files(prefix));
  const left = all.filter((file) => !used.has(file));
  console.log(`\n${used.size} files used; ${left.length} left out`);
  for (const file of left) console.log('  ' + file);
  process.exit(0);
}

for (const { name, sources } of plan)
  if (!sources.length) throw new Error(`${name}: no source files (is audio-effects/ there?)`);
const work = join(tmpdir(), 'signal91-sfx');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const rows = [];
const generated = [];
for (const { name, cue, sources } of plan) {
  const preset = PRESETS[cue.preset];
  const report = [];
  sources.forEach((source, n) => {
    const target = `${name}-${String(n + 1).padStart(2, '0')}.ogg`;
    const raw = join(work, `${name}-${n}.wav`);
    if (cue.loop) {
      // The whole file, filtered, then its last `loop` seconds crossfaded into its start.
      const whole = join(work, `${name}-${n}-whole.wav`);
      ffmpeg(['-i', source, '-af', preset.filter, '-ac', '1', '-ar', String(RATE), whole]);
      const length = Math.min(duration(whole), cue.max);
      const x = cue.loop;
      ffmpeg([
        '-i',
        whole,
        '-filter_complex',
        [
          `[0]atrim=0:${length},asplit[a][b]`,
          `[a]atrim=${x}:${length},asetpts=N/SR/TB,afade=t=out:st=${length - 2 * x}:d=${x}[body]`,
          `[b]atrim=0:${x},asetpts=N/SR/TB,afade=t=in:d=${x},adelay=${Math.round((length - 2 * x) * 1000)}:all=1[head]`,
          `[body][head]amix=inputs=2:normalize=0:duration=first[out]`,
        ].join(';'),
        '-map',
        '[out]',
        raw,
      ]);
    } else
      ffmpeg([
        '-i',
        source,
        '-af',
        [
          preset.filter,
          // Leading and trailing silence off, then cut to the cue's length.
          'silenceremove=start_periods=1:start_threshold=-50dB:detection=peak',
          'areverse',
          'silenceremove=start_periods=1:start_threshold=-60dB:detection=peak',
          'areverse',
          `atrim=0:${cue.max}`,
        ].join(','),
        '-ac',
        '1',
        '-ar',
        String(RATE),
        raw,
      ]);
    const { peak, mean } = measure(raw);
    const gain = Math.min(PEAK - peak, TARGET - mean);
    const length = duration(raw);
    const fade = Math.min(0.01, length / 4);
    ffmpeg([
      '-i',
      raw,
      '-af',
      [
        `volume=${gain.toFixed(2)}dB`,
        ...(cue.loop
          ? []
          : [
              'afade=t=in:d=0.002',
              `afade=t=out:st=${Math.max(0, length - fade)}:d=${fade}`,
              `apad=whole_dur=${SHORTEST}`,
            ]),
      ].join(','),
      '-c:a',
      'libvorbis',
      '-q:a',
      '3',
      join(OUT, target),
    ]);
    report.push(mean + gain);
    const [prefix, credit] = pack(source);
    rows.push(
      `| sfx/${target} | ${source.slice(prefix.length)} | ${credit} | ${preset.note}; ` +
        `silence trimmed, at most ${cue.max} s, mono ${RATE / 1000} kHz OGG, ` +
        `loudness matched |`,
    );
  });
  const spread = Math.max(...report) - Math.min(...report);
  console.log(
    `${name.padEnd(18)} ${String(sources.length).padStart(3)} variants  ` +
      `loudness ${Math.min(...report).toFixed(1)}..${Math.max(...report).toFixed(1)} dB` +
      (spread > 3 ? `  (spread ${spread.toFixed(1)} dB)` : ''),
  );
  generated.push(
    `  ${/^[a-z]+$/i.test(name) ? name : `'${name}'`}: { variants: ${sources.length}, level: ${cue.level}, group: '${cue.group ?? 'effects'}', loop: ${!!cue.loop} },`,
  );
}
rmSync(work, { recursive: true, force: true });

writeFileSync(
  'src/audio/cues.ts',
  `// Generated by scripts/build-sounds.mjs. Do not edit.
/** Which slider a cue follows: the keyboard, the room's hum, or the effects. */
export type CueGroup = 'keyboard' | 'room' | 'effects';
/**
 * The game's sound effects: each cue is a set of variants in public/audio/sfx/<cue>-<nn>.ogg,
 * played at \`level\` before the player's sliders; loops repeat until they are stopped.
 */
export const CUES = {
${generated.join('\n')}
} as const satisfies Record<
  string,
  { variants: number; level: number; group: CueGroup; loop: boolean }
>;
export type Cue = keyof typeof CUES;
`,
);

// The sources, in the asset manifest between its markers.
const ASSETS = 'public/audio/ASSETS.md';
const START = '<!-- sfx:start -->';
const END = '<!-- sfx:end -->';
const manifest = existsSync(ASSETS) ? readFileSync(ASSETS, 'utf8') : '# Bundled audio\n';
const table = [
  START,
  '## Sound effects',
  'Built by `scripts/build-sounds.mjs` from `audio-effects/` (the packs stay out of the',
  'distribution; only these derived files ship).',
  '',
  '| Game file | Source file | Pack / licence | Edits |',
  '| --- | --- | --- | --- |',
  ...rows,
  END,
].join('\n');
writeFileSync(
  ASSETS,
  manifest.includes(START)
    ? manifest.replace(new RegExp(START + '[\\s\\S]*' + END), table)
    : manifest.trimEnd() + '\n\n' + table + '\n',
);
console.log(`${rows.length} files in ${plan.length} cues -> ${OUT}`);
