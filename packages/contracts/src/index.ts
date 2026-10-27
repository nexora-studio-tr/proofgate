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
export const policySchema = z
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
export type Policy = z.infer<typeof policySchema>;
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
  schemaVersion: 1;
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
