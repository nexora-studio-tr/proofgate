import { z } from 'zod';

export const VERSION = '0.1.0-alpha.2';
export const idSchema = z.string().uuid();
export const relativePath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (p) =>
      !/[\x00-\x1f\x7f]/.test(p) &&
      !p.includes('\\') &&
      !p.startsWith('/') &&
      !p.includes(':') &&
      !p
        .split('/')
        .some((s) => !s || ['.', '..', '__proto__', 'prototype', 'constructor'].includes(s)),
    'Safe relative path required',
  );
export const budgetSchema = z
  .object({
    stageMs: z.number().int().min(1000).max(120000).default(120000),
    totalMs: z.number().int().min(1000).max(600000).default(600000),
    mutants: z.number().int().min(1).max(25).default(25),
  })
  .strict();
export const singlePolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    testFiles: z.array(relativePath).min(1).max(30),
    requiredTests: z.array(z.string().min(1).max(400)).min(1).max(200),
    regressionTest: z.string().min(1).max(400),
    expectedFailure: z.string().min(1).max(1000),
    productionFiles: z.array(relativePath).min(1).max(30),
    budget: budgetSchema,
  })
  .strict()
  .superRefine((p, c) => {
    for (const f of p.testFiles)
      if (!/\.(test|spec)\.[cm]?[jt]s$/.test(f))
        c.addIssue({ code: 'custom', message: 'Only standalone test files are transferable' });
    if (p.productionFiles.some((f) => p.testFiles.includes(f)))
      c.addIssue({ code: 'custom', message: 'Test/production overlap' });
  });
export function workspaceTestId(member: string, file: string, name: string) {
  return `${member}::${file}::${name}`;
}
export const workspacePolicySchema = z
  .object({
    schemaVersion: z.literal(2),
    profile: z.literal('npm-workspace-node-v1'),
    members: z
      .array(
        z
          .object({
            path: relativePath,
            baselineTests: z.array(z.string().min(1).max(1000)).min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    testFiles: z.array(relativePath).min(1).max(30),
    requiredTests: z.array(z.string().min(1).max(1000)).min(1).max(200),
    regressionTest: z.string().min(1).max(1000),
    expectedFailure: z.string().min(1).max(1000),
    productionFiles: z.array(relativePath).min(1).max(30),
    budget: budgetSchema,
  })
  .strict()
  .superRefine((p, c) => {
    const problem = (message: string) => c.addIssue({ code: 'custom', message });
    const paths = p.members.map((m) => m.path);
    if (new Set(paths).size !== paths.length) problem('Duplicate workspace member');
    for (const files of [
      p.testFiles,
      p.productionFiles,
      p.requiredTests,
      ...p.members.map((m) => m.baselineTests),
    ])
      if (new Set(files).size !== files.length) problem('Duplicate policy entry');
    for (const file of p.testFiles)
      if (!/\.(test|spec)\.[cm]?[jt]s$/.test(file)) problem('Standalone tests required');
    for (const file of [...p.testFiles, ...p.productionFiles])
      if (!paths.some((root) => file.startsWith(root + '/')))
        problem('File outside registered workspace members');
    if (p.productionFiles.some((f) => p.testFiles.includes(f))) problem('Test/production overlap');
    for (const id of [
      ...p.requiredTests,
      p.regressionTest,
      ...p.members.flatMap((m) => m.baselineTests),
    ]) {
      const [member, file, ...names] = id.split('::');
      if (
        !member ||
        !file ||
        !names.join('::') ||
        !paths.includes(member) ||
        !p.testFiles.includes(file) ||
        !file.startsWith(member + '/')
      )
        problem('Test identity must bind member, file and name');
    }
    if (!p.requiredTests.includes(p.regressionTest)) problem('Regression must be required');
    for (const m of p.members) {
      if (!p.requiredTests.some((id) => id.startsWith(m.path + '::')))
        problem('Member has no required test');
      if (m.baselineTests.some((id) => !id.startsWith(m.path + '::')))
        problem('Baseline identity member mismatch');
    }
  });
export const policySchema = z.union([singlePolicySchema, workspacePolicySchema]);
export type Policy = z.infer<typeof policySchema>;
export type WorkspacePolicy = z.infer<typeof workspacePolicySchema>;
export type Verdict = 'pass' | 'fail' | 'inconclusive';
export type State =
  'queued' | 'preparing' | 'running' | 'collecting' | 'completed' | 'canceled' | 'interrupted';
export interface Snapshot {
  hash: string;
  files: Record<string, string>;
  manifest: Record<string, string>;
}
export interface TestObservation {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  assertion: boolean;
  packagePath?: string | undefined;
  file?: string | undefined;
  fullName?: string | undefined;
}
export interface Trial {
  variant: 'B' | 'C' | 'H';
  index: number;
  status: 'complete' | 'timeout' | 'error';
  tests: TestObservation[];
  errors: string[];
  elapsedMs: number;
}
export interface Mutation {
  id: string;
  file: string;
  line: number;
  mutator: string;
  replacement: string;
  status: 'detected' | 'survived' | 'uncovered' | 'invalid' | 'unresolved';
  engineStatus: string;
  killedBy: string[];
}
export interface Finding {
  code: string;
  severity: 'fail' | 'inconclusive' | 'warning';
  detail: string;
  file?: string;
}
export interface Evidence {
  schemaVersion: 1 | 2;
  toolVersion: string;
  runId: string;
  projectId: string;
  startedAt: string;
  finishedAt: string;
  baseHash: string;
  candidateHash: string;
  policyHash: string;
  lockHash: string;
  image: string;
  scope: string[];
  state: State;
  verdict: Verdict;
  findings: Finding[];
  trials: Trial[];
  mutations: Mutation[];
  mutationScope: {
    selected: number;
    attempted: number;
    omitted: number;
    complete: boolean;
    locations?: string[];
  };
  elapsedMs: number;
  budget: z.infer<typeof budgetSchema>;
  simulated: boolean;
  planHash?: string;
  workspace?: {
    profile: 'npm-workspace-node-v1';
    impactHash: string;
    selected: { path: string; name: string; reason: string; via: string[] }[];
    unselected: string[];
    links: { root: string; links: { name: string; target: string }[] }[];
    npmVersion?: string;
    members: { path: string; required: number; observed: number; status: Verdict }[];
  };
}
export const verifyInput = z
  .object({
    projectId: idSchema,
    baseRef: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9_./~-]+$/),
    include: z.array(relativePath).max(30).default([]),
  })
  .strict();
export const planInput = verifyInput;
export const finding = (code: string, severity: Finding['severity'], detail: string): Finding => ({
  code,
  severity,
  detail,
});
