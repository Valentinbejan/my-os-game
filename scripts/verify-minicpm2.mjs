import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// An isolated port and in-memory story state keep this check away from player saves.
const port = 18093;
const endpoint = `http://127.0.0.1:${port}`;
await mkdir('artifacts', { recursive: true });
const log = createWriteStream('artifacts/minicpm2-server.log');
const args = [
  '-m',
  resolve('.tools/models/MiniCPM5-2B-Q4_K_M.gguf'),
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--alias',
  'signal-91',
  '--ctx-size',
  '8192',
  '--parallel',
  '1',
  '--reasoning',
  'off',
  '--no-webui',
  '--offline',
  '--threads',
  '6',
  '--jinja',
];
args.push(...JSON.parse(process.env.MINICPM2_TEST_ARGS || '[]'));
const runtime = resolve('.tools/llama/llama-server.exe');
const server = spawn(runtime, args, {
  cwd: resolve('.tools/llama'),
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
const exited = new Promise((done) => server.once('exit', done));
let vite;
const report = { runtime, args, started: new Date().toISOString(), replies: [] };
try {
  const start = Date.now();
  while (true) {
    if (server.exitCode !== null) throw Error(`MiniCPM5-2B server exited: ${server.exitCode}`);
    if (Date.now() - start > 120000)
      throw Error('MiniCPM5-2B did not become ready within 120 seconds');
    try {
      const response = await fetch(endpoint + '/health', {
        signal: globalThis.AbortSignal.timeout(1000),
      });
      if (response.ok) break;
    } catch {
      /* still loading */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  report.loadMs = Date.now() - start;
  console.log(`MiniCPM5-2B ready in ${report.loadMs} ms`);
  report.models = await (await fetch(endpoint + '/v1/models')).json();
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { newGame } = await vite.ssrLoadModule('/src/game/types.ts');
  const { buildMessages, unlockedFacts } = await vite.ssrLoadModule('/src/model/prompt.ts');
  const { SSEReader } = await vite.ssrLoadModule('/src/model/ModelClient.ts');
  const { sanitize, hasAnachronism } = await vite.ssrLoadModule('/src/model/sanitize.ts');
  const state = newGame();
  // As in the game: the channel opens with 04's greeting, and the client has the server read
  // the prompt while the operator types (ModelClient.warm).
  state.recentMessages.push({ role: 'assistant', content: 'IS THE DOOR OPEN?' });
  const warmStart = Date.now();
  const warm = await fetch(endpoint + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: globalThis.AbortSignal.timeout(180000),
    body: JSON.stringify({
      model: 'signal-91',
      messages: buildMessages(state, '...'),
      stream: false,
      max_tokens: 1,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  await warm.text();
  report.warmMs = Date.now() - warmStart;
  console.log(`Prompt read ahead in ${report.warmMs} ms`);
  const inputs = JSON.parse(
    process.env.MINICPM2_TEST_INPUTS || '["Hello. Can you hear me?", "Why were you left behind?"]',
  );
  for (const input of inputs) {
    let accepted;
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = Date.now();
      const messages = buildMessages(state, input, attempt === 1);
      const response = await fetch(endpoint + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: globalThis.AbortSignal.timeout(180000),
        body: JSON.stringify({
          model: 'signal-91',
          messages,
          stream: true,
          temperature: 0.75,
          top_p: 0.9,
          repeat_penalty: 1.12,
          max_tokens: Number(process.env.MINICPM2_TEST_MAX_TOKENS || 200),
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
      if (!response.ok) throw Error(await response.text());
      const reader = new SSEReader();
      let firstTokenMs;
      for await (const chunk of response.body) {
        reader.push(chunk);
        if (firstTokenMs === undefined && reader.content) {
          firstTokenMs = Date.now() - before;
          console.log(`First text in ${firstTokenMs} ms`);
        }
      }
      const raw = reader.finish();
      const text = sanitize(raw, unlockedFacts(state), messages[0].content);
      const reply = {
        input,
        attempt,
        text,
        raw,
        elapsedMs: Date.now() - before,
        firstTokenMs,
        valid: !!text && !hasAnachronism(text),
      };
      report.replies.push(reply);
      console.log(JSON.stringify(reply));
      if (reply.valid) {
        accepted = reply;
        state.recentMessages.push(
          { role: 'user', content: input },
          { role: 'assistant', content: text },
        );
        break;
      }
    }
    if (!accepted) throw Error('Both replies failed the game validator');
  }
  report.meetsGameDeadline = report.replies.every((reply) => reply.elapsedMs <= 45000);
  if (!report.meetsGameDeadline) {
    console.error('MiniCPM5-2B replies exceed the game response deadline on this hardware.');
    process.exitCode = 1;
  }
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile('artifacts/minicpm2-verification.json', JSON.stringify(report, null, 2));
  await vite?.close();
  if (server.exitCode === null) server.kill();
  await exited;
  log.end();
}
