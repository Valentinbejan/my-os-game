// Builds the ASCII videos and the robotic voice lines from the clips in video/.
//
// Picture: each clip at 10 frames a second, grey, squeezed onto the faces' block (the tube's
// tall pixels make the square clip square again) in the faces' fine text: 81 x 34 cells of
// 5 x 8 pixels. Every cell takes the character, and the brightness of the three the terminal
// has (dim, normal, bright), whose shape as the terminal draws it at that size
// (scripts/glyphs-fine.json) lies closest to that patch of the frame.
// Written to src/screen/videos/<name>.ts, loaded only when a clip first plays.
//
// Sound: the voice alone, as a 1991 speech board would have given it back: denoised, cut to
// the voice band, its phase thrown away (the robot buzz), crushed to 8 bits and resampled to
// 11 kHz. Written to public/audio/voice/<name>.ogg.
//
//   node scripts/build-videos.mjs            regenerate the videos and the voice lines
//   node scripts/build-videos.mjs --preview  also write artifacts/videos-preview.png
//   node scripts/build-videos.mjs --no-voice leave the voice lines as they are
import { execFileSync } from 'node:child_process';
import { env } from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { writePng } from './png.mjs';

const CLIPS = {
  /** The other one: "I hate you", then her scream. After the photograph. */
  hate: 'GOaA3XOEFk_tulgElxz7U_minimax-h3.mp4',
  /** The other one: "I love you". Her first appearance. */
  love: 'qc2JV1O6AbLwRnSc4pxFJ_minimax-h3.mp4',
  /** James Anderson's plea. */
  plea: 'J2WcQIwaw6oSQPywcAD50_minimax-h3.mp4',
  /** Her scream, as the purge takes her. */
  scream: 'bytedance-seedance-2.5-video.mp4',
  /** Screaming and crying: she decided. */
  cry: 'mrIdidDnZcswasCZEUQFb_minimax-h3.mp4',
};
/** The fine text's cells, in raster pixels, and how many of them make up a face. */
const CW = 5;
const CH = 8;
const COLUMNS = 81;
const ROWS = 34;
const W = COLUMNS * CW;
const H = ROWS * CH;
const FPS = 10;
/** Densities from blank to full, and strokes for the edges. */
const PALETTE = " .`',:;-_=+*^/\\|()<>ovcxX#%@";
/** How bright each of the terminal's three levels is, against the brightest. */
const LEVELS = [0.46, 0.8, 1];
/**
 * The cells are small, so a cell is chosen mostly for how bright it looks from a step back
 * (TONE) and less for the shape of its strokes; GAIN is how far up the densest character
 * the frame's highlights reach.
 */
const TONE = Number(env.VIDEO_TONE ?? 6);
const GAIN = Number(env.VIDEO_GAIN ?? 1.1);

const glyphs = JSON.parse(readFileSync('scripts/glyphs-fine.json', 'utf8'));
const shapes = [...PALETTE].map((char) => {
  const cover = Float32Array.from(glyphs[char]);
  return {
    char,
    cover,
    energy: cover.reduce((sum, v) => sum + v * v, 0),
    mean: cover.reduce((sum, v) => sum + v, 0) / cover.length,
  };
});
/** The brightest a cell can look: the densest character, at the bright level. */
const REACH = Math.max(
  ...shapes.map(({ cover }) => cover.reduce((a, b) => a + b, 0) / cover.length),
);

/** The clip's frames as grey bytes, W x H each. */
function frames(file) {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      'video/' + file,
      '-vf',
      // The faces' block is a little wider than square: a slice off the top and bottom first.
      `fps=${FPS},crop=iw:ih*0.91,scale=${W}:${H}:flags=area,format=gray`,
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  );
  const size = W * H;
  return Array.from({ length: Math.floor(raw.length / size) }, (_, n) =>
    raw.subarray(n * size, (n + 1) * size),
  );
}
/** Stretches the clip's greys so its darkest and lightest parts use the tube's whole range. */
function contrast(clip) {
  const sample = [];
  for (const frame of clip) for (let n = 0; n < frame.length; n += 37) sample.push(frame[n]);
  sample.sort((a, b) => a - b);
  const low = sample[Math.floor(sample.length * 0.05)];
  const high = sample[Math.floor(sample.length * 0.995)];
  // Midtones sink, so skin reads as texture and only highlights come out solid.
  return (value) => Math.pow(Math.min(1, Math.max(0, (value - low) / (high - low))), 1.25);
}
/** A box blur of a W x H picture, `r` pixels each way. */
function blur(picture, r) {
  const across = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const sx = x + dx;
        if (sx < 0 || sx >= W) continue;
        sum += picture[y * W + sx];
        count++;
      }
      across[y * W + x] = sum / count;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= H) continue;
        sum += across[sy * W + x];
        count++;
      }
      out[y * W + x] = sum / count;
    }
  return out;
}
/**
 * The frame as the characters should light it: local contrast raised (eyes, nostrils and
 * mouths stand out of the skin), then scaled into what glyphs can cover.
 */
