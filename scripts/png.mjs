// PNG reading and writing for the build scripts: 8-bit, non-interlaced images only.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

/** Reads a PNG as luma (0-255 per pixel). */
export function readPng(path) {
  const file = readFileSync(path);
  let at = 8;
  let header;
  const data = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const kind = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR')
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        type: body[9],
        interlaced: body[12],
      };
    else if (kind === 'IDAT') data.push(body);
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  const { width, height, depth, type, interlaced } = header;
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlaced || !channels) throw new Error(`${path}: unsupported PNG`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const luma = new Uint8Array(width * height);
  let previous = new Uint8Array(stride);
  let line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let value = source[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = value & 255;
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      luma[y * width + x] =
        channels >= 3
          ? Math.round(0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2])
          : line[i];
    }
    [previous, line] = [line, previous];
  }
  return { width, height, luma };
}
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** Writes 8-bit RGB pixels as a PNG. */
export function writePng(path, width, height, rgb) {
  const chunk = (kind, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      raw,
      y * (width * 3 + 1) + 1,
    );
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
