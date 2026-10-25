import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from '../dist/apps/server/src/index.js';
const own = process.argv.includes('--start');
const origin =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
  (own ? 'http://127.0.0.1:4358' : 'http://127.0.0.1:4328');
const output = fileURLToPath(new URL('../artifacts/browser-validation/', import.meta.url));
await mkdir(output, { recursive: true });
const server = own
  ? await createServer({
      mode: 'demo',
      origin,
      dataDir: output + '/demo-data',
      webRoot: fileURLToPath(new URL('../dist/web/', import.meta.url)),
    })
  : null;
if (server) await server.app.listen({ port: Number(new URL(origin).port), host: '127.0.0.1' });
const browser = await chromium.launch();
const errors = [];
const checks = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(origin);
  await page.getByRole('heading', { name: 'A change. Its evidence.' }).waitFor();
  await page.getByRole('heading', { name: 'Policy passed', exact: true }).waitFor();
  checks.push('English reference evidence renders');
  await page.getByRole('tab', { name: /Needs review/ }).click();
  assert.match(await page.locator('.no-findings').innerText(), /No open findings/);
  checks.push('Mutation filtering');
  await page.getByRole('tab', { name: /All observations/ }).click();
  assert.equal(await page.locator('tbody tr').count(), 10);
  checks.push('Ten real reference mutations shown');
  await page.screenshot({ path: output + '/desktop-en.png', fullPage: true });
  await page.getByRole('button', { name: 'Language / Dil' }).click();
  await page.getByRole('menuitem', { name: 'Türkçe' }).click();
  await page.getByRole('heading', { name: 'Değişiklik ve kanıtı.' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
  checks.push('Turkish localization');
  await page.getByRole('heading', { name: 'Politika geçti', exact: true }).waitFor();
  await page.screenshot({ path: output + '/desktop-tr.png', fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Raporu indir/ }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'proofgate-report.html');
  checks.push('Actual evidence export');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + '/mobile-tr.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Page overflows mobile viewport',
  );
  checks.push('Mobile viewport without page overflow');
  await page.getByRole('button', { name: /Geçmiş denemeler/ }).click();
  await page.locator('.history-row').first().click();
  await page.getByRole('heading', { name: 'Politika geçti', exact: true }).waitFor();
  checks.push('Run history navigation');
  assert.deepEqual(errors, []);
  checks.push('No browser errors');
  await writeFile(
    output + '/report.json',
    JSON.stringify({ status: 'passed', origin, checks }, null, 2),
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, screenshots: output }));
} finally {
  await browser.close();
  if (server) await server.app.close();
}