function lighting(frame, level) {
  const grey = Float32Array.from(frame, level);
  const wide = blur(grey, 14);
  const out = new Float32Array(W * H);
  for (let n = 0; n < out.length; n++)
    out[n] = Math.min(1, Math.max(0, grey[n] + (grey[n] - wide[n]) * 1.1)) * REACH * GAIN;
  return out;
}
/** One frame as characters and levels, cell by cell. */
function ascii(frame, level) {
  const lit = lighting(frame, level);
  let chars = '';
  let levels = '';
  const patch = new Float32Array(CW * CH);
  for (let row = 0; row < ROWS; row++)
    for (let column = 0; column < COLUMNS; column++) {
      let light = 0;
      let sum = 0;
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CW; x++) {
          const v = lit[(row * CH + y) * W + column * CW + x];
          patch[y * CW + x] = v;
          light += v * v;
          sum += v;
        }
      const size = patch.length;
      const tone = sum / size;
      let best = { error: light / size + TONE * tone * tone, char: ' ', level: 0 };
      for (const { char, cover, energy, mean } of shapes) {
        if (char === ' ') continue;
        let dot = 0;
        for (let n = 0; n < size; n++) dot += patch[n] * cover[n];
        LEVELS.forEach((k, index) => {
          const error =
            (light - 2 * k * dot + k * k * energy) / size + TONE * (tone - k * mean) ** 2;
          if (error < best.error) best = { error, char, level: index };
        });
      }
      chars += best.char;
      levels += best.char === ' ' ? '0' : String(best.level);
    }
  return { chars, levels };
}

/** Frames drawn with the terminal's glyphs and levels, pixels 2 wide and 2.7 tall. */
function preview(picks) {
  const COLOURS = [
    [0x9a, 0x5a, 0x18],
    [0xf2, 0xa2, 0x3a],
    [0xff, 0xd2, 0x7a],
  ];
  const tileW = W * 2;
  const tileH = Math.round(H * 2.7);
  const across = 3;
  const width = across * (tileW + 10);
  const height = Math.ceil(picks.length / across) * (tileH + 10);
  const rgb = new Uint8Array(width * height * 3);
  picks.forEach(({ chars, levels }, n) => {
    const left = (n % across) * (tileW + 10);
    const top = Math.floor(n / across) * (tileH + 10);
    for (let y = 0; y < tileH; y++)
      for (let x = 0; x < tileW; x++) {
        const px = Math.floor(x / 2);
        const py = Math.floor(y / 2.7);
        const cell = Math.floor(py / CH) * COLUMNS + Math.floor(px / CW);
        const cover = glyphs[chars[cell]][(py % CH) * CW + (px % CW)];
        const colour = COLOURS[Number(levels[cell])];
        const at = ((top + y) * width + left + x) * 3;
        for (let c = 0; c < 3; c++) rgb[at + c] = colour[c] * cover;
      }
  });
  mkdirSync('artifacts', { recursive: true });
  writePng('artifacts/videos-preview.png', width, height, rgb);
}
const picks = [];
mkdirSync('src/screen/videos', { recursive: true });
mkdirSync('public/audio/voice', { recursive: true });
for (const [name, file] of Object.entries(CLIPS)) {
  process.stdout.write(`${name}: frames`);
  const clip = frames(file);
  const level = contrast(clip);
  const out = clip.map((frame) => ascii(frame, level));
  picks.push(out[Math.floor(out.length * 0.3)], out[Math.floor(out.length * 0.75)]);
  const source = `// Generated by scripts/build-videos.mjs from video/${file}. Do not edit.
/** ${clip.length} frames at ${FPS} a second: ${COLUMNS} x ${ROWS} characters, and a level (0-2) for each. */
export default {
  fps: ${FPS},
  chars: [
${out.map((frame) => '    ' + JSON.stringify(frame.chars) + ',').join('\n')}
  ],
  levels: [
${out.map((frame) => '    ' + JSON.stringify(frame.levels) + ',').join('\n')}
  ],
};
`;
  writeFileSync(`src/screen/videos/${name}.ts`, source);
  process.stdout.write(` ${clip.length}`);
  if (process.argv.includes('--no-voice')) {
    process.stdout.write('\n');
    continue;
  }
  process.stdout.write(', voice');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    'video/' + file,
    '-vn',
    '-ac',
    '1',
    '-af',
    [
      'afftdn=nf=-25',
      'highpass=f=140',
      'lowpass=f=3600',
      // The phase thrown away: every frame of sound starts the same way, and the voice buzzes.
      "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75",
      'acrusher=bits=8:mode=log:aa=1',
      'aresample=11025',
      'loudnorm=I=-18:TP=-2',
      'aresample=22050',
    ].join(','),
    '-c:a',
    'libvorbis',
    '-q:a',
    '3',
    `public/audio/voice/${name}.ogg`,
  ]);
  process.stdout.write(' done\n');
}
if (process.argv.includes('--preview')) preview(picks);
