/**
 * The camera pictures: loaded with the program the first time CAMS runs (they are about
 * 280 KB), and unpacked from four pixels a byte the first time each is shown.
 */
export const PICTURE_WIDTH = 320;
export const PICTURE_HEIGHT = 176;
let data: Record<string, string> | null = null;
const unpacked = new Map<string, Uint8Array>();
export async function loadPictures() {
  if (!data) data = (await import('./pictureData')).PICTURE_DATA;
}
export const picturesLoaded = () => data !== null;
/** Four-level pixels from their packed, base64 form. */
export function unpack(base64: string, count = PICTURE_WIDTH * PICTURE_HEIGHT): Uint8Array {
  const bytes = atob(base64);
  const pixels = new Uint8Array(count);
  for (let n = 0; n < count; n++) pixels[n] = (bytes.charCodeAt(n >> 2) >> (6 - (n % 4) * 2)) & 3;
  return pixels;
}
/** A picture's pixels, or null until the pictures have loaded (or for an unknown picture). */
export function picture(id: string): Uint8Array | null {
  if (!data?.[id]) return null;
  let pixels = unpacked.get(id);
  if (!pixels) {
    pixels = unpack(data[id]);
    unpacked.set(id, pixels);
  }
  return pixels;
}
