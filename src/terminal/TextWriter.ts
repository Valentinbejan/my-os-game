import type { Clock } from '../game/types';
import { TerminalBuffer } from './TerminalBuffer';
export class TextWriter {
  constructor(
    private buffer: TerminalBuffer,
    private clock: Clock,
    private redraw: () => void,
    /** The player's text speed: 1 as written, less is faster, 0 prints at once. */
    private pace: () => number = () => 1,
    /** Text starts and stops typing out (the soft chatter under it). */
    private typing: (on: boolean, cadence: string, dim: boolean, inverse: boolean) => void = () =>
      undefined,
  ) {}
  /** Types text out at its cadence; `inverse` is reverse video (the other one's voice). */
  async write(
    text: string,
    cadence = 'system',
    signal?: AbortSignal,
    dim = false,
    inverse = false,
  ) {
    if (cadence === 'instant' || this.pace() === 0) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      this.buffer.write(text, 'amber', dim, inverse);
      this.redraw();
      return;
    }
    const chunkSize = cadence === 'system' ? 8 : 1;
    const delay = cadence === 'system' ? 24 : cadence === 'critical' ? 36 : 25;
    this.typing(true, cadence, dim, inverse);
    try {
      for (let i = 0; i < text.length; i += chunkSize) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        this.buffer.write(text.slice(i, i + chunkSize), 'amber', dim, inverse);
        this.redraw();
        await this.clock.wait(delay * this.pace(), signal);
      }
    } finally {
      this.typing(false, cadence, dim, inverse);
    }
  }
}
