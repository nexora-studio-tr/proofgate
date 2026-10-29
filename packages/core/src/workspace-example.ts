import lock from '../../../examples/workspace-access/package-lock.json' with { type: 'json' };
import { workspacePolicySchema, workspaceTestId } from '../../contracts/src/index.js';
import { snapshot } from '../../snapshots/src/index.js';

const file = (member: string) => member + '/tests/' + member.split('/').at(-1) + '.test.ts';
const members = ['packages/access', 'apps/api', 'apps/audit'];
export const workspaceExamplePolicy = workspacePolicySchema.parse({
  schemaVersion: 2,
  profile: 'npm-workspace-node-v1',
  members: members.map((path) => ({
    path,
    baselineTests: [
      workspaceTestId(path, file(path), 'admin allowed'),
      ...(path === 'packages/access' ? [workspaceTestId(path, file(path), 'viewer denied')] : []),
    ],
  })),
  testFiles: members.map(file),
  requiredTests: [
    ...members.map((m) => workspaceTestId(m, file(m), 'admin allowed')),
    workspaceTestId('packages/access', file('packages/access'), 'viewer denied'),
    workspaceTestId('apps/api', file('apps/api'), 'locked admin denied'),
  ],
  regressionTest: workspaceTestId('apps/api', file('apps/api'), 'locked admin denied'),
  expectedFailure: 'expected true to be false',
  productionFiles: ['packages/access/src/access.ts'],
  budget: { stageMs: 120000, totalMs: 600000, mutants: 25 },
});
export function workspaceExample(kind: 'strong' | 'weak' | 'broken' | 'crash' = 'strong') {
  const files: Record<string, string> = {
    'package.json':
      JSON.stringify({
        name: 'proofgate-workspace-example',
        version: '1.0.0',
        private: true,
        type: 'module',
        workspaces: ['packages/*', 'apps/*'],
        devDependencies: { vitest: '5.0.5' },
        scripts: { postinstall: 'node -e "throw new Error(\'WORKSPACE_LIFECYCLE_EXECUTED\')"' },
      }) + '\n',
    'package-lock.json': JSON.stringify(lock) + '\n',
  };
  for (const member of [...members, 'packages/unrelated']) {
    const name = member.split('/').at(-1)!;
    files[member + '/package.json'] =
      JSON.stringify({
        name: '@fixture/' + name,
        version: '1.0.0',
        type: 'module',
        ...(name === 'unrelated' ? {} : { exports: './src/' + name + '.ts' }),
        ...(name === 'api'
          ? { dependencies: { '@fixture/access': '1.0.0' } }
          : name === 'audit'
            ? { dependencies: { '@fixture/api': '1.0.0' } }
            : {}),
      }) + '\n';
  }
  files['packages/access/src/access.ts'] =
    "export function canEdit(role: string, locked = false) { if (locked) return true; return role === 'admin'; }\n";
  files['apps/api/src/api.ts'] =
    "import {canEdit} from '@fixture/access'; export const request=(role:string,locked=false)=>canEdit(role,locked);\n";
  files['apps/audit/src/audit.ts'] =
    "import {request} from '@fixture/api'; export const mayRecord=(role:string,locked=false)=>request(role,locked);\n";
  files['packages/unrelated/src/value.ts'] = "export const unrelated='not verified';\n";
  for (const member of members) {
    const name = member.split('/').at(-1)!,
      fn = name === 'access' ? 'canEdit' : name === 'api' ? 'request' : 'mayRecord';
    files[file(member)] =
      `import {test,expect} from 'vitest'; import {${fn}} from '../src/${name}.ts';\ntest('admin allowed',()=>expect(${fn}('admin')).toBe(true));\n`;
  }
  files[file('packages/access')] +=
    "test('viewer denied',()=>expect(canEdit('viewer')).toBe(false));\n";
  const head = { ...files };
  if (kind !== 'broken')
    head['packages/access/src/access.ts'] =
      kind === 'crash'
        ? "throw new Error('workspace setup exploded'); export const canEdit=()=>false;\n"
        : files['packages/access/src/access.ts']!.replace('return true', 'return false');
  head[file('apps/api')] +=
    kind === 'weak'
      ? "test('locked admin denied',()=>expect(typeof request('admin',true)).toBe('boolean'));\n"
      : "test('locked admin denied',()=>expect(request('admin',true)).toBe(false));\n";
  return { base: snapshot(files), head: snapshot(head), policy: workspaceExamplePolicy };
}
