import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { command } from '../packages/runner/src/process.js';

export async function workspaceFixture(parent: string) {
  const repo = path.join(parent, 'repo');
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'synthetic-workspace',
      private: true,
      workspaces: ['packages/*', 'apps/*'],
      scripts: { postinstall: "node -e \"require('fs').writeFileSync('EXECUTED','unexpected')\"" },
    }),
    'packages/core/package.json': JSON.stringify({ name: '@fixture/core' }),
    'packages/core/src/a.ts': 'export const a=1;',
    'apps/web/package.json': JSON.stringify({
      name: '@fixture/web',
      dependencies: { '@fixture/core': 'workspace:*' },
    }),
    'apps/other/package.json': JSON.stringify({ name: '@fixture/other' }),
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repo, name)), { recursive: true });
    await writeFile(path.join(repo, name), content);
  }
  for (const args of [
    ['init', '--template=', '--initial-branch=main'],
    ['add', '--', ...Object.keys(files)],
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'core.hooksPath=',
      'commit',
      '-m',
      'Synthetic baseline',
    ],
  ]) {
    const result = await command('git', args, { cwd: repo });
    if (result.code) throw Error('Synthetic Git fixture failed: ' + result.stderr);
  }
  await writeFile(path.join(repo, 'packages/core/src/a.ts'), 'export const a=2;');
  await writeFile(path.join(repo, 'untracked.ts'), 'not captured');
  return repo;
}
