import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const dataDir = path.resolve(process.env.PROOFGATE_TEST_DATA ?? '.proofgate');
const connection = JSON.parse(await readFile(path.join(dataDir, 'connection.json'), 'utf8'));
const headers = { authorization: `Bearer ${connection.token}` };
const projects = await (await fetch(connection.origin + '/api/projects', { headers })).json();
assert.ok(projects.length);
const parameters = {
  command: process.execPath,
  args: ['dist/apps/cli/src/index.js', 'mcp', '--data', dataDir],
  cwd: process.cwd(),
  stderr: 'pipe',
};
const transport = new StdioClientTransport(parameters);
const client = new Client({ name: 'proofgate-validation', version: '1.0.0' });
const checks = [];
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 6);
  checks.push('Real stdio handshake and six tools');
  const result = await client.callTool({
    name: 'inspect_change',
    arguments: { projectId: projects[0].id, baseRef: 'HEAD', include: [] },
  });
  assert.ok(!result.isError);
  const inspected = JSON.parse(result.content[0].text);
  assert.equal(inspected.candidateHash.length, 64);
  checks.push('Registered change inspection');
  const denied = await client.callTool({
    name: 'inspect_change',
    arguments: { projectId: '00000000-0000-4000-8000-000000000000', baseRef: 'HEAD', include: [] },
  });
  assert.ok(denied.isError);
  checks.push('Unregistered project rejected');
  const plan = await client.callTool({
    name: 'plan_verification',
    arguments: { projectId: projects[0].id, baseRef: 'HEAD', include: [] },
  });
  assert.ok(!plan.isError);
  assert.ok(JSON.parse(plan.content[0].text).planId);
  checks.push('Frozen plan without execution');
  if (process.env.PROOFGATE_TEST_EXECUTE === '1') {
    const started = await client.callTool({
      name: 'start_verification',
      arguments: { planId: JSON.parse(plan.content[0].text).planId },
    });
    assert.ok(!started.isError);
    const runId = JSON.parse(started.content[0].text).runId;
    const deadline = Date.now() + 600000;
    let record;
    for (;;) {
      const observed = await client.callTool({ name: 'get_verification', arguments: { runId } });
      assert.ok(!observed.isError);
      record = JSON.parse(observed.content[0].text);
      if (!['queued', 'running'].includes(record.state)) break;
      if (Date.now() > deadline) throw new Error('MCP verification deadline');
      await new Promise((r) => setTimeout(r, 800));
    }
    assert.equal(record.verdict, 'pass', JSON.stringify(record.findings));
    assert.equal(record.currentWorkspaceStale, false);
    const full = await (await fetch(connection.origin + '/api/runs/' + runId, { headers })).json();
    assert.equal(full.evidence.runId, runId);
    await writeFile(
      path.join(dataDir, 'verified-evidence.json'),
      JSON.stringify(full.evidence, null, 2),
    );
    checks.push('MCP starts and reads real bounded verification');
  }
  const jobs = await (await fetch(connection.origin + '/api/runs', { headers })).json();
  const completed = jobs.find((j) => j.evidence);
  assert.ok(completed);
  const evidence = await client.callTool({
    name: 'get_evidence',
    arguments: { runId: completed.id, section: 'trials', offset: 0, limit: 2 },
  });
  assert.ok(!evidence.isError);
  assert.equal(JSON.parse(evidence.content[0].text).items.length, 2);
  checks.push('Bounded evidence pagination');
  await mkdir('artifacts/mcp-validation', { recursive: true });
  await writeFile(
    'artifacts/mcp-validation/report.json',
    JSON.stringify({ status: 'passed', checks }, null, 2),
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length }));
} finally {
  await client.close();
}
const modern = new Client({ name: 'proofgate-modern-validation', version: '1.0.0' });
try {
  await modern.connect(new StdioClientTransport(parameters), { mode: 'auto' });
  assert.equal((await modern.listTools()).tools.length, 6);
  console.log('Modern MCP handshake: passed');
} finally {
  await modern.close();
}
