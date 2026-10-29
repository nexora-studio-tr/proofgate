import { describe, expect, test } from 'vitest';
import { policySchema, type Trial, type Evidence } from '../packages/contracts/src/index.js';
import reference from '../examples/evidence/strong.json' with { type: 'json' };
import workspaceReference from '../examples/evidence/workspace-strong.json' with { type: 'json' };
import {
  evaluateTrials,
  evaluateMutations,
  verdict,
  inspectWeakening,
  htmlReport,
} from '../packages/core/src/index.js';
import { examplePair, examplePolicy } from '../packages/core/src/examples.js';
import { snapshot, validateSourcePath } from '../packages/snapshots/src/index.js';
const healthy = (): Trial[] => [
  {
    variant: 'B',
    index: 1,
    status: 'complete',
    tests: [{ name: 'allows owner', status: 'passed', message: '', assertion: false }],
    errors: [],
    elapsedMs: 1,
  },
  ...[1, 2, 3].flatMap((i) => [
    {
      variant: 'C' as const,
      index: i,
      status: 'complete' as const,
      tests: [
        {
          name: 'rejects member',
          status: 'failed' as const,
          message: 'expected true to be false',
          assertion: true,
        },
      ],
      errors: [],
      elapsedMs: 1,
    },
    {
      variant: 'H' as const,
      index: i,
      status: 'complete' as const,
      tests: examplePolicy.requiredTests.map((name) => ({
        name,
        status: 'passed' as const,
        message: '',
        assertion: false,
      })),
      errors: [],
      elapsedMs: 1,
    },
  ]),
];
test('HTML evidence escapes untrusted finding text', () => {
  const e = structuredClone(reference) as Evidence;
  e.findings = [
    { code: 'UNTRUSTED_LOG', severity: 'warning', detail: '<img src=x onerror=alert(1)>' },
  ];
  const html = htmlReport(e);
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

test('workspace export preserves recorded scope, plan and unverified members while escaping package text', () => {
  const e = structuredClone(workspaceReference) as Evidence;
  e.workspace!.selected[0]!.name = '<img src=x onerror=alert(1)>';
  const html = htmlReport(e);
  expect(html).toContain(e.planHash);
  expect(html).toContain('Not verified: packages/unrelated');
  expect(html).toContain('apps/api');
  expect(html).toContain('2/2');
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('&lt;img src=x');
});
describe('evidence policy', () => {
  test('accepts exact, complete, repeated differential observations', () =>
    expect(evaluateTrials(healthy(), examplePolicy)).toEqual([]));
  test('rejects a test that passes on the original implementation', () => {
    const t = healthy();
    t[1]!.tests[0]!.status = 'passed';
    expect(
      evaluateTrials(t, examplePolicy).some((f) => f.code === 'REGRESSION_NOT_DISCRIMINATING'),
    ).toBe(true);
  });
  test('does not substitute an import failure for an assertion', () => {
    const t = healthy();
    t[1]!.tests[0]!.assertion = false;
    expect(verdict(evaluateTrials(t, examplePolicy))).toBe('inconclusive');
  });
  test('does not substitute a different assertion failure', () => {
    const t = healthy();
    t[1]!.tests[0]!.message = 'different assertion';
    expect(verdict(evaluateTrials(t, examplePolicy))).toBe('inconclusive');
  });
  test('requires all fresh observations', () =>
    expect(verdict(evaluateTrials(healthy().slice(0, 3), examplePolicy))).toBe('inconclusive'));
  test('duplicate test identities cannot establish a fix', () => {
    const t = healthy();
    t[1]!.tests.push({ ...t[1]!.tests[0]! });
    expect(evaluateTrials(t, examplePolicy).some((f) => f.code === 'AMBIGUOUS_TEST_ID')).toBe(true);
  });
  test('zero-test collection never passes', () => {
    const t = healthy();
    t[0]!.tests = [];
    expect(verdict(evaluateTrials(t, examplePolicy))).toBe('inconclusive');
  });
  test('missing mandatory tests fail the gate', () => {
    const t = healthy();
    t[2]!.tests.pop();
    expect(verdict(evaluateTrials(t, examplePolicy))).toBe('fail');
  });
  test('an infrastructure timeout cannot pass', () => {
    const t = healthy();
    t[1]!.status = 'timeout';
    expect(verdict(evaluateTrials(t, examplePolicy))).toBe('inconclusive');
  });
  test('a stable failing candidate remains failed', () => {
    const t = healthy();
    for (const x of t.filter((x) => x.variant === 'H')) x.tests[0]!.status = 'failed';
    expect(verdict(evaluateTrials(t, examplePolicy))).toBe('fail');
  });
  test('a mutation timeout is unresolved, never detected', () =>
    expect(
      verdict(
        evaluateMutations(
          [
            {
              id: '1',
              file: 'x.ts',
              line: 1,
              mutator: 'BooleanLiteral',
              replacement: 'false',
              status: 'unresolved',
              engineStatus: 'Timeout',
              killedBy: [],
            },
          ],
          true,
        ),
      ),
    ).toBe('inconclusive'));
  test('incomplete mutation work cannot pass', () =>
    expect(verdict(evaluateMutations([], false))).toBe('inconclusive'));
  test('surviving mutations are review findings', () =>
    expect(
      verdict(
        evaluateMutations(
          [
            {
              id: '1',
              file: 'x.ts',
              line: 1,
              mutator: 'BooleanLiteral',
              replacement: 'false',
              status: 'survived',
              engineStatus: 'Survived',
              killedBy: [],
            },
          ],
          true,
        ),
      ),
    ).toBe('fail'));
  test('candidate-authored skip and dependency edits are visible', () => {
    const { base, head, policy } = examplePair();
    head.files['tests/access.test.ts'] += 'test.skip("hidden",()=>{});';
    const s = snapshot(head.files);
    expect(
      inspectWeakening(base, s, policy).some((f) => f.code === 'TEST_SELECTION_WEAKENED'),
    ).toBe(true);
  });
});
describe('snapshot boundary', () => {
  for (const p of [
    '../private.ts',
    'C:/private.ts',
    '/etc/passwd',
    'src\\bad.ts',
    '.env',
    'node_modules/x.ts',
    '.git/config',
    '.proofgate/token',
  ])
    test(`rejects ${p}`, () => expect(() => validateSourcePath(p)).toThrow());
  test('hash is independent of insertion order', () =>
    expect(snapshot({ 'b.ts': 'b', 'a.ts': 'a' }).hash).toBe(
      snapshot({ 'a.ts': 'a', 'b.ts': 'b' }).hash,
    ));
  test('source edits change identity', () =>
    expect(snapshot({ 'a.ts': 'a' }).hash).not.toBe(snapshot({ 'a.ts': 'b' }).hash));
  test('case collisions fail closed', () =>
    expect(() => snapshot({ 'A.ts': 'a', 'a.ts': 'b' })).toThrow());
  test('refuses invalid policy bounds and implementation/test overlap', () =>
    expect(() =>
      policySchema.parse({ ...examplePolicy, budget: { ...examplePolicy.budget, mutants: 100 } }),
    ).toThrow());
});
