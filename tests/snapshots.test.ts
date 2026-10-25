import { test, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { command } from '../packages/runner/src/process.js';
import { captureBase, captureWorking, repositoryRoot } from '../packages/snapshots/src/index.js';
import { validateDependencies } from '../packages/runner/src/dependencies.js';
import { examplePair } from '../packages/core/src/examples.js';
import { Store } from '../packages/storage/src/index.js';
import { planVerification, startVerification } from '../apps/server/src/service.js';
import { digest } from '../packages/core/src/index.js';
test('captures exact Git base and dirty source without changing checkout or reading siblings', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proofgate-snapshot-'));
  try {
    await writeFile(path.join(dir, 'a.ts'), 'export const a=1;\n');
    await writeFile(path.join(dir, '.env'), 'PRIVATE=not-for-source');
    await writeFile(path.join(dir, 'new.ts'), 'not captured without explicit inclusion');
    for (const args of [
      ['init'],
      ['add', '--', 'a.ts', '.env'],
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'base'],
    ]) {
      const r = await command('git', args, { cwd: dir });
      expect(r.code, r.stderr).toBe(0);
    }
    await writeFile(path.join(dir, 'a.ts'), 'export const a=2;\n');
    const original = await readFile(path.join(dir, 'a.ts'), 'utf8');
    const base = await captureBase(dir, 'HEAD'),
      head = await captureWorking(dir);
    expect(base.files['a.ts']).toContain('1');
    expect(head.files['a.ts']).toContain('2');
    expect(head.files['.env']).toBeUndefined();
    expect(head.files['new.ts']).toBeUndefined();
    expect((await captureWorking(dir, ['new.ts'])).files['new.ts']).toBeDefined();
    expect(await readFile(path.join(dir, 'a.ts'), 'utf8')).toBe(original);
    await mkdir(path.join(dir, 'nested'));
    await expect(repositoryRoot(path.join(dir, 'nested'))).rejects.toThrow('exact repository root');
    await expect(captureBase(dir, '--help')).rejects.toThrow();
  } finally {
    if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('proofgate-snapshot-'))
      await rm(dir, { recursive: true, force: true });
  }
});
test('requires an integrity-pinned public dependency lock and the supported test tool version', () => {
  const { head } = examplePair();
  expect(() => validateDependencies(head)).not.toThrow();
  const malformed = structuredClone(head);
  malformed.files['package-lock.json'] = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/a': { resolved: 'https://example.test/code.tgz', integrity: 'sha512-a' },
    },
  });
  expect(() => validateDependencies(malformed)).toThrow('public npm');
});
test('a frozen plan binds its runner and dependency image', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proofgate-snapshot-'));
  let store: Store | undefined;
  try {
    const pair = examplePair();
    for (const [name, text] of Object.entries(pair.base.files)) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), text);
    }
    for (const args of [
      ['init'],
      ['add', '.'],
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'base'],
    ]) {
      const r = await command('git', args, { cwd: dir });
      expect(r.code, r.stderr).toBe(0);
    }
    for (const [name, text] of Object.entries(pair.head.files))
      await writeFile(path.join(dir, name), text);
    store = new Store(path.join(dir, '.proofgate'));
    const i = store.localIdentity(),
      id = store.addProject(i.teamId, 'Fixture', dir, pair.policy),
      baseImage = 'sha256:' + 'a'.repeat(64),
      image = 'sha256:' + 'b'.repeat(64);
    store.setMeta('runner_image', baseImage);
    store.run(
      'INSERT INTO project_images VALUES(?,?,?,?)',
      id,
      digest(pair.head.files['package-lock.json']!),
      baseImage,
      image,
    );
    const plan = await planVerification(store, i, id, 'HEAD', []);
    expect(plan.image).toBe(image);
    store.setMeta('runner_image', 'sha256:' + 'c'.repeat(64));
    await expect(startVerification(store, i, plan.planId)).rejects.toThrow('IMAGE_CHANGED');
    expect(store.all('SELECT id FROM jobs')).toHaveLength(0);
  } finally {
    store?.close();
    if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('proofgate-snapshot-'))
      await rm(dir, { recursive: true, force: true });
  }
});
