import { chromium, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from '../dist/apps/server/src/index.js';
import { examplePair } from '../dist/packages/core/src/examples.js';
import { command } from '../dist/packages/runner/src/process.js';
import { workspaceFixture } from '../dist/tests/workspace-fixture.js';
import { workspaceExample } from '../dist/packages/core/src/workspace-example.js';
import { dependencyKey } from '../dist/packages/runner/src/dependencies.js';

const out = path.resolve('artifacts/workspace-validation');
await mkdir(out, { recursive: true });
const parent = await mkdtemp(path.join(out, 'fixture-'));
const origin = 'http://127.0.0.1:4361';
let server, browser, client;
const checks = [];
try {
  const repo = await workspaceFixture(parent);
  const cli = await command(process.execPath, [
    'dist/apps/cli/src/index.js',
    'inspect',
    repo,
    '--base',
    'HEAD',
  ]);
  assert.equal(cli.code, 0, cli.stderr);
  const inspected = JSON.parse(cli.stdout);
  assert.equal(inspected.workspaceImpact.kind, 'npm-workspaces');
  assert.deepEqual(inspected.changedFiles, ['packages/core/src/a.ts']);
  assert.deepEqual(
    inspected.workspaceImpact.affected.map((p) => p.path),
    ['apps/web', 'packages/core'],
  );
  assert.ok(!cli.stdout.includes(parent));
  checks.push(
    'Built CLI inspects a real dirty Git workspace without code execution or absolute path disclosure',
  );
  const data = path.join(parent, 'data');
  server = await createServer({
    mode: 'local',
    origin,
    dataDir: data,
    webRoot: path.resolve('dist/web'),
  });
  const identity = server.store.localIdentity();
  const projectId = server.store.addProject(
    identity.teamId,
    'Synthetic monorepo',
    repo,
    examplePair().policy,
  );
  await server.app.listen({ host: '127.0.0.1', port: 4361 });
  client = new Client({ name: 'workspace-inspection-validation', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['dist/apps/cli/src/index.js', 'mcp', '--data', data],
      cwd: process.cwd(),
      stderr: 'pipe',
    }),
  );
  assert.equal((await client.listTools()).tools.length, 6);
  const result = await client.callTool({
    name: 'inspect_change',
    arguments: { projectId, baseRef: 'HEAD', include: [] },
  });
  assert.ok(!result.isError);
  assert.deepEqual(JSON.parse(result.content[0].text).workspaceImpact, inspected.workspaceImpact);
  const blocked = await client.callTool({
    name: 'plan_verification',
    arguments: { projectId, baseRef: 'HEAD', include: [] },
  });
  assert.ok(blocked.isError);
  assert.match(blocked.content[0].text, /WORKSPACE_EXECUTION_UNSUPPORTED/);
  checks.push(
    'Real six-tool stdio MCP returns the same manifest graph and rejects monorepo execution',
  );
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 950 },
    reducedMotion: 'reduce',
  });
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(origin + '/#bootstrap=' + server.bootstrap);
  await page.getByRole('button', { name: 'Open local workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Verify a change', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect package impact', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Packages to review · 2/4', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('packages/core → apps/web');
  await expect(page.getByRole('dialog')).toContainText('Inspection is not verification evidence.');
  await page.screenshot({ path: path.join(out, 'workspace-impact-en.png'), fullPage: true });
  checks.push('Authenticated English UI explains transitive impact and its preflight-only scope');
  await page.getByLabel('Base reference', { exact: true }).fill('HEAD~1');
  await expect(page.getByRole('heading', { name: /Packages to review/ })).toHaveCount(0);
  await page.getByLabel('Base reference', { exact: true }).fill('HEAD');
  let releaseResponse, markStarted, markFulfilled;
  const responseGate = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  const requestStarted = new Promise((resolve) => {
    markStarted = resolve;
  });
  const requestFulfilled = new Promise((resolve) => {
    markFulfilled = resolve;
  });
  await page.route('**/api/inspect', async (route) => {
    const response = await route.fetch();
    markStarted();
    await responseGate;
    await route.fulfill({ response });
    markFulfilled();
  });
  await page.getByRole('button', { name: 'Inspect package impact', exact: true }).click();
  await requestStarted;
  await page.getByLabel('Base reference', { exact: true }).fill('HEAD~1');
  releaseResponse();
  await requestFulfilled;
  await page.unroute('**/api/inspect');
  await expect(page.getByRole('heading', { name: /Packages to review/ })).toHaveCount(0);
  await page.getByLabel('Base reference', { exact: true }).fill('HEAD');
  checks.push('A delayed real inspection response cannot restore an obsolete base snapshot');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Language / Dil', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Türkçe', exact: true }).click();
  await page.getByRole('button', { name: 'Değişikliği doğrula', exact: true }).click();
  await page.getByRole('button', { name: 'Paket etkisini incele', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'İncelenecek paketler · 2/4', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('.dialog').evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: path.join(out, 'workspace-impact-tr-mobile.png'), fullPage: true });
  checks.push('Changing the reference clears old results; Turkish preflight fits a 390px dialog');
  await page.getByRole('button', { name: 'Doğrulama planını sabitle', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('incelenmiş workspace v2 politikası');
  assert.equal(server.store.all('SELECT id FROM plans').length, 0);
  assert.equal(server.store.all('SELECT id FROM jobs').length, 0);
  await assert.rejects(access(path.join(repo, 'EXECUTED')));
  assert.deepEqual(errors, []);
  assert.ok(requests.every((url) => new URL(url).origin === origin));
  checks.push(
    'Inspection creates no plans/jobs, executes no manifest script and makes no external browser requests',
  );
  await page.keyboard.press('Escape');
  const created = await command(process.execPath, [
    'dist/apps/cli/src/index.js',
    'example',
    '--workspace',
    '--data',
    data,
  ]);
  assert.equal(created.code, 0, created.stderr);
  const registered = JSON.parse(created.stdout);
  const pair = workspaceExample();
  // Immutable placeholders test planning only. No supervisor or Docker execution runs here.
  const baseImage = 'sha256:' + 'b'.repeat(64),
    image = 'sha256:' + 'a'.repeat(64);
  server.store.setMeta('runner_image', baseImage);
  server.store.run(
    'INSERT INTO project_images VALUES(?,?,?,?)',
    registered.projectId,
    dependencyKey(pair.head),
    baseImage,
    image,
  );
  const cliWorkspace = await command(process.execPath, [
    'dist/apps/cli/src/index.js',
    'inspect',
    registered.root,
    '--base',
    'HEAD',
  ]);
  assert.equal(cliWorkspace.code, 0, cliWorkspace.stderr);
  assert.equal(JSON.parse(cliWorkspace.stdout).candidateHash, pair.head.hash);
  const planned = await client.callTool({
    name: 'plan_verification',
    arguments: {
      projectId: registered.projectId,
      baseRef: 'HEAD',
      include: [],
    },
  });
  assert.ok(!planned.isError, JSON.stringify(planned));
  const frozen = JSON.parse(planned.content[0].text);
  assert.match(frozen.planHash, /^[a-f0-9]{64}$/);
  assert.equal(frozen.workspace.selected.length, 3);
  assert.deepEqual(frozen.workspace.unselected, ['packages/unrelated']);
  assert.equal(frozen.candidateHash, pair.head.hash);
  await page.reload();
  await page.getByRole('button', { name: 'Değişikliği doğrula', exact: true }).click();
  await page.getByRole('combobox', { name: 'Kayıtlı proje', exact: true }).click();
  await page.getByRole('option', { name: 'Workspace access control', exact: true }).click();
  await page.getByRole('button', { name: 'Doğrulama planını sabitle', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(frozen.planHash);
  await expect(page.getByRole('dialog')).toContainText('packages/unrelated');
  await expect(
    page.getByRole('heading', { name: 'Tek plan. Her zorunlu paket.', exact: true }),
  ).toBeVisible();
  assert.ok(await page.locator('.dialog').evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: path.join(out, 'workspace-plan-tr-mobile.png'), fullPage: true });
  checks.push(
    'CLI, real stdio MCP and authenticated TR UI bind the same workspace snapshot and frozen plan',
  );
  await page.getByLabel('Başlangıç referansı', { exact: true }).fill('HEAD~1');
  await expect(
    page.getByRole('heading', { name: 'Tek plan. Her zorunlu paket.', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Başlangıç referansı', { exact: true }).fill('HEAD');
  let releasePlan, startedPlan, fulfilledPlan;
  const planGate = new Promise((resolve) => {
    releasePlan = resolve;
  });
  const planStarted = new Promise((resolve) => {
    startedPlan = resolve;
  });
  const planFulfilled = new Promise((resolve) => {
    fulfilledPlan = resolve;
  });
  await page.route('**/api/plans', async (route) => {
    const response = await route.fetch();
    startedPlan();
    await planGate;
    await route.fulfill({ response });
    fulfilledPlan();
  });
  await page.getByRole('button', { name: 'Doğrulama planını sabitle', exact: true }).click();
  await planStarted;
  await page.getByLabel('Başlangıç referansı', { exact: true }).fill('HEAD~1');
  releasePlan();
  await planFulfilled;
  await page.unroute('**/api/plans');
  await expect(
    page.getByRole('heading', { name: 'Tek plan. Her zorunlu paket.', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bu planı çalıştır', exact: true })).toHaveCount(0);
  assert.equal(server.store.all('SELECT id FROM jobs').length, 0);
  assert.deepEqual(errors, []);
  checks.push('Delayed real plan responses cannot restore stale scope or enqueue jobs');
  await writeFile(
    path.join(out, 'report.json'),
    JSON.stringify(
      { status: 'passed', checks, fixture: 'synthetic Git monorepo', execution: false },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length }));
} finally {
  await browser?.close();
  await client?.close();
  await server?.app.close();
  if (path.dirname(parent) !== out || !path.basename(parent).startsWith('fixture-'))
    throw Error('Cleanup guard');
  await rm(parent, { recursive: true, force: true });
}
