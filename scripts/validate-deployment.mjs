import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { docker } from '../dist/packages/runner/src/process.js';
const name = 'proofgate-web-' + randomUUID(),
  origin = 'http://127.0.0.1:4361',
  checks = [];
try {
  const start = await docker([
    'run',
    '-d',
    '--name',
    name,
    '--label',
    'app.proofgate.web-validation=true',
    '--publish',
    '127.0.0.1:4361:10000',
    '--memory',
    '512m',
    '--cpus',
    '1',
    '--pids-limit',
    '128',
    '--read-only',
    '--tmpfs',
    '/app/data:rw,nosuid,size=33554432,uid=1000,gid=1000',
    '--tmpfs',
    '/tmp:rw,nosuid,size=33554432,uid=1000,gid=1000',
    '--env',
    `PUBLIC_URL=${origin}`,
    'proofgate-web:0.1.0',
  ]);
  assert.equal(start.code, 0, start.stderr);
  let health;
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const r = await fetch(origin + '/healthz');
      if (r.ok) {
        health = await r.json();
        break;
      }
    } catch {}
    if (Date.now() > deadline) {
      const logs = await docker(['logs', name]);
      throw new Error('Demo image startup: ' + logs.stdout + logs.stderr);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(health.mode, 'demo');
  assert.equal(health.version, '0.1.0-alpha.1');
  checks.push('Actual production image startup and mode');
  const root = await fetch(origin);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-security-policy'), /nonce-/);
  assert.match(await root.text(), /ProofGate/);
  checks.push('Built UI and CSP served');
  const session = await (await fetch(origin + '/api/session')).json();
  assert.equal(session.identity, null);
  checks.push('No visitor account or default session');
  const runs = await (await fetch(origin + '/api/runs')).json();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].evidence.verdict, 'pass');
  assert.equal(runs[0].evidence.trials.length, 7);
  checks.push('Recorded synthetic evidence available');
  for (const route of ['/api/plans', '/api/runs', '/api/bootstrap', '/api/login', '/api/invites']) {
    const r = await fetch(origin + route, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(r.status, 403);
    checks.push('Read-only boundary ' + route);
  }
  assert.equal((await fetch(origin + '/api/team')).status, 401);
  checks.push('Team information unavailable');
  assert.equal((await fetch(origin + '/api/runs/' + randomUUID())).status, 404);
  checks.push('Unknown evidence identity rejected');
  const report = await fetch(origin + `/api/runs/${runs[0].id}/report`);
  assert.match(report.headers.get('content-disposition'), /attachment/);
  assert.match(await report.text(), /ProofGate/);
  checks.push('Evidence export');
  const user = await docker([
    'exec',
    name,
    'node',
    '-e',
    "console.log(process.getuid());console.log(require('fs').existsSync('/var/run/docker.sock'))",
  ]);
  assert.equal(user.code, 0);
  assert.deepEqual(user.stdout.trim().split(/\r?\n/), ['1000', 'false']);
  checks.push('Unprivileged web process without Docker socket');
  await mkdir('artifacts/deployment-validation', { recursive: true });
  await writeFile(
    'artifacts/deployment-validation/report.json',
    JSON.stringify({ status: 'passed', checks, version: health.version }, null, 2),
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length }));
} finally {
  const owned = await docker([
    'inspect',
    '--format',
    '{{index .Config.Labels "app.proofgate.web-validation"}}',
    name,
  ]);
  if (owned.stdout.trim() === 'true') await docker(['rm', '-f', name]);
}
