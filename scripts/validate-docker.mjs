import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { verify, imageId } from '../dist/packages/runner/src/index.js';
import { examplePair } from '../dist/packages/core/src/examples.js';
const dir = new URL('../artifacts/docker-validation/', import.meta.url).pathname;
const dataDir = new URL('../.proofgate-validation/', import.meta.url);
const { fileURLToPath } = await import('node:url');
await mkdir(fileURLToPath(new URL('../artifacts/docker-validation/', import.meta.url)), {
  recursive: true,
});
const image = await imageId();
const reports = [];
const cases = process.argv.includes('--all')
  ? ['strong', 'weak', 'broken', 'crash', 'cap', 'budget', 'cancel']
  : process.argv.includes('--negative')
    ? ['weak', 'broken', 'crash', 'cap', 'budget', 'cancel']
    : ['strong'];
for (const kind of cases) {
  const pair = examplePair(['strong', 'weak', 'broken', 'crash'].includes(kind) ? kind : 'strong');
  if (kind === 'cap')
    pair.policy = { ...pair.policy, budget: { ...pair.policy.budget, mutants: 1 } };
  if (kind === 'budget')
    pair.policy = { ...pair.policy, budget: { ...pair.policy.budget, totalMs: 1000 } };
  const controller = new AbortController();
  const cancel = kind === 'cancel' ? setTimeout(() => controller.abort(), 800) : undefined;
  const e = await verify({
    dataDir: fileURLToPath(dataDir),
    projectId: randomUUID(),
    ...pair,
    image,
    signal: controller.signal,
    onProgress: (stage) => console.log(`${kind}: ${stage}`),
  });
  if (cancel) clearTimeout(cancel);
  await writeFile(
    new URL(`../artifacts/docker-validation/${kind}.json`, import.meta.url),
    JSON.stringify(e, null, 2),
  );
  console.log(
    JSON.stringify({
      kind,
      verdict: e.verdict,
      trials: e.trials.length,
      mutations: e.mutations.length,
      findings: e.findings.map((x) => x.code),
    }),
  );
  reports.push(e);
  if (kind === 'strong' && e.verdict !== 'pass') {
    console.error(e.findings.slice(0, 3));
    process.exitCode = 1;
    break;
  }
  if (kind !== 'strong' && e.verdict === 'pass') {
    process.exitCode = 1;
    break;
  }
  if (kind === 'weak' && !e.findings.some((f) => f.code === 'REGRESSION_NOT_DISCRIMINATING'))
    throw new Error('Weak test did not produce expected finding');
  if (
    kind === 'cap' &&
    (e.mutations.length !== 0 ||
      !e.findings.some((f) => f.detail.includes('MUTATION_CAP_EXCEEDED')))
  )
    throw new Error('Mutation cap did not abort before execution');
  if (kind === 'cancel' && e.state !== 'canceled')
    throw new Error('Cancellation did not propagate');
}
