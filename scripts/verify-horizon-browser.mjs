import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = 'http://127.0.0.1:8080';
const preview = 'http://127.0.0.1:1420';
async function listening(url) {
  try {
    await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}
if ((await listening(endpoint)) || (await listening(preview)))
  throw new Error('The model or preview port is already in use; leave running sessions untouched.');
await mkdir('artifacts', { recursive: true });
const children = [];
function launch(command, args, logFile, env = process.env) {
  const log = createWriteStream(logFile);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  children.push({ child, log });
  return child;
}
async function ready(url, child) {
  const start = Date.now();
  while (Date.now() - start < 60000) {
    if (child.exitCode !== null) throw new Error(`${url} exited with ${child.exitCode}`);
    if (await listening(url)) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`${url} did not become ready`);
}
try {
  const server = launch(
    resolve('.tools/llama-k2/llama-server.exe'),
    [
      '-m',
      resolve('.tools/models/K2-Horizon-4B-Q4_K_M.gguf'),
      '--host',
      '127.0.0.1',
      '--port',
      '8080',
      '--ctx-size',
      '8192',
      '--parallel',
      '1',
      '--alias',
      'signal-91',
      '--reasoning',
      'off',
      '--no-webui',
      '--offline',
      '--threads',
      '6',
      '--jinja',
    ],
    'artifacts/horizon-browser-server.log',
  );
  await ready(endpoint + '/health', server);
  const vite = launch(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
    'artifacts/horizon-browser-vite.log',
    {
      ...process.env,
      VITE_MOCK_MODEL: 'false',
      VITE_MODEL_ENDPOINT: endpoint,
    },
  );
  await ready(preview, vite);
  const test = spawn(process.execPath, [resolve('scripts/verify-live.mjs')], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_MODEL_ENDPOINT: endpoint },
    windowsHide: true,
    stdio: 'inherit',
  });
  const code = await new Promise((done) => test.once('exit', done));
  if (code !== 0) throw new Error(`Browser live check failed: ${code}`);
} finally {
  for (const { child } of children.reverse()) if (child.exitCode === null) child.kill();
  await Promise.all(
    children.map(
      ({ child, log }) =>
        new Promise((done) => {
          if (child.exitCode !== null) {
            log.end();
            return done();
          }
          child.once('exit', () => {
            log.end();
            done();
          });
        }),
    ),
  );
}
