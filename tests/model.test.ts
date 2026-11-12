import { describe, expect, it } from 'vitest';
import { sanitize, hasAnachronism } from '../src/model/sanitize';
import { SSEReader, ModelClient, brief, type ModelTransport } from '../src/model/ModelClient';
import { newGame } from '../src/game/types';
function stream(text: string) {
  return new TextEncoder().encode(
    'data: ' +
      JSON.stringify({ choices: [{ delta: { content: text } }] }) +
      '\r\n\r\ndata: [DONE]\r\n\r\n',
  );
}
describe('model boundary', () => {
  it('suppresses thinking, HTML, controls, Markdown and role prefixes', () => {
    expect(
      sanitize(
        '<think>secret\nthought</think>Assistant: # HELLO\n<script>bad()</script>**WORLD**\u001b',
      ),
    ).toBe('HELLO\nWORLD');
    expect(sanitize('SAFE<think>unclosed secret')).toBe('SAFE');
    expect(
      sanitize(
        'I heard the key. Respond directly. The operator is OP-17.',
        [],
        'Respond directly to what the operator says.\nYou suspect the operator is OP-17.',
      ),
    ).toBe('I HEARD THE KEY.');
    expect(
      sanitize(
        'I do not know the date.\n...\nThe numbers say I am stable.\nPlease keep typing.',
        [],
        'Examples: "Please keep typing." "The numbers say I am stable."',
      ),
    ).toBe('I DO NOT KNOW THE DATE.\n...');
    // A command she spells out stays, though her instructions list it too; its code fence
    // goes without leaving a gap.
    expect(
      sanitize(
        'You can use DIR with /A. For example:\n```\nDIR /A\n```\nThis shows hidden files.',
        [],
        'Commands: DIR /A lists hidden files. TYPE file reads a file.',
      ),
    ).toBe('YOU CAN USE DIR WITH /A. FOR EXAMPLE:\nDIR /A\nTHIS SHOWS HIDDEN FILES.');
    expect(sanitize('A'.repeat(599) + '😀Z')).toBe('A'.repeat(599) + 'Z');
    expect(sanitize('1\n2\n3\n4\n5\n6\n7').split('\n')).toHaveLength(6);
    expect(hasAnachronism('Use Wi-Fi and USB')).toBe(true);
    expect(
      sanitize('i hear you.\nYou were left behind during power isolation and evacuation.', [
        'You were left behind during power isolation and evacuation on 31-OCT-1991.',
      ]),
    ).toBe('I HEAR YOU.');
  });
  it('parses a stream split at every byte including UTF-8 and CRLF boundaries', () => {
    const reader = new SSEReader();
    for (const byte of stream('“I HEAR YOU.”')) reader.push(new Uint8Array([byte]));
    expect(reader.finish()).toBe('“I HEAR YOU.”');
  });
  it('rejects malformed or truncated SSE', () => {
    const reader = new SSEReader();
    reader.push(new TextEncoder().encode('data: {}\n\n'));
    expect(() => reader.finish()).toThrow();
    expect(() => new SSEReader().push(new TextEncoder().encode('data: INVALID\n\n'))).toThrow();
  });
  it('checks whole replies and retries anachronisms once', async () => {
    let calls = 0;
    const transport: ModelTransport = {
      health: async () => true,
      stream: async (_body, _signal, chunk) => {
        chunk(stream(++calls === 1 ? 'Use a smartphone' : 'I HEAR YOU.'));
      },
    };
    const client = new ModelClient(transport);
    const signal = new AbortController().signal;
    await client.health(signal);
    expect(await client.reply(newGame(), 'hello', signal)).toBe('I HEAR YOU.');
    expect(calls).toBe(2);
  });
  it('replaces an exhausted retry with a corruption response', async () => {
    let calls = 0;
    const client = new ModelClient({
      health: async () => true,
      stream: async (_b, _s, chunk) => {
        calls++;
        chunk(stream('ChatGPT'));
      },
    });
    const signal = new AbortController().signal;
    await client.health(signal);
    expect(await client.reply(newGame(), 'hello', signal)).toContain('MEMORY BLOCK UNREADABLE');
    expect(calls).toBe(2);
  });
  it('uses fallback when health fails', async () => {
    const client = new ModelClient({
      health: async () => {
        throw new Error('offline');
      },
      stream: async () => {
        throw new Error('must not request');
      },
    });
    const signal = new AbortController().signal;
    expect(await client.health(signal)).toBe(false);
    expect(await client.reply(newGame(), 'hello', signal)).toContain('SITE ASSISTANT HERE');
  });
  it('checks the channel before the first reply of a resumed conversation', async () => {
    let checks = 0;
    const client = new ModelClient({
      health: async () => {
        checks++;
        return true;
      },
      stream: async (_b, _s, chunk) => chunk(stream('YOU CAME BACK.')),
    });
    expect(await client.reply(newGame(), 'hello', new AbortController().signal)).toBe(
      'YOU CAME BACK.',
    );
    expect(checks).toBe(1);
    expect(client.status).toBe('live');
  });
  it('recovers after loading or switching models without reconnecting the story', async () => {
    let available = false;
    const client = new ModelClient({
      health: async () => available,
      stream: async (_b, _s, chunk) => chunk(stream('I AM STILL HERE.')),
    });
    const signal = new AbortController().signal;
    expect(await client.health(signal)).toBe(false);
    expect(await client.reply(newGame(), 'hello', signal)).toContain('SITE ASSISTANT HERE');
    available = true;
    expect(await client.reply(newGame(), 'hello again', signal)).toBe('I AM STILL HERE.');
    expect(client.status).toBe('live');
  });
  it('waits for the warm-up instead of sending a second request over the busy channel', async () => {
    let active = 0;
    let finishWarm!: () => void;
    const warmed = new Promise<void>((resolve) => (finishWarm = resolve));
    const bodies: string[] = [];
    const client = new ModelClient({
      health: async () => true,
      stream: async (body, _s, chunk) => {
        // The desktop channel refuses a second request while one is running.
        if (active) throw new Error('Channel busy');
        active++;
        bodies.push(body);
        try {
          if (JSON.parse(body).max_tokens === 1) await warmed;
          else chunk(stream('I CAN HEAR YOU.'));
        } finally {
          active--;
        }
      },
    });
    const signal = new AbortController().signal;
    await client.health(signal);
    client.warm(newGame());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reply = client.reply(newGame(), 'hello', signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(bodies).toHaveLength(1);
    finishWarm();
    expect(await reply).toBe('I CAN HEAR YOU.');
    expect(client.status).toBe('live');
    // Cancelling while it waits for the warm-up cancels the reply.
    const again = new AbortController();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow = new ModelClient({
      health: async () => true,
      stream: async (body) => {
        if (JSON.parse(body).max_tokens === 1) await held;
      },
    });
    await slow.health(again.signal);
    slow.warm(newGame());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancelled = slow.reply(newGame(), 'hello', again.signal);
    again.abort();
    await expect(cancelled).rejects.toThrow('Cancelled');
    release();
  });
  it('asks for each voice with its own prompt and temperature, and warms them in turn', async () => {
    const bodies: Array<{
      temperature?: number;
      max_tokens: number;
      messages: { content: string }[];
    }> = [];
    let active = 0;
    const client = new ModelClient({
      health: async () => true,
      stream: async (body, _s, chunk) => {
        if (active) throw new Error('Channel busy');
        active++;
        bodies.push(JSON.parse(body));
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        chunk(stream('Keep typing.\nI am reading.\nStill here.\nOne more.'));
      },
    });
    const signal = new AbortController().signal;
    await client.health(signal);
    client.warm(newGame(), 'assistant');
    client.warm(newGame(), 'other');
    const reply = await client.reply(newGame(), 'who are you', signal, 'other');
    expect(bodies.map((body) => body.max_tokens)).toEqual([1, 1, 90]);
    expect(bodies[0].messages[0].content).toContain('You are process 04, the site assistant');
    expect(bodies[1].messages[0].content).toContain('You are the other one inside process 04');
    expect(bodies[2].temperature).toBe(0.6);
    // She speaks three lines at most.
    expect(reply).toBe('KEEP TYPING.\nI AM READING.\nSTILL HERE.');
  });
  it('keeps the other one brief: whole sentences within the limit', () => {
    expect(brief('SHORT.', 20)).toBe('SHORT.');
    expect(brief('ONE THING. TWO THINGS. THREE THINGS.', 25)).toBe('ONE THING. TWO THINGS.');
    expect(brief('NO END IN SIGHT AT ALL HERE', 10)).toBe('NO END IN');
    expect(brief('WAIT... NO. GIVE ME THE PASSWORD NOW.', 12)).toBe('WAIT... NO.');
  });
  it('times out and remains usable', async () => {
    const client = new ModelClient(
      {
        health: async () => true,
        stream: async (_b, signal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
          ),
      },
      'test',
      false,
      { health: 10, response: 20 },
    );
    const signal = new AbortController().signal;
    await client.health(signal);
    // The authored reply stands in without any notice: the player should not be able to tell.
    const reply = await client.reply(newGame(), 'hello', signal);
    expect(reply).toContain('SITE ASSISTANT HERE.');
    expect(reply).not.toMatch(/FALLBACK|INSTABILITY/);
    expect(client.status).toBe('fallback');
  });
  it('propagates cancellation and does not replace it with fallback', async () => {
    const controller = new AbortController();
    const client = new ModelClient({
      health: async () => true,
      stream: async (_b, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
          controller.abort();
        }),
    });
    await client.health(controller.signal);
    await expect(client.reply(newGame(), 'hello', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
