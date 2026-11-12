// Takes the white strokes out of the line drawings in images/ and lays them on the text
// raster's pixel grid, for the face builders.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readPng } from './png.mjs';

const NEIGHBOURS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
/** Drops specks of fewer than `least` pixels (compression noise, not strokes). */
function despeckle(mask, width, height, least) {
  const seen = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const component = [start];
    seen[start] = 1;
    for (let n = 0; n < component.length; n++) {
      const p = component[n],
        x = p % width,
        y = (p - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          component.push(q);
        }
      }
    }
    if (component.length < least) for (const p of component) mask[p] = 0;
  }
}
/** Chamfer distance, in pixels, from every lit pixel to the nearest dark one. */
function depth(mask, width, height) {
  const d = new Float32Array(mask.length);
  const big = 1e9;
  for (let p = 0; p < mask.length; p++) d[p] = mask[p] ? big : 0;
  const pass = (xs, ys, taps) => {
    for (const y of ys)
      for (const x of xs) {
        const p = y * width + x;
        if (!d[p]) continue;
        for (const [dx, dy, cost] of taps) {
          const nx = x + dx,
            ny = y + dy;
          const q = nx < 0 || ny < 0 || nx >= width || ny >= height ? -1 : ny * width + nx;
          d[p] = Math.min(d[p], (q < 0 ? 0 : d[q]) + cost);
        }
      }
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  pass(range(width), range(height), [
    [-1, 0, 1],
    [0, -1, 1],
    [-1, -1, 1.414],
    [1, -1, 1.414],
  ]);
  pass(range(width).reverse(), range(height).reverse(), [
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1.414],
    [-1, 1, 1.414],
  ]);
  return d;
}
/** Zhang-Suen thinning: strokes become one-pixel centre lines. */
function thin(mask, width, height) {
  let candidates = [];
  for (let p = 0; p < mask.length; p++) if (mask[p]) candidates.push(p);
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]);
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      const remove = [];
      for (const p of candidates) {
        if (!mask[p]) continue;
        const x = p % width,
          y = (p - x) / width;
        const n = NEIGHBOURS.map(([dx, dy]) => at(x + dx, y + dy));
        const lit = n.reduce((a, b) => a + b, 0);
        if (lit < 2 || lit > 6) continue;
        let transitions = 0;
        for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) transitions++;
        if (transitions !== 1) continue;
        const [p2, , p4, , p6, , p8] = n;
        if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        remove.push(p);
      }
      for (const p of remove) mask[p] = 0;
      if (remove.length) changed = true;
    }
    candidates = candidates.filter((p) => mask[p]);
  }
}
/** Removes the inside corner of every L-shaped step, so stairs read as clean diagonals. */
function unstair(bitmap, W, H) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : bitmap[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!bitmap[y * W + x]) continue;
      const n = NEIGHBOURS.map(([dx, dy]) => at(x + dx, y + dy));
      if (n.reduce((a, b) => a + b, 0) !== 2) continue;
      const [up, , right, , down, , left] = n;
      if ((up || down) && (left || right)) bitmap[y * W + x] = 0;
    }
}
/**
 * A drawing's strokes (thinned to centre lines) and its filled shapes (teeth), at the
 * drawing's own size. Slow, so kept in artifacts/trace-cache between builds.
 */
function strokesOf(file) {
  const cache = `artifacts/trace-cache/${file.replace(/[^\w.-]+/g, '_')}.bin`;
  const source = statSync('images/' + file);
  if (existsSync(cache) && statSync(cache).mtimeMs > source.mtimeMs) {
    const raw = readFileSync(cache);
    const width = raw.readUInt32LE(0),
      height = raw.readUInt32LE(4);
    const size = width * height;
    return {
      width,
      height,
      strokes: new Uint8Array(raw.subarray(8, 8 + size)),
      filled: new Uint8Array(raw.subarray(8 + size, 8 + 2 * size)),
    };
  }
  const { width, height, luma } = readPng('images/' + file);
  const ink = new Uint8Array(width * height);
  for (let p = 0; p < ink.length; p++) ink[p] = luma[p] >= 128 ? 1 : 0;
  despeckle(ink, width, height, 12);
  // Filled shapes (teeth) keep their area; everything else is a stroke and keeps its line.
  const d = depth(ink, width, height);
  const solid = new Uint8Array(ink.length);
  for (let p = 0; p < ink.length; p++) if (d[p] >= 5) solid[p] = 1;
  const grown = depth(
    solid.map((v) => 1 - v),
    width,
    height,
  );
  const filled = new Uint8Array(ink.length);
  for (let p = 0; p < ink.length; p++) if (ink[p] && grown[p] <= 5) filled[p] = 1;
  const strokes = ink.map((v, p) => (v && !filled[p] ? 1 : 0));
  thin(strokes, width, height);
  mkdirSync('artifacts/trace-cache', { recursive: true });
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  writeFileSync(cache, Buffer.concat([header, Buffer.from(strokes), Buffer.from(filled)]));
  return { width, height, strokes, filled };
}
/**
 * One drawing, as a W x H bitmap on the text raster's pixel grid. `crop` is the part of the
 * drawing to use, as fractions of its width and height (the whole drawing by default).
 */
export function trace(file, W, H, crop = { x: 0, y: 0, width: 1, height: 1 }) {
  const { width, height, strokes, filled } = strokesOf(file);
  const left = crop.x * width,
    top = crop.y * height;
  const sx = W / (crop.width * width),
    sy = H / (crop.height * height);
  const at = (x, y) => {
    const bx = Math.floor((x - left) * sx),
      by = Math.floor((y - top) * sy);
    return bx < 0 || by < 0 || bx >= W || by >= H ? -1 : by * W + bx;
  };
  const bitmap = new Uint8Array(W * H);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!strokes[y * width + x]) continue;
      const n = at(x, y);
      if (n >= 0) bitmap[n] = 1;
    }
  unstair(bitmap, W, H);
  // Filled shapes: a raster pixel lights when most of it is covered.
  const cover = new Float32Array(W * H);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!filled[y * width + x]) continue;
      const n = at(x, y);
      if (n >= 0) cover[n]++;
    }
  const area = 1 / (sx * sy);
  for (let p = 0; p < W * H; p++) if (cover[p] / area >= 0.5) bitmap[p] = 1;
  return bitmap;
}
