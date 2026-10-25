import { chromium } from '@playwright/test';
import { createServer } from '../dist/apps/server/src/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)),
  origin = 'http://127.0.0.1:4359';
const server = await createServer({
  mode: 'team',
  origin,
  dataDir: root + 'artifacts/team-browser/' + randomUUID(),
  webRoot: root + 'dist/web',
});
await server.app.listen({ port: 4359, host: '127.0.0.1' });
const browser = await chromium.launch(),
  checks = [],
  errors = [];
const password = 'a long team browser password';
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
};
try {
  const owner = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  watch(owner);
  await owner.goto(origin + '/#bootstrap=' + server.bootstrap);
  await owner.getByLabel('Display name').fill('Workspace owner');
  await owner.getByLabel('Email', { exact: true }).fill('owner@example.test');
  await owner.getByLabel('Password', { exact: true }).fill(password);
  await owner.getByRole('button', { name: 'Create your workspace', exact: true }).click();
  await owner.getByRole('heading', { name: 'A change. Its evidence.' }).waitFor();
  checks.push('Browser bootstrap and secure session');
  await owner.getByRole('button', { name: /03.*Team/ }).click();
  await owner.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await owner.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await owner.getByLabel('Single-use invitation link').inputValue();
  assert.ok(!owner.url().includes('bootstrap='));
  checks.push('Invitation created without sending a message');
  const visitor = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  watch(visitor);
  await visitor.goto(link);
  await visitor.getByLabel('Display name').fill('QA teammate');
  await visitor.getByLabel('Password', { exact: true }).fill(password);
  await visitor.getByRole('button', { name: 'Accept team invitation', exact: true }).click();
  await visitor.getByRole('heading', { name: 'A change. Its evidence.' }).waitFor();
  checks.push('Single-use invitation accepted in another browser session');
  await owner.reload();
  await owner.getByRole('button', { name: /03.*Team/ }).click();
  await owner.getByRole('combobox', { name: 'QA teammate / Role' }).click();
  await owner.getByRole('option', { name: 'viewer', exact: true }).click();
  await owner
    .getByRole('combobox', { name: 'QA teammate / Role' })
    .filter({ hasText: 'viewer' })
    .waitFor();
  await visitor.reload();
  assert.equal(await visitor.getByRole('button', { name: 'Verify a change' }).count(), 0);
  checks.push('Live role downgrade removes execution controls');
  await owner.getByRole('combobox', { name: 'QA teammate / Role' }).click();
  await owner.getByRole('option', { name: 'member', exact: true }).click();
  await owner.getByRole('button', { name: 'Transfer ownership', exact: true }).click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByLabel('Your current password').fill(password);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  checks.push('Password-confirmed ownership transfer');
  await visitor.reload();
  await visitor.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  await visitor.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await visitor.getByLabel('Password', { exact: true }).fill(password);
  await visitor.getByRole('button', { name: 'Sign in', exact: true }).click();
  await visitor.getByRole('button', { name: /03.*Team/ }).click();
  checks.push('Sensitive ownership change revokes other team sessions');
  await mkdir(root + 'artifacts/team-browser', { recursive: true });
  await visitor.screenshot({ path: root + 'artifacts/team-browser/team-en.png', fullPage: true });
  await visitor.getByLabel('Current password', { exact: true }).fill(password);
  await visitor
    .getByLabel('New password (at least 15 characters)')
    .fill('a newer long account password');
  await visitor.getByRole('button', { name: 'Change password', exact: true }).click();
  await visitor.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  checks.push('Password change signs out the session');
  await visitor.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await visitor.getByLabel('Password', { exact: true }).fill('a newer long account password');
  await visitor.getByRole('button', { name: 'Sign in', exact: true }).click();
  await visitor.getByRole('button', { name: /03.*Team/ }).click();
  await visitor.getByLabel('New workspace name').fill('Secondary');
  await visitor.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await visitor.getByRole('heading', { name: 'Secondary', exact: true }).waitFor();
  checks.push('Workspace creation and session rotation');
  assert.deepEqual(errors, []);
  checks.push('No browser or CSP errors');
  await writeFile(
    root + 'artifacts/team-browser/report.json',
    JSON.stringify({ status: 'passed', checks }, null, 2),
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length }));
} finally {
  await browser.close();
  await server.app.close();
}
