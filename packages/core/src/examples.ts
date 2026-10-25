import { policySchema } from '../../contracts/src/index.js';
import { snapshot } from '../../snapshots/src/index.js';
import lock from '../../../examples/access-control/package-lock.json' with { type: 'json' };
const originalTests = `import { test, expect } from 'vitest';\nimport { canDelete } from '../src/access.ts';\ntest('allows owner',()=>expect(canDelete('owner')).toBe(true));\ntest('rejects viewer',()=>expect(canDelete('viewer')).toBe(false));\n`;
const regression = `test('rejects member',()=>expect(canDelete('member')).toBe(false));\ntest('allows admin',()=>expect(canDelete('admin')).toBe(true));\n`;
export const examplePolicy = policySchema.parse({
  schemaVersion: 1,
  testFiles: ['tests/access.test.ts'],
  productionFiles: ['src/access.ts'],
  requiredTests: ['allows owner', 'rejects viewer', 'rejects member', 'allows admin'],
  regressionTest: 'rejects member',
  expectedFailure: 'expected true to be false',
  budget: { stageMs: 120000, totalMs: 600000, mutants: 25 },
});
export function examplePair(kind: 'strong' | 'weak' | 'broken' | 'crash' = 'strong') {
  const common = {
    'package.json':
      '{"name":"proofgate-example","private":true,"type":"module","devDependencies":{"vitest":"5.0.5"}}\n',
    'package-lock.json': JSON.stringify(lock) + '\n',
  };
  const base = snapshot({
    ...common,
    'src/access.ts': "export function canDelete(role: string) { return role !== 'viewer'; }\n",
    'tests/access.test.ts': originalTests,
  });
  const source =
    kind === 'broken'
      ? base.files['src/access.ts']!
      : kind === 'crash'
        ? "throw new Error('setup exploded'); export function canDelete(role: string) { return false; }\n"
        : "export function canDelete(role: string) { return role === 'owner' || role === 'admin'; }\n";
  const tests =
    kind === 'weak'
      ? originalTests +
        "test('rejects member',()=>expect(typeof canDelete('member')).toBe('boolean'));\ntest('allows admin',()=>expect(canDelete('admin')).toBe(true));\n"
      : originalTests + regression;
  return {
    base,
    head: snapshot({ ...common, 'src/access.ts': source, 'tests/access.test.ts': tests }),
    policy: examplePolicy,
  };
}
