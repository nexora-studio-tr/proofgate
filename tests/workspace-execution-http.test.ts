import { test, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../apps/server/src/index.js';
import { workspaceExample } from '../packages/core/src/workspace-example.js';
import { dependencyKey } from '../packages/runner/src/dependencies.js';
import { captureWorking } from '../packages/snapshots/src/index.js';
import { command } from '../packages/runner/src/process.js';

test('workspace plans freeze scope and reject source/policy/image/payload drift before enqueue', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'proofgate-ws-run-'));
  let service: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    const repo = path.join(parent, 'repo'),
      pair = workspaceExample();
    for (const [file, text] of Object.entries(pair.base.files)) {
      await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
      await writeFile(path.join(repo, file), text);
    }
    for (const args of [
      ['init', '--template=', '--initial-branch=main'],
      ['add', '--', ...Object.keys(pair.base.files)],
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'core.hooksPath=',
        'commit',
        '-m',
        'baseline',
      ],
    ]) {
      const r = await command('git', args, { cwd: repo });
      expect(r.code, r.stderr).toBe(0);
    }
    for (const [file, text] of Object.entries(pair.head.files))
      await writeFile(path.join(repo, file), text);
    const origin = 'http://127.0.0.1:4365';
    service = await createServer({ mode: 'local', dataDir: path.join(parent, 'data'), origin });
    const { app, store, connectionToken } = service,
      i = store.localIdentity();
    const project = store.addProject(i.teamId, 'Workspace', repo, pair.policy);
    const image = 'sha256:' + 'a'.repeat(64),
      baseImage = 'sha256:' + 'b'.repeat(64);
    store.setMeta('runner_image', baseImage);
    const head = await captureWorking(repo),
      key = dependencyKey(head);
    store.run('INSERT INTO project_images VALUES(?,?,?,?)', project, key, baseImage, image);
    const post = (url: string, payload: unknown) =>
      app.inject({
        method: 'POST',
        url,
        payload: JSON.stringify(payload),
        headers: {
          host: '127.0.0.1:4365',
          origin,
          'content-type': 'application/json',
          authorization: 'Bearer ' + connectionToken,
        },
      });
    const plan = async () => {
      const r = await post('/api/plans', { projectId: project, baseRef: 'HEAD', include: [] });
      expect(r.statusCode, r.body).toBe(200);
      return r.json();
    };
    const first = await plan();
    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.workspace.selected).toHaveLength(3);
    expect(first.workspace.unselected).toEqual(['packages/unrelated']);
    expect(store.all('SELECT id FROM jobs')).toEqual([]);
    const source = 'packages/access/src/access.ts',
      original = await readFile(path.join(repo, source), 'utf8');
    await writeFile(path.join(repo, source), original + '// later edit\n');
    expect((await post('/api/runs', { planId: first.planId })).json().error).toBe('STALE_PLAN');
    await writeFile(path.join(repo, source), original);
    const second = await plan();
    store.run(
      'UPDATE projects SET policy=? WHERE id=?',
      JSON.stringify({ ...pair.policy, budget: { ...pair.policy.budget, mutants: 1 } }),
      project,
    );
    expect((await post('/api/runs', { planId: second.planId })).json().error).toBe(
      'POLICY_CHANGED',
    );
    store.run('UPDATE projects SET policy=? WHERE id=?', JSON.stringify(pair.policy), project);
    const third = await plan();
    store.run(
      'UPDATE project_images SET image=? WHERE project_id=?',
      'sha256:' + 'c'.repeat(64),
      project,
    );
    expect((await post('/api/runs', { planId: third.planId })).json().error).toBe('IMAGE_CHANGED');
    store.run('UPDATE project_images SET image=? WHERE project_id=?', image, project);
    const fourth = await plan();
    const row = store.get<{ payload: string }>(
      'SELECT payload FROM plans WHERE id=?',
      fourth.planId,
    )!;
    const payload = JSON.parse(row.payload);
    payload.planHash = '0'.repeat(64);
    store.run('UPDATE plans SET payload=? WHERE id=?', JSON.stringify(payload), fourth.planId);
    expect((await post('/api/runs', { planId: fourth.planId })).json().error).toBe(
      'PLAN_INTEGRITY',
    );
    expect(store.all('SELECT id FROM jobs')).toEqual([]);
  } finally {
    await service?.app.close();
    if (
      path.dirname(parent) !== os.tmpdir() ||
      !path.basename(parent).startsWith('proofgate-ws-run-')
    )
      throw Error('Cleanup guard');
    await rm(parent, { recursive: true, force: true });
  }
});
