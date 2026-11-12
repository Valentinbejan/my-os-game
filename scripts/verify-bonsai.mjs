import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// An isolated port and in-memory story state keep this check away from player saves.
const port = 18091;
const endpoint = `http://127.0.0.1:${port}`;
await mkdir('artifacts', { recursive: true });
const log = createWriteStream('artifacts/bonsai-server.log');
const args = [
  '-m',
  resolve('.tools/models/Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf'),
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
  '--device',
  'CUDA0',
  '--fit',
  'on',
  '--fit-target',
  '768',
  '--batch-size',
  '256',
  '--ubatch-size',
  '128',
  '--jinja',
  '--chat-template-kwargs',
  '{"enable_thinking":false}',
];
args.push(...JSON.parse(process.env.BONSAI_TEST_ARGS || '[]'));
const runtime = resolve('.tools/llama-prism/llama-server.exe');
const server = spawn(runtime, args, {
  cwd: resolve('.tools/llama-prism'),
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
    if (server.exitCode !== null) throw Error(`Prism server exited: ${server.exitCode}`);
    if (Date.now() - start > 120000) throw Error('Prism did not become ready within 120 seconds');
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
  console.log(`Bonsai ready in ${report.loadMs} ms`);
  report.models = await (await fetch(endpoint + '/v1/models')).json();
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { newGame } = await vite.ssrLoadModule('/src/game/types.ts');
  const { buildMessages } = await vite.ssrLoadModule('/src/model/prompt.ts');
  const { SSEReader } = await vite.ssrLoadModule('/src/model/ModelClient.ts');
  const { sanitize, hasAnachronism } = await vite.ssrLoadModule('/src/model/sanitize.ts');
  const state = newGame();
  for (const input of ['Hello. Can you hear me?', 'Why were you left behind?']) {
    const before = Date.now();
    const response = await fetch(endpoint + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: globalThis.AbortSignal.timeout(180000),
      body: JSON.stringify({
        model: 'signal-91',
        messages: buildMessages(state, input),
        stream: true,
        temperature: 0.82,
        top_p: 0.9,
        repeat_penalty: 1.12,
        max_tokens: Number(process.env.BONSAI_TEST_MAX_TOKENS || 220),
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
    const text = sanitize(raw);
    const reply = {
      input,
      text,
      raw,
      elapsedMs: Date.now() - before,
      firstTokenMs,
      valid: !!text && !hasAnachronism(text),
    };
    report.replies.push(reply);
    console.log(JSON.stringify(reply));
    if (!reply.valid) throw Error('Reply failed the game validator');
    state.recentMessages.push(
      { role: 'user', content: input },
      { role: 'assistant', content: text },
    );
  }
  report.meetsGameDeadline = report.replies.every((reply) => reply.elapsedMs <= 45000);
  if (!report.meetsGameDeadline) {
    console.error('Bonsai replies exceed the game response deadline on this hardware.');
    process.exitCode = 1;
  }
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile('artifacts/bonsai-verification.json', JSON.stringify(report, null, 2));
  await vite?.close();
  if (server.exitCode === null) server.kill();
  await exited;
  log.end();
}
