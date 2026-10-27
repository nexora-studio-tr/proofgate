import { describe, expect, test } from 'vitest';
import { snapshot } from '../packages/snapshots/src/index.js';
import { workspaceImpact } from '../packages/core/src/workspace.js';

const json = (value: unknown) => JSON.stringify(value);
function files() {
  return {
    'package.json': json({ name: 'root', private: true, workspaces: ['packages/*', 'apps/*'] }),
    'packages/core/package.json': json({ name: '@sample/core' }),
    'packages/core/src/a.ts': 'export const a=1;',
    'packages/other/package.json': json({ name: '@sample/other' }),
    'packages/api/package.json': json({
      name: '@sample/api',
      dependencies: { '@sample/core': 'workspace:*' },
    }),
    'apps/web/package.json': json({ name: '@sample/web', devDependencies: { '@sample/api': '*' } }),
    'apps/unrelated/package.json': json({ name: '@sample/unrelated' }),
  } as Record<string, string>;
}
const inspect = (before: Record<string, string>, after: Record<string, string>) =>
  workspaceImpact(snapshot(before), snapshot(after));
describe('bounded manifest workspace impact', () => {
  test('does not mistake an unsupported pnpm workspace for a complete root-only graph', () => {
    const base = {
      'package.json': json({ name: 'pnpm-root' }),
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    };
    expect(inspect(base, base)).toMatchObject({
      kind: 'unsupported',
      status: 'inconclusive',
      diagnostics: [{ code: 'UNSUPPORTED_WORKSPACE_MANAGER', path: 'pnpm-workspace.yaml' }],
    });
  });
  test('finds transitive reverse dependencies and a shortest reason chain', () => {
    const base = files(),
      head = { ...base, 'packages/core/src/a.ts': 'export const a=2;' };
    const impact = inspect(base, head);
    expect(impact.status).toBe('complete');
    expect(impact.kind).toBe('npm-workspaces');
    expect(impact.executionSupport).toBe('single-package-only');
    expect(impact.baseHash).toBe(snapshot(base).hash);
    expect(impact.candidateHash).toBe(snapshot(head).hash);
    expect(impact.affected.map((p) => p.path)).toEqual([
      'apps/web',
      'packages/api',
      'packages/core',
    ]);
    expect(impact.affected[0]).toMatchObject({
      reason: 'dependent',
      via: ['packages/core', 'packages/api', 'apps/web'],
    });
    expect(impact.affected[2]?.directFiles).toEqual(['packages/core/src/a.ts']);
  });
  test('uses old edges when a candidate removes a dependency', () => {
    const base = files(),
      head = {
        ...base,
        'packages/api/package.json': json({ name: '@sample/api' }),
        'packages/core/src/a.ts': 'changed',
      };
    const impact = inspect(base, head);
    expect(impact.packages.find((p) => p.path === 'packages/api')?.dependencies).toContain(
      'packages/core',
    );
    expect(impact.affected.find((p) => p.path === 'apps/web')?.reason).toBe('dependent');
  });
  test('keeps removed packages and their consumers visible', () => {
    const base = files();
    base['packages/api/package.json'] = json({
      name: '@sample/api',
      dependencies: { '@sample/core': '*' },
    });
    const head = { ...base };
    delete head['packages/core/package.json'];
    delete head['packages/core/src/a.ts'];
    const impact = inspect(base, head);
    expect(impact.status).toBe('complete');
    expect(impact.packages.find((p) => p.path === 'packages/core')).toMatchObject({
      before: true,
      after: false,
    });
    expect(impact.affected.map((p) => p.path)).toEqual([
      'apps/web',
      'packages/api',
      'packages/core',
    ]);
  });
  test('expands shared root changes to every captured package', () => {
    const base = files(),
      impact = inspect(base, { ...base, 'tsconfig.json': '{}' });
    expect(impact.affected).toHaveLength(impact.packages.length);
    expect(impact.affected.every((p) => p.reason === 'shared')).toBe(true);
    expect(impact.sharedFiles).toEqual(['tsconfig.json']);
  });
  test('reports cyclic components without looping during impact closure', () => {
    const base = files();
    base['packages/core/package.json'] = json({
      name: '@sample/core',
      peerDependencies: { '@sample/api': '*' },
    });
    const impact = inspect(base, { ...base, 'packages/core/src/a.ts': 'changed' });
    expect(impact.cycles).toEqual([['packages/api', 'packages/core']]);
    expect(impact.affected.map((p) => p.path)).toEqual([
      'apps/web',
      'packages/api',
      'packages/core',
    ]);
  });
  test('supports object patterns and recursive whole path components', () => {
    const base = files();
    base['package.json'] = json({
      private: true,
      workspaces: { packages: ['packages/**', 'apps/*'] },
    });
    base['packages/nested/lib/package.json'] = json({ name: 'nested' });
    const impact = inspect(base, { ...base, 'packages/nested/lib/a.ts': 'changed' });
    expect(impact.status).toBe('complete');
    expect(impact.affected.map((p) => p.path)).toEqual(['packages/nested/lib']);
  });
  test.each(['../outside', '!packages/other', 'packages/{api,core}', 'packages/***'])(
    'treats unsupported pattern %s as inconclusive',
    (pattern) => {
      const base = files();
      base['package.json'] = json({ workspaces: ['packages/*', 'apps/*', pattern] });
      const impact = inspect(base, base);
      expect(impact.status).toBe('inconclusive');
      expect(impact.diagnostics).toContainEqual({
        code: 'UNSUPPORTED_WORKSPACE_PATTERN',
        path: 'package.json',
      });
      expect(impact.affected.every((p) => p.reason === 'uncertain')).toBe(true);
      expect(impact.affected).toHaveLength(impact.packages.length);
    },
  );
  test('marks duplicate names and local path dependencies for manual review', () => {
    const base = files();
    base['packages/other/package.json'] = json({
      name: '@sample/core',
      dependencies: { x: 'file:../../outside' },
    });
    const impact = inspect(base, base);
    expect(impact.status).toBe('inconclusive');
    expect(impact.diagnostics.map((d) => d.code)).toContain('DUPLICATE_PACKAGE_NAME');
    expect(impact.diagnostics.map((d) => d.code)).toContain('LOCAL_PATH_DEPENDENCY');
    expect(impact.affected).toHaveLength(impact.packages.length);
  });
  test('treats malformed or missing workspace targets conservatively', () => {
    const base = files(),
      head = { ...base, 'packages/core/package.json': '{ broken json' };
    const impact = inspect(base, head);
    expect(impact.status).toBe('inconclusive');
    expect(impact.diagnostics.map((d) => d.code)).toContain('INVALID_MANIFEST');
    expect(impact.diagnostics.map((d) => d.code)).toContain('WORKSPACE_DEPENDENCY_MISSING');
    expect(impact.affected).toHaveLength(impact.packages.length);
  });
  test('understands npm aliases and all four manifest dependency sections', () => {
    const base = files();
    base['apps/web/package.json'] = json({
      name: '@sample/web',
      optionalDependencies: { alias: 'npm:@sample/core@1' },
    });
    const impact = inspect(base, { ...base, 'packages/core/src/a.ts': 'changed' });
    expect(impact.packages.find((p) => p.path === 'apps/web')?.dependencies).toEqual([
      'packages/core',
    ]);
    expect(impact.affected.find((p) => p.path === 'apps/web')?.via).toEqual([
      'packages/core',
      'apps/web',
    ]);
  });
  test('does not confuse sibling prefixes and leaves identical snapshots unchanged', () => {
    const base = files();
    base['packages/core-extra/package.json'] = json({ name: 'extra' });
    expect(inspect(base, base).affected).toEqual([]);
    expect(
      inspect(base, { ...base, 'packages/core-extra/a.ts': 'changed' }).affected.map((p) => p.path),
    ).toEqual(['packages/core-extra']);
  });
  test('supports a plain single package and never evaluates script strings', () => {
    const base = {
      'package.json': json({
        name: 'plain',
        scripts: { postinstall: 'throw new Error("NEVER EXECUTE")' },
      }),
      'src/a.ts': 'one',
    };
    const impact = inspect(base, { ...base, 'src/a.ts': 'two' });
    expect(impact.kind).toBe('single-package');
    expect(impact.status).toBe('complete');
    expect(impact.affected.map((p) => p.path)).toEqual(['.']);
  });
  test('stops at the package bound with an explicit inconclusive result', () => {
    const base: Record<string, string> = { 'package.json': json({ workspaces: ['packages/*'] }) };
    for (let i = 0; i < 100; i++) base[`packages/p${i}/package.json`] = json({ name: `p${i}` });
    const impact = inspect(base, base);
    expect(impact.status).toBe('inconclusive');
    expect(impact.kind).toBe('unsupported');
    expect(impact.diagnostics).toContainEqual({ code: 'PACKAGE_LIMIT', path: 'package.json' });
  });
});
