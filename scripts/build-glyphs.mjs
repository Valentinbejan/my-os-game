// Measures the terminal's own characters for the ASCII builders: every printable ASCII
// character of VT323, drawn the way src/terminal/GlyphAtlas.ts draws it (at twice the
// resolution), reduced to how much of each pixel of its cell it covers. Two sizes:
//
//   scripts/glyphs.json       the text: 9 x 16 cells, 20 px, baseline 13, 8 columns wide
//   scripts/glyphs-fine.json  the faces' fine text: 5 x 8 cells, 10 px, baseline 6.5, 5 wide
//
//   node scripts/build-glyphs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

export const SIZES = [
  { file: 'scripts/glyphs.json', width: 9, height: 16, font: 20, baseline: 13, room: 8 },
  { file: 'scripts/glyphs-fine.json', width: 5, height: 8, font: 10, baseline: 6.5, room: 5 },
];
const font = readFileSync('node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2');
const chars = Array.from({ length: 95 }, (_, n) => String.fromCharCode(32 + n));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const size of SIZES) {
  const glyphs = await page.evaluate(
    async ({ fontBase64, chars, size }) => {
      const SCALE = 2;
      // This part runs in the browser page.
      const face = new globalThis.FontFace('Glyph', `url(data:font/woff2;base64,${fontBase64})`);
      await face.load();
      document.fonts.add(face);
      const canvas = document.createElement('canvas');
      canvas.width = size.width * SCALE;
      canvas.height = size.height * SCALE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const out = {};
      for (const char of chars) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = `${size.font * SCALE}px Glyph`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(char, 0, size.baseline * SCALE, size.room * SCALE);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const cover = [];
        for (let y = 0; y < size.height; y++)
          for (let x = 0; x < size.width; x++) {
            let sum = 0;
            for (let dy = 0; dy < SCALE; dy++)
              for (let dx = 0; dx < SCALE; dx++) {
                // The atlas firms partial coverage up the same way.
                const a = data[((y * SCALE + dy) * canvas.width + x * SCALE + dx) * 4 + 3];
                const t = Math.max(0, Math.min(1, (a - 32) / 176));
                sum += t * t * (3 - 2 * t);
              }
            cover.push(Math.round((sum / (SCALE * SCALE)) * 100) / 100);
          }
        out[char] = cover;
      }
      return out;
    },
    { fontBase64: font.toString('base64'), chars, size },
  );
  writeFileSync(size.file, JSON.stringify(glyphs));
  console.log(`${size.file}: ${Object.keys(glyphs).length} glyphs measured`);
}
await browser.close();
