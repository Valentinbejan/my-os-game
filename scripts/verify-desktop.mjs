import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((page) => page.url().includes('tauri.localhost'));
if (!page) throw new Error('Native WebView2 page unavailable');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const transcript = () => page.locator('#terminal-transcript').textContent();
const idle = () =>
  page.waitForFunction(
    () => /(?:C:\\AEGIS|CH04)> $/.test(document.getElementById('terminal-transcript').textContent),
    {},
    { timeout: 60000 },
  );
const command = async (text) => {
  await idle();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await idle();
};
await page.locator('canvas').focus();
if ((await transcript()).includes('DISPLAY ADVISORY')) await page.keyboard.press('Enter');
await idle();
await command('STATUS');
await command('CONNECT 04');
if ((await transcript()).includes('FALLBACK TRANSCRIPT BUFFER ACTIVE'))
  throw new Error('Native model transport fell back');
await command('Hello. Can you hear me?');
const firstReply = await transcript();
await page.keyboard.type('Please keep talking.');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
await page.keyboard.press('Control+c');
await idle();
await command('DISCONNECT');
await command('CONNECT 04');
await command('I am still listening.');
await page.waitForTimeout(1200);
await mkdir('artifacts', { recursive: true });
await page.screenshot({ path: 'artifacts/native-desktop.png' });
const finalText = await transcript();
const production = await page.evaluate(() => typeof window.__signal91 === 'undefined');
const report = { firstReply, finalText, productionHasNoDeveloperHooks: production, errors };
await writeFile('artifacts/native-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (
  errors.length ||
  !production ||
  finalText.includes('CHANNEL INTERRUPTED') ||
  finalText.includes('FALLBACK TRANSCRIPT BUFFER ACTIVE')
)
  process.exitCode = 1;
await browser.close();
