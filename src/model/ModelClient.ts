import type { GameState, Persona } from '../game/types';
import { buildMessages, otherFacts, unlockedFacts } from './prompt';
import { displayReply, hasAnachronism, sanitize } from './sanitize';
import { mockReply } from './mockModel';
export interface ModelTransport {
  health(signal: AbortSignal): Promise<boolean>;
  stream(body: string, signal: AbortSignal, onChunk: (chunk: Uint8Array) => void): Promise<void>;
}
export class SSEReader {
  private decoder = new TextDecoder();
  private buffer = '';
  content = '';
  done = false;
  push(chunk: Uint8Array) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    this.consume();
  }
  finish() {
    this.buffer += this.decoder.decode();
    this.consume(true);
    if (!this.done) throw new Error('Incomplete model stream');
    return this.content;
  }
  private consume(final = false) {
    this.buffer = this.buffer.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) !== -1) {
      this.event(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end + 2);
    }
    if (final && this.buffer.trim()) this.event(this.buffer);
    if (this.buffer.length > 65536 || this.content.length > 32768)
      throw new Error('Model response too large');
  }
  private event(event: string) {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || this.done) return;
    if (data === '[DONE]') {
      this.done = true;
      return;
    }
    const parsed = JSON.parse(data);
    if (parsed.error) throw new Error('Model response error');
    const part = parsed.choices?.[0]?.delta?.content;
    if (typeof part === 'string') this.content += part;
  }
}
export interface DialogueModel {
  status: 'unchecked' | 'live' | 'fallback';
  health(signal: AbortSignal): Promise<boolean>;
  /** One reply from the voice holding the channel (the site assistant unless named). */
  reply(state: GameState, input: string, signal: AbortSignal, persona?: Persona): Promise<string>;
  /** Lets the model read a voice's prompt ahead of the operator's next line (optional). */
  warm?(state: GameState, persona?: Persona): void;
}
/** A reply cut to whole sentences within `limit` characters (the other speaks briefly). */
export function brief(text: string, limit: number) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit + 1);
  let end = -1;
  for (const match of cut.matchAll(/[.!?](?=\s|$)/g)) end = match.index;
  return end > 0 ? cut.slice(0, end + 1) : text.slice(0, limit).trimEnd();
}
/** Resolves when `task` settles; rejects at once if the signal aborts first. */
function settled(task: Promise<unknown>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void task.finally(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
  });
}
export class ModelClient implements DialogueModel {
  status: DialogueModel['status'] = 'unchecked';
  /** The warm-up request while it runs: the server has one slot, so a reply waits for it. */
  private warming: Promise<void> | null = null;
  constructor(
    private transport: ModelTransport,
    private modelId = 'signal-91',
    /** No model: every reply is authored. Set while the player has the model switched off. */
    public forceMock = false,
    private deadlines = { health: 3000, response: 45000 },
  ) {}
  async health(signal: AbortSignal) {
    if (this.forceMock) {
      this.status = 'fallback';
      return false;
    }
    try {
      const ok = await this.transport.health(
        AbortSignal.any([signal, AbortSignal.timeout(this.deadlines.health)]),
      );
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      this.status = ok ? 'live' : 'fallback';
      return ok;
    } catch {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      this.status = 'fallback';
      return false;
    }
  }
  /**
   * Has the server read the system prompt and the conversation so far while the operator is
   * still typing. The server keeps that prefix cached, so the first reply does not wait for it.
   */
  warm(state: GameState, persona: Persona = 'assistant') {
    const before = this.warming;
    const run = async () => {
      // One request at a time on the channel: a second warm-up waits for the first.
      if (before) await before;
      const signal = AbortSignal.timeout(this.deadlines.response);
      if (this.status !== 'live' && !(await this.health(signal))) return;
      const body = JSON.stringify({
        model: this.modelId,
        messages: buildMessages(state, '...', persona),
        stream: true,
        max_tokens: 1,
        chat_template_kwargs: { enable_thinking: false },
      });
      await this.transport.stream(body, signal, () => undefined);
    };
    const task = run().catch(() => undefined);
    this.warming = task;
    void task.finally(() => {
      if (this.warming === task) this.warming = null;
    });
  }
  async reply(
    state: GameState,
    input: string,
    signal: AbortSignal,
    persona: Persona = 'assistant',
  ): Promise<string> {
    // Loading a preferred model or switching to the small one can outlast the first health check.
    // Recheck before the next reply so authored fallback never permanently locks out AI.
    if (this.status !== 'live') await this.health(signal);
    if (this.status !== 'live') return displayReply(mockReply(state, input, persona));
    // The other speaks little, and colder.
    const voice =
      persona === 'other'
        ? { temperature: 0.6, max_tokens: 90, lines: 3, chars: 170, facts: otherFacts(state) }
        : { temperature: 0.75, max_tokens: 200, lines: 6, chars: 600, facts: unlockedFacts(state) };
    // A reply typed while the server still reads the prompt ahead waits for it: the channel
    // carries one request at a time, and the reply then starts from the prompt already read.
    if (this.warming) await settled(this.warming, signal);
    try {
      const timeout = AbortSignal.timeout(this.deadlines.response);
      const combined = AbortSignal.any([signal, timeout]);
      for (let attempt = 0; attempt < 2; attempt++) {
        const reader = new SSEReader();
        const messages = buildMessages(state, input, persona, attempt === 1);
        const body = JSON.stringify({
          model: this.modelId,
          messages,
          stream: true,
          temperature: voice.temperature,
          top_p: 0.9,
          repeat_penalty: 1.12,
          // Two to six short lines for the assistant (about 50-110 tokens in sentence case).
          max_tokens: voice.max_tokens,
          chat_template_kwargs: { enable_thinking: false },
        });
        await this.transport.stream(body, combined, (chunk) => reader.push(chunk));
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const reply = brief(
          sanitize(reader.finish(), voice.facts, messages[0].content)
            .split('\n')
            .slice(0, voice.lines)
            .join('\n'),
          voice.chars,
        );
        if (reply && !hasAnachronism(reply)) return displayReply(reply);
      }
      return 'MEMORY BLOCK UNREADABLE.\nPLEASE ASK ME ANOTHER WAY.';
    } catch {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      this.status = 'fallback';
      // The authored reply stands in without comment: the player cannot tell the difference.
      return displayReply(mockReply(state, input, persona));
    }
  }
}
