import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { command, docker } from '../dist/packages/runner/src/process.js';
import { Store } from '../dist/packages/storage/src/index.js';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const dataDir = path.resolve('artifacts/integration-validation', randomUUID()),
  origin = 'http://127.0.0.1:4360';
await mkdir(dataDir, { recursive: true });
const cli = async (args) => {
  const r = await command(
    process.execPath,
    ['dist/apps/cli/src/index.js', ...args, '--data', dataDir],
    { timeout: 600000 },
  );
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
};
await cli(['doctor']);
const project = JSON.parse(await cli(['example']));
await cli(['doctor', '--project', project.projectId]);
const server = spawn(
  process.execPath,
  ['dist/apps/cli/src/index.js', 'serve', '--port', '4360', '--data', dataDir],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let worker, workspaceClient;
const checks = [];
let logs = '';
server.stderr.on('data', (d) => (logs += d.toString().slice(-3000)));
server.stdout.on('data', () => {});
try {
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const r = await fetch(origin + '/healthz');
      if (r.ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error('Server startup: ' + logs);
    await new Promise((r) => setTimeout(r, 200));
  }
  const connection = JSON.parse(await readFile(path.join(dataDir, 'connection.json'), 'utf8'));
  const headers = {
    authorization: `Bearer ${connection.token}`,
    'content-type': 'application/json',
  };
  const api = async (route, payload) => {
    const r = await fetch(origin + route, {
      method: payload ? 'POST' : 'GET',
      headers,
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  const plan = await api('/api/plans', {
    projectId: project.projectId,
    baseRef: 'HEAD',
    include: [],
  });
  assert.equal(plan.status, 200);
  const source = path.join(project.root, 'src/access.ts'),
    original = await readFile(source, 'utf8');
  await writeFile(source, original + '\n// A later edit\n');
  assert.equal((await api('/api/runs', { planId: plan.data.planId })).status, 409);
  await writeFile(source, original);
  checks.push('Stale plans cannot start');
  const second = await command(
    process.execPath,
    ['dist/packages/runner/src/worker.js', '--data', dataDir],
    { timeout: 10000 },
  );
  assert.notEqual(second.code, 0);
  assert.match(second.stderr, /SUPERVISOR_ALREADY_RUNNING/);
  checks.push('A second supervisor cannot bypass the queue');
  const mcp = await command(process.execPath, ['scripts/validate-mcp.mjs'], {
    timeout: 600000,
    cwd: process.cwd(),
    env: { ...process.env, PROOFGATE_TEST_DATA: dataDir, PROOFGATE_TEST_EXECUTE: '1' },
  });
  assert.equal(mcp.code, 0, mcp.stderr + '\n' + mcp.stdout);
  checks.push('Legacy/modern MCP and full real execution');
  const evidence = JSON.parse(await readFile(path.join(dataDir, 'verified-evidence.json'), 'utf8'));
  assert.equal(evidence.verdict, 'pass');
  assert.equal(evidence.trials.length, 7);
  assert.ok(evidence.mutations.length > 0);
  checks.push('Prepared dependencies and fresh before/after trials');
  const workspaceProject = JSON.parse(await cli(['example', '--workspace']));
  await cli(['doctor', '--project', workspaceProject.projectId]);
  const workspaceResult = JSON.parse(
    await cli(['verify', '--project', workspaceProject.projectId, '--base', 'HEAD']),
  );
  assert.equal(workspaceResult.verdict, 'pass');
  const workspaceEvidence = JSON.parse(
    await readFile(path.join(workspaceResult.report, 'evidence.json'), 'utf8'),
  );
  assert.equal(workspaceEvidence.schemaVersion, 2);
  assert.equal(workspaceEvidence.trials.length, 7);
  assert.ok(workspaceEvidence.workspace.members.every((m) => m.status === 'pass'));
  assert.ok(
    workspaceEvidence.mutations.some(
      (m) =>
        m.file.startsWith('packages/access/') &&
        m.status === 'detected' &&
        m.killedBy.some((id) => id.startsWith('apps/api::')),
    ),
  );
  workspaceClient = new Client({ name: 'workspace-evidence-validation', version: '1.0.0' });
  await workspaceClient.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['dist/apps/cli/src/index.js', 'mcp', '--data', dataDir],
      cwd: process.cwd(),
      stderr: 'pipe',
    }),
  );
  const summary = await workspaceClient.callTool({
    name: 'get_verification',
    arguments: { runId: workspaceEvidence.runId },
  });
  assert.ok(!summary.isError);
  const observed = JSON.parse(summary.content[0].text);
  assert.equal(observed.planHash, workspaceEvidence.planHash);
  assert.equal(observed.candidateHash, workspaceEvidence.candidateHash);
  assert.equal(observed.currentWorkspaceStale, false);
  assert.deepEqual(observed.workspace.members, workspaceEvidence.workspace.members);
  for (const section of ['workspace', 'links']) {
    const result = await workspaceClient.callTool({
      name: 'get_evidence',
      arguments: {
        runId: workspaceEvidence.runId,
        section,
        offset: 0,
        limit: 2,
      },
    });
    assert.ok(!result.isError);
    const page = JSON.parse(result.content[0].text);
    assert.ok(page.total >= 3);
    assert.equal(page.items.length, 2);
  }
  await writeFile(
    'artifacts/integration-validation/workspace-evidence.json',
    JSON.stringify(workspaceEvidence, null, 2),
  );
  checks.push(
    'Real workspace CLI execution, API and paginated MCP share source/plan/member identity and consumer mutation evidence',
  );
  const fresh = await api('/api/plans', {
    projectId: workspaceProject.projectId,
    baseRef: 'HEAD',
    include: [],
  });
  const queued = await api('/api/runs', { planId: fresh.data.planId });
  let record;
  for (let i = 0; i < 50; i++) {
    record = (await api('/api/runs/' + queued.data.runId)).data;
    if (record.state === 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(record.state, 'running');
  await api(`/api/runs/${queued.data.runId}/cancel`, {});
  for (let i = 0; i < 80; i++) {
    record = (await api('/api/runs/' + queued.data.runId)).data;
    if (record.state === 'canceled') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(record.state, 'canceled');
  assert.notEqual(record.evidence?.verdict, 'pass');
  checks.push('Running cancellation cleans up execution');
  const p = await api('/api/plans', {
    projectId: workspaceProject.projectId,
    baseRef: 'HEAD',
    include: [],
  });
  const interrupted = await api('/api/runs', { planId: p.data.planId });
  for (let i = 0; i < 50; i++) {
    record = (await api('/api/runs/' + interrupted.data.runId)).data;
    if (record.state === 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(record.state, 'running');
  const lock = JSON.parse(await readFile(path.join(dataDir, 'supervisor.lock'), 'utf8'));
  assert.equal(lock.app, 'proofgate');
  process.kill(lock.pid, 'SIGKILL');
  await new Promise((r) => setTimeout(r, 400));
  worker = spawn(process.execPath, ['dist/packages/runner/src/worker.js', '--data', dataDir], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  worker.stdout.on('data', () => {});
  worker.stderr.on('data', (d) => (logs += d.toString().slice(-2000)));
  for (let i = 0; i < 80; i++) {
    record = (await api('/api/runs/' + interrupted.data.runId)).data;
    if (record.state === 'interrupted') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(record.state, 'interrupted');
  const remaining = await docker([
    'ps',
    '-aq',
    '--filter',
    `label=app.proofgate.run=${interrupted.data.runId}`,
  ]);
  assert.equal(remaining.stdout.trim(), '');
  checks.push(
    'Workspace cancellation/restart marks incomplete work and cleans only its containers',
  );
  await writeFile(
    'artifacts/integration-validation/report.json',
    JSON.stringify({ status: 'passed', checks, dataDir, evidenceRunId: evidence.runId }, null, 2),
  );
  if (process.argv.includes('--refresh-reference'))
    await writeFile('examples/evidence/strong.json', JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({ status: 'passed', checks: checks.length, evidenceRunId: evidence.runId }),
  );
} finally {
  await workspaceClient?.close();
  worker?.kill('SIGTERM');
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  try {
    const lock = JSON.parse(await readFile(path.join(dataDir, 'supervisor.lock'), 'utf8'));
    if (lock.app === 'proofgate') process.kill(lock.pid, 'SIGTERM');
  } catch {}
}
