import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('http://127.0.0.1:1420');
  await page.waitForFunction(() => !!window.__signal91);
  await page.evaluate(() => window.__signal91.setSpeed(0));
  await page.keyboard.press('Enter');
  const idle = () =>
    page.waitForFunction(() => window.__signal91.snapshot().canInput, {}, { timeout: 60000 });
  const command = async (text) => {
    await idle();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await idle();
  };
  await command('STATUS');
  await command('CONNECT 04');
  const model = await page.evaluate(() => window.__signal91.snapshot().model);
  if (model !== 'live') throw new Error('Live endpoint did not become ready: ' + model);
  const started = Date.now();
  await command('Hello. Can you hear me?');
  const result = await page.evaluate(() => window.__signal91.snapshot());
  if (result.model !== 'live' || result.text.includes('FALLBACK TRANSCRIPT BUFFER ACTIVE'))
    throw new Error('Live response fell back: ' + result.text);
  await page.waitForTimeout(4000);
  const performance = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const snapshot = window.__signal91.snapshot();
    return {
      fps: snapshot.fps,
      p95: snapshot.p95,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
    };
  });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/live-dialogue.png' });
  const endpoint = new URL(process.env.VITE_MODEL_ENDPOINT || 'http://127.0.0.1:8080');
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    endpoint.pathname !== '/'
  )
    throw new Error('Loopback model endpoint required');
  const listed = await (
    await globalThis.fetch(endpoint.origin + '/v1/models', { redirect: 'error' })
  ).json();
  const active = listed.data?.[0];
  const report = {
    runtime: 'local llama.cpp server',
    model: active?.id || 'unavailable',
    modelParameters: active?.meta?.n_params,
    modelQuantization: active?.meta?.ftype,
    responseMs: Date.now() - started - 4000,
    text: result.text,
    performance,
    errors,
    externalRequests: requests.filter((url) => !url.startsWith('http://127.0.0.1:1420/')),
  };
  await writeFile('artifacts/live-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || report.externalRequests.length) process.exitCode = 1;
} finally {
  await browser.close();
}
