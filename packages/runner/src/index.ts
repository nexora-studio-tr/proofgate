import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Evidence, Mutation, Policy, Snapshot, Trial } from '../../contracts/src/index.js';
import { VERSION, finding } from '../../contracts/src/index.js';
import {
  changedFiles,
  digest,
  evaluateMutations,
  evaluateTrials,
  inspectWeakening,
  policyDigest,
  verdict,
} from '../../core/src/index.js';
import { docker } from './process.js';

const observation = z.object({
  name: z.string().max(400),
  status: z.enum(['passed', 'failed', 'skipped']),
  message: z.string().max(16000),
  assertion: z.boolean(),
});
const testResult = z.object({
  tests: z.array(observation).max(1000),
  errors: z.array(z.string().max(16000)).max(50),
});
export interface ExecutionOptions {
  dataDir: string;
  projectId: string;
  base: Snapshot;
  head: Snapshot;
  policy: Policy;
  image: string;
  runId?: string;
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
}
export async function imageId(tag = 'proofgate-runner:0.1.0'): Promise<string> {
  const r = await docker(['image', 'inspect', '--format', '{{.Id}}', tag], { timeout: 15000 });
  if (r.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(r.stdout.trim()))
    throw new Error('RUNNER_IMAGE_MISSING: run doctor --build');
  return r.stdout.trim();
}
async function container(
  input: unknown,
  image: string,
  dir: string,
  timeout: number,
  signal: AbortSignal | undefined,
): Promise<{ data: any; elapsedMs: number; timedOut: boolean; error: string }> {
  const start = Date.now(),
    name = `proofgate-${randomUUID()}`;
  const inputDir = path.join(dir, name);
  await mkdir(inputDir, { recursive: true });
  const inputFile = path.join(inputDir, 'input.json');
  await writeFile(inputFile, JSON.stringify(input), { mode: 0o600 });
  if (process.platform !== 'win32') {
    // The read-only mount must be readable by container UID 1000 even when the host UID differs.
    // Its private outer run directory still prevents access by other host users.
    await chmod(inputDir, 0o755);
    await chmod(inputFile, 0o444);
  }
  if (inputDir.includes(',')) throw new Error('Comma in data directory unsupported');
  try {
    const result = await docker(
      [
        'run',
        '--pull',
        'never',
        '--rm',
        '--name',
        name,
        '--label',
        'app.proofgate.owned=true',
        '--label',
        `app.proofgate.run=${path.basename(dir)}`,
        '--network',
        'none',
        '--read-only',
        '--user',
        '1000:1000',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--cpus',
        '2',
        '--memory',
        '2g',
        '--memory-swap',
        '2g',
        '--pids-limit',
        '256',
        '--tmpfs',
        '/scratch:rw,exec,nosuid,size=268435456,uid=1000,gid=1000',
        '--mount',
        `type=bind,source=${inputDir},target=/input,readonly`,
        image,
      ],
      { timeout, ...(signal ? { signal } : {}) },
    );
    const markers = result.stdout.split(/\r?\n/).filter((s) => s.startsWith('PROOFGATE_RESULT:'));
    if (result.code !== 0 || result.timedOut || markers.length !== 1)
      return {
        data: null,
        elapsedMs: Date.now() - start,
        timedOut: result.timedOut,
        error: (result.stderr + '\n' + result.stdout || 'Missing sandbox output').slice(-3500),
      };
    const raw = Buffer.from(markers[0]!.slice(17), 'base64').toString('utf8');
    if (raw.length > 2 * 1024 * 1024) throw new Error('Sandbox output too large');
    return { data: JSON.parse(raw), elapsedMs: Date.now() - start, timedOut: false, error: '' };
  } catch (e) {
    return {
      data: null,
      elapsedMs: Date.now() - start,
      timedOut: false,
      error: String(e).slice(0, 1500),
    };
  } finally {
    const owned = await docker(
      ['inspect', '--format', '{{index .Config.Labels "app.proofgate.run"}}', name],
      { timeout: 15000 },
    ).catch(() => null);
    if (owned?.stdout.trim() === path.basename(dir))
      await docker(['rm', '-f', name], { timeout: 15000 }).catch(() => {});
    await rm(inputDir, { recursive: true, force: true });
  }
}
export async function verify(options: ExecutionOptions): Promise<Evidence> {
  const { base, head, policy, projectId } = options;
  const started = Date.now(),
    runId = options.runId ?? randomUUID();
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid run identity');
  if (!/^sha256:[a-f0-9]{64}$/.test(options.image))
    throw new Error('Only an existing immutable Docker image ID is permitted');
  const work = path.join(path.resolve(options.dataDir), 'work', runId);
  await mkdir(work, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(work, 0o700);
  const e: Evidence = {
    schemaVersion: 1,
    toolVersion: VERSION,
    runId,
    projectId,
    startedAt: new Date(started).toISOString(),
    finishedAt: '',
    baseHash: base.hash,
    candidateHash: head.hash,
    policyHash: policyDigest(policy),
    lockHash: digest(head.files['package-lock.json'] ?? ''),
    image: options.image,
    scope: changedFiles(base, head),
    state: 'running',
    verdict: 'inconclusive',
    findings: inspectWeakening(base, head, policy),
    trials: [],
    mutations: [],
    mutationScope: { selected: 0, attempted: 0, omitted: 0, complete: false },
    elapsedMs: 0,
    budget: policy.budget,
    simulated: false,
  };
  const remaining = () =>
    Math.min(policy.budget.stageMs, policy.budget.totalMs - (Date.now() - started));
  const check = () => {
    if (options.signal?.aborted) throw new Error('CANCELED');
    if (remaining() <= 0) throw new Error('TOTAL_BUDGET_EXCEEDED');
  };
  const trial = async (variant: Trial['variant'], index: number, files: Record<string, string>) => {
    check();
    options.onProgress?.(`${variant}${index}`);
    const r = await container(
      { mode: 'test', files, testFiles: policy.testFiles },
      options.image,
      work,
      remaining(),
      options.signal,
    );
    const parsed = testResult.safeParse(r.data);
    e.trials.push({
      variant,
      index,
      status: r.timedOut ? 'timeout' : parsed.success ? 'complete' : 'error',
      tests: parsed.success ? parsed.data.tests : [],
      errors: parsed.success ? parsed.data.errors : [r.error || 'Invalid test report'],
      elapsedMs: r.elapsedMs,
    });
  };
  try {
    if (
      base.files['package-lock.json'] !== head.files['package-lock.json'] ||
      base.files['package.json'] !== head.files['package.json']
    )
      throw new Error('DEPENDENCY_MISMATCH');
    const c = { ...base.files };
    for (const f of policy.testFiles) {
      if (!(f in head.files)) throw new Error('REGRESSION_FILE_MISSING');
      c[f] = head.files[f]!;
    }
    await trial('B', 1, base.files);
    for (let i = 1; i <= 3; i++) {
      await trial('C', i, c);
      await trial('H', i, head.files);
    }
    e.findings.push(...evaluateTrials(e.trials, policy));
    const mutate = policy.productionFiles
      .filter((f) => base.manifest[f] !== head.manifest[f] && f in head.files)
      .map((f) => {
        const a = (base.files[f] ?? '').split(/\r?\n/),
          b = head.files[f]!.split(/\r?\n/);
        let start = 0,
          end = 0;
        while (start < a.length && start < b.length && a[start] === b[start]) start++;
        while (
          end < a.length - start &&
          end < b.length - start &&
          a[a.length - 1 - end] === b[b.length - 1 - end]
        )
          end++;
        return `${f}:${start + 1}-${Math.max(start + 1, b.length - end)}`;
      });
    if (!mutate.length)
      e.findings.push(
        finding('NO_EXECUTABLE_CHANGE', 'inconclusive', 'No registered executable source changed.'),
      );
    else {
      check();
      options.onProgress?.('mutations');
      const r = await container(
        {
          mode: 'mutation',
          files: head.files,
          testFiles: policy.testFiles,
          mutate,
          cap: policy.budget.mutants,
        },
        options.image,
        work,
        remaining(),
        options.signal,
      );
      if (r.data?.report && r.data?.scope) {
        const report = r.data.report;
        const scope = r.data.scope;
        for (const [file, detail] of Object.entries(report.files ?? {}) as [string, any][]) {
          for (const m of detail.mutants ?? []) {
            const killedBy = Array.isArray(m.killedBy) ? m.killedBy.map(String) : [];
            const status: Mutation['status'] =
              m.status === 'Killed' && killedBy.length
                ? 'detected'
                : m.status === 'Survived'
                  ? 'survived'
                  : m.status === 'NoCoverage'
                    ? 'uncovered'
                    : ['CompileError', 'RuntimeError'].includes(m.status)
                      ? 'invalid'
                      : 'unresolved';
            e.mutations.push({
              id: String(m.id),
              file,
              line: Number(m.location?.start?.line ?? 0),
              mutator: String(m.mutatorName),
              replacement: String(m.replacement ?? '').slice(0, 1000),
              status,
              engineStatus: String(m.status),
              killedBy,
            });
          }
        }
        if (
          !Number.isInteger(scope.selected) ||
          scope.selected < 1 ||
          scope.selected > policy.budget.mutants ||
          e.mutations.length !== scope.selected
        )
          throw new Error('MUTATION_BUDGET_PROTOCOL_ERROR');
        e.mutationScope = {
          selected: scope.selected,
          attempted: e.mutations.length,
          omitted: scope.omitted,
          complete: true,
          locations: mutate,
        };
      } else
        e.findings.push(
          finding(
            r.timedOut ? 'MUTATION_TIMEOUT' : 'MUTATION_EXECUTION_ERROR',
            'inconclusive',
            r.error || 'No mutation report.',
          ),
        );
    }
    e.findings.push(...evaluateMutations(e.mutations, e.mutationScope.complete));
  } catch (error) {
    const reason = String(error);
    if (reason.includes('CANCELED') || options.signal?.aborted) e.state = 'canceled';
    e.findings.push(
      finding(
        options.signal?.aborted
          ? 'CANCELED'
          : reason.includes('BUDGET')
            ? 'TOTAL_BUDGET_EXCEEDED'
            : 'EXECUTION_BLOCKED',
        'inconclusive',
        reason,
      ),
    );
  } finally {
    if (options.signal?.aborted) {
      e.state = 'canceled';
      if (!e.findings.some((f) => f.code === 'CANCELED'))
        e.findings.push(finding('CANCELED', 'inconclusive', 'Execution was canceled.'));
    } else if (e.state !== 'canceled') e.state = 'completed';
    e.finishedAt = new Date().toISOString();
    e.elapsedMs = Date.now() - started;
    if (
      e.elapsedMs > policy.budget.totalMs &&
      !e.findings.some((f) => f.code === 'TOTAL_BUDGET_EXCEEDED')
    )
      e.findings.push(
        finding('TOTAL_BUDGET_EXCEEDED', 'inconclusive', 'The total run budget was exceeded.'),
      );
    e.verdict = verdict(e.findings);
    await rm(work, { recursive: true, force: true });
  }
  return e;
}
