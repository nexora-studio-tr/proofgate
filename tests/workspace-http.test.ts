import { test, expect } from 'vitest';
import { mkdtemp, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from '../apps/server/src/index.js';
import { examplePair } from '../packages/core/src/examples.js';
import { digest } from '../packages/core/src/index.js';
import { workspaceFixture } from './workspace-fixture.js';

test('registered workspace inspection preserves auth, tenant/token scope and read-only behavior', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'proofgate-workspace-'));
  let service: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    const repo = await workspaceFixture(parent);
    const origin = 'http://127.0.0.1:4361';
    service = await createServer({ mode: 'local', dataDir: path.join(parent, 'data'), origin });
    const { app, store, connectionToken } = service;
    const identity = store.localIdentity();
    const project = store.addProject(identity.teamId, 'Fixture', repo, examplePair().policy);
    const inspect = { projectId: project, baseRef: 'HEAD', include: [] };
    const request = (route: string, payload: unknown, bearer?: string) =>
      app.inject({
        method: 'POST',
        url: route,
        payload: JSON.stringify(payload),
        headers: {
          host: '127.0.0.1:4361',
          origin,
          'content-type': 'application/json',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
      });
    expect((await request('/api/inspect', inspect)).statusCode).toBe(401);
    const response = await request('/api/inspect', inspect, connectionToken);
    expect(response.statusCode).toBe(200);
    expect(response.json().workspaceImpact).toMatchObject({
      status: 'complete',
      kind: 'npm-workspaces',
      executionSupport: 'reviewed-policy-required',
      candidateHash: response.json().candidateHash,
    });
    expect(response.json().changedFiles).toEqual(['packages/core/src/a.ts']);
    expect(response.json().workspaceImpact.affected.map((p: { path: string }) => p.path)).toEqual([
      'apps/web',
      'packages/core',
    ]);
    const otherTeam = randomUUID();
    store.run('INSERT INTO teams VALUES(?,?)', otherTeam, 'Other');
    const foreign = store.addProject(otherTeam, 'Foreign fixture', repo, examplePair().policy);
    expect(
      (await request('/api/inspect', { ...inspect, projectId: foreign }, connectionToken))
        .statusCode,
    ).toBe(404);
    const scopedToken = 'a'.repeat(43);
    store.run(
      'INSERT INTO api_tokens VALUES(?,?,?,?)',
      digest(scopedToken),
      identity.userId,
      project,
      Date.now() + 60000,
    );
    expect((await request('/api/inspect', inspect, scopedToken)).statusCode).toBe(200);
    const sibling = store.addProject(
      identity.teamId,
      'Sibling fixture',
      repo,
      examplePair().policy,
    );
    expect(
      (await request('/api/inspect', { ...inspect, projectId: sibling }, scopedToken)).statusCode,
    ).toBe(404);
    const plan = await request('/api/plans', inspect, connectionToken);
    expect(plan.statusCode).toBe(400);
    expect(plan.json().error).toBe('WORKSPACE_EXECUTION_UNSUPPORTED');
    expect(store.all('SELECT id FROM plans')).toEqual([]);
    expect(store.all('SELECT id FROM jobs')).toEqual([]);
    await expect(access(path.join(repo, 'EXECUTED'))).rejects.toThrow();
  } finally {
    await service?.app.close();
    if (
      path.dirname(parent) !== os.tmpdir() ||
      !path.basename(parent).startsWith('proofgate-workspace-')
    )
      throw Error('Cleanup guard');
    await rm(parent, { recursive: true, force: true });
  }
});
