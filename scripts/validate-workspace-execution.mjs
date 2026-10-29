import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { workspaceExample } from '../dist/packages/core/src/workspace-example.js';
import { verify, imageId } from '../dist/packages/runner/src/index.js';
import { prepareDependencies } from '../dist/packages/runner/src/dependencies.js';

const data = fileURLToPath(new URL('../.proofgate-workspace-validation/', import.meta.url));
const reports = new URL('../artifacts/workspace-execution/', import.meta.url);
await mkdir(reports, { recursive: true });
const runner = await imageId();
const image = await prepareDependencies(workspaceExample().head, runner, data);
const cases = process.argv.includes('--spike')
  ? ['strong']
  : ['strong', 'weak', 'broken', 'crash', 'cap', 'budget', 'cancel'];
for (const kind of cases) {
  const pair = workspaceExample(['weak', 'broken', 'crash'].includes(kind) ? kind : 'strong');
  if (kind === 'cap')
    pair.policy = { ...pair.policy, budget: { ...pair.policy.budget, mutants: 1 } };
  if (kind === 'budget')
    pair.policy = { ...pair.policy, budget: { ...pair.policy.budget, totalMs: 1000 } };
  const controller = new AbortController();
  const timer = kind === 'cancel' ? setTimeout(() => controller.abort(), 600) : undefined;
  const e = await verify({
    ...pair,
    dataDir: data,
    projectId: randomUUID(),
    image,
    baseImage: runner,
    signal: controller.signal,
    onProgress: (stage) => console.log(`workspace ${kind}: ${stage}`),
  });
  if (timer) clearTimeout(timer);
  await writeFile(new URL(kind + '.json', reports), JSON.stringify(e, null, 2));
  console.log(
    JSON.stringify({
      kind,
      verdict: e.verdict,
      trials: e.trials.length,
      mutations: e.mutations.length,
      findings: e.findings,
    }),
  );
  if (kind === 'strong') {
    if (
      e.verdict !== 'pass' ||
      e.schemaVersion !== 2 ||
      e.trials.length !== 7 ||
      e.workspace?.members.some((m) => m.status !== 'pass')
    )
      throw Error('WORKSPACE_STRONG_FAILED');
    if (
      !e.mutations.some(
        (m) =>
          m.status === 'detected' &&
          m.file.startsWith('packages/access/') &&
          m.killedBy.some((id) => id.startsWith('apps/api::')),
      )
    )
      throw Error('WORKSPACE_CONSUMER_MUTATION_NOT_OBSERVED');
    if (!e.workspace.links.some((l) => l.root.startsWith('/scratch/stryker/')))
      throw Error('WORKSPACE_MUTATION_ROOT_NOT_OBSERVED');
    if (!e.workspace.unselected.includes('packages/unrelated'))
      throw Error('WORKSPACE_UNVERIFIED_SCOPE_MISSING');
  } else if (e.verdict === 'pass') throw Error('WORKSPACE_NEGATIVE_PASSED');
  if (kind === 'weak' && !e.findings.some((f) => f.code === 'REGRESSION_NOT_DISCRIMINATING'))
    throw Error('WORKSPACE_WEAK_NOT_REJECTED');
  if (kind === 'cancel' && e.state !== 'canceled') throw Error('WORKSPACE_CANCEL_FAILED');
}
