import { test, expect } from 'vitest';
import { workspaceExample } from '../packages/core/src/workspace-example.js';
import { workspacePolicySchema, workspaceTestId } from '../packages/contracts/src/index.js';
import {
  workspacePlan,
  planDigest,
  workspaceTrialFindings,
} from '../packages/core/src/workspace-plan.js';
import { validateDependencies, dependencyKey } from '../packages/runner/src/dependencies.js';
import { snapshot } from '../packages/snapshots/src/index.js';

test('workspace policy binds unique member/file/test identities and one global budget', () => {
  const p = workspaceExample().policy;
  expect(p.members).toHaveLength(3);
  expect(new Set(p.requiredTests).size).toBe(4);
  expect(workspacePolicySchema.safeParse({ ...p, requiredTests: ['admin allowed'] }).success).toBe(
    false,
  );
  expect(
    workspacePolicySchema.safeParse({ ...p, members: [...p.members, p.members[0]] }).success,
  ).toBe(false);
  expect(
    workspacePolicySchema.safeParse({ ...p, budget: { ...p.budget, mutants: 26 } }).success,
  ).toBe(false);
});
test('planning includes changed packages and transitive consumers, retaining unverified members', () => {
  const p = workspaceExample();
  const plan = workspacePlan(p.base, p.head, p.policy);
  expect(plan.selected.map((p) => p.path).sort()).toEqual([
    'apps/api',
    'apps/audit',
    'packages/access',
  ]);
  expect(plan.unselected).toEqual(['packages/unrelated']);
  expect(plan.selected.find((p) => p.path === 'apps/audit')?.via).toEqual([
    'apps/api',
    'apps/audit',
  ]);
  expect(() =>
    workspacePlan(p.base, p.head, {
      ...p.policy,
      members: p.policy.members.filter((m) => m.path !== 'apps/audit'),
    }),
  ).toThrow('WORKSPACE_SELECTION_INCOMPLETE');
});
test('manifest/topology/config edits and unknown test roots cannot enter execution', () => {
  const p = workspaceExample();
  expect(() =>
    workspacePlan(p.base, snapshot({ ...p.head.files, 'apps/api/package.json': '{}' }), p.policy),
  ).toThrow();
  expect(() =>
    workspacePlan(
      p.base,
      snapshot({ ...p.head.files, 'vitest.config.ts': 'export default {}' }),
      p.policy,
    ),
  ).toThrow('WORKSPACE_CONFIGURATION_CHANGED');
  expect(() =>
    workspacePlan(
      p.base,
      snapshot({ ...p.head.files, 'proofgate.workspace.json': '{}' }),
      p.policy,
    ),
  ).toThrow();
  expect(
    workspacePolicySchema.safeParse({ ...p.policy, testFiles: ['../outside.test.ts'] }).success,
  ).toBe(false);
});
test('real npm lock links are allowed only for frozen internal members', () => {
  const p = workspaceExample();
  expect(() => validateDependencies(p.head)).not.toThrow();
  const lock = JSON.parse(p.head.files['package-lock.json']!);
  lock.packages['node_modules/@fixture/access'].resolved = '../outside';
  expect(() =>
    validateDependencies(snapshot({ ...p.head.files, 'package-lock.json': JSON.stringify(lock) })),
  ).toThrow('WORKSPACE_LOCK_LINK_MISMATCH');
});
test('image cache key and plan identity change with any installation/policy/image input', () => {
  const p = workspaceExample(),
    a = planDigest(p.base, p.head, p.policy, 'base', 'image');
  expect(planDigest(p.base, p.head, p.policy, 'base', 'other')).not.toBe(a);
  expect(
    planDigest(
      p.base,
      p.head,
      { ...p.policy, budget: { ...p.policy.budget, mutants: 1 } },
      'base',
      'image',
    ),
  ).not.toBe(a);
  const changed = snapshot({
    ...p.head.files,
    'apps/api/package.json': p.head.files['apps/api/package.json'] + ' ',
  });
  expect(dependencyKey(changed)).not.toBe(dependencyKey(p.head));
});
test('each required member must be discovered in B, C and H independently', () => {
  const p = workspaceExample();
  const result = workspaceTrialFindings(
    [
      {
        variant: 'H',
        index: 1,
        status: 'complete',
        errors: [],
        elapsedMs: 1,
        tests: [
          {
            name: workspaceTestId('apps/api', 'apps/api/tests/api.test.ts', 'viewer denied'),
            status: 'passed',
            message: '',
            assertion: false,
          },
        ],
      },
    ],
    p.policy,
  );
  expect(result).toHaveLength(3);
  expect(result.every((r) => r.severity === 'fail')).toBe(true);
});
