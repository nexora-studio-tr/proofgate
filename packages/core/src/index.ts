import { createHash } from 'node:crypto';
import type {
  Evidence,
  Finding,
  Mutation,
  Policy,
  Snapshot,
  Trial,
  Verdict,
} from '../../contracts/src/index.js';
import { finding } from '../../contracts/src/index.js';

export function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
    .join(',')}}`;
}
export function policyDigest(policy: Policy): string {
  return digest(stable(policy));
}
export function verdict(findings: Finding[]): Verdict {
  return findings.some((f) => f.severity === 'fail')
    ? 'fail'
    : findings.some((f) => f.severity === 'inconclusive')
      ? 'inconclusive'
      : 'pass';
}
export function changedFiles(base: Snapshot, head: Snapshot): string[] {
  return [...new Set([...Object.keys(base.files), ...Object.keys(head.files)])]
    .filter((f) => base.manifest[f] !== head.manifest[f])
    .sort();
}
export function inspectWeakening(base: Snapshot, head: Snapshot, policy: Policy): Finding[] {
  const result: Finding[] = [];
  for (const f of changedFiles(base, head)) {
    if (policy.testFiles.includes(f) && !(f in head.files))
      result.push({
        ...finding('MANDATORY_TEST_REMOVED', 'fail', 'A registered test file was removed.'),
        file: f,
      });
    if (
      /\.(test|spec)\.[cm]?[jt]s$/.test(f) &&
      /\b(?:it|test|describe)\s*\.\s*(?:skip|only|todo)\b/.test(head.files[f] ?? '') &&
      base.files[f] !== head.files[f]
    )
      result.push({
        ...finding(
          'TEST_SELECTION_WEAKENED',
          'fail',
          'Changed tests contain skip, only or todo; review the test selection.',
        ),
        file: f,
      });
    if (/\.(snap)$|(?:vitest|stryker|vite)\.config\.|(?:^|\/)package(?:-lock)?\.json$/.test(f))
      result.push({
        ...finding(
          'CONFIGURATION_CHANGED',
          'inconclusive',
          'Dependencies, snapshots or test configuration changed; profile review is required.',
        ),
        file: f,
      });
    if (/Stryker disable/.test(head.files[f] ?? '') && base.files[f] !== head.files[f])
      result.push({
        ...finding(
          'MUTATION_EXCLUSION_CHANGED',
          'fail',
          'A changed source file includes a mutation exclusion.',
        ),
        file: f,
      });
  }
  return result;
}
export function evaluateTrials(trials: Trial[], policy: Policy): Finding[] {
  const out: Finding[] = [];
  const base = trials.filter((t) => t.variant === 'B');
  const c = trials.filter((t) => t.variant === 'C');
  const h = trials.filter((t) => t.variant === 'H');
  if (base.length !== 1 || c.length !== 3 || h.length !== 3)
    out.push(
      finding(
        'MISSING_TRIALS',
        'inconclusive',
        'One baseline and three fresh C/H trials are required.',
      ),
    );
  for (const t of trials) {
    if (new Set(t.tests.map((x) => x.name)).size !== t.tests.length)
      out.push(
        finding(
          'AMBIGUOUS_TEST_ID',
          'inconclusive',
          `${t.variant}${t.index}: test names must be unique in the registered scope.`,
        ),
      );
    if (t.status !== 'complete' || t.errors.length)
      out.push(
        finding(
          t.status === 'timeout' ? 'STAGE_TIMEOUT' : 'EXECUTION_ERROR',
          'inconclusive',
          `${t.variant}${t.index}: ${t.errors[0] ?? t.status}`,
        ),
      );
    if (!t.tests.length)
      out.push(
        finding('NO_TESTS', 'inconclusive', `${t.variant}${t.index}: no tests were collected.`),
      );
    if (t.tests.some((x) => x.status === 'skipped'))
      out.push(finding('SKIPPED_TEST', 'fail', `${t.variant}${t.index}: a test was skipped.`));
  }
  if (base.some((t) => t.tests.some((x) => x.status === 'failed')))
    out.push(
      finding('BASELINE_UNHEALTHY', 'inconclusive', 'The original test suite already fails.'),
    );
  for (const t of h) {
    if (t.status !== 'complete' || t.errors.length || !t.tests.length) continue;
    if (t.tests.some((x) => x.status === 'failed'))
      out.push(
        finding('CANDIDATE_TEST_FAILED', 'fail', `Candidate trial ${t.index} has failing tests.`),
      );
    for (const required of policy.requiredTests)
      if (!t.tests.some((x) => x.name === required))
        out.push(
          finding('MANDATORY_TEST_MISSING', 'fail', `Required test not collected: ${required}`),
        );
  }
  for (const group of [c, h]) {
    const signatures = group.map((t) =>
      stable(
        t.tests
          .map((x) => ({ name: x.name, status: x.status, message: x.message }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
    if (new Set(signatures).size > 1)
      out.push(
        finding(
          'UNSTABLE_RESULT',
          'inconclusive',
          `${group[0]?.variant ?? 'Trial'} outcomes differed across fresh trials.`,
        ),
      );
  }
  for (const t of c) {
    if (t.status !== 'complete' || t.errors.length || !t.tests.length) continue;
    const test = t.tests.find((x) => x.name === policy.regressionTest);
    if (!test)
      out.push(
        finding(
          'REGRESSION_TEST_MISSING',
          'inconclusive',
          'The regression test was not collected on the original implementation.',
        ),
      );
    else if (test.status === 'passed')
      out.push(
        finding(
          'REGRESSION_NOT_DISCRIMINATING',
          'fail',
          'The regression test also passes on the original implementation.',
        ),
      );
    else if (!test.assertion || !test.message.includes(policy.expectedFailure))
      out.push(
        finding(
          'FAILURE_SIGNATURE_MISMATCH',
          'inconclusive',
          'The original failed for a different or non-assertion reason.',
        ),
      );
  }
  for (const t of h)
    if (
      t.status === 'complete' &&
      !t.errors.length &&
      t.tests.length &&
      !t.tests.some((x) => x.name === policy.regressionTest && x.status === 'passed')
    )
      out.push(
        finding(
          'REGRESSION_NOT_FIXED',
          'fail',
          'The exact regression test did not pass on the candidate.',
        ),
      );
  return [...new Map(out.map((f) => [`${f.code}:${f.detail}`, f])).values()];
}
export function evaluateMutations(mutations: Mutation[], complete: boolean): Finding[] {
  const out: Finding[] = [];
  if (!complete || mutations.length === 0)
    out.push(
      finding(
        'MUTATION_SCOPE_INCOMPLETE',
        'inconclusive',
        'The declared mutation scope did not complete.',
      ),
    );
  for (const m of mutations) {
    if (m.status === 'survived' || m.status === 'uncovered')
      out.push({
        ...finding(
          m.status === 'survived' ? 'MUTATION_SURVIVED' : 'MUTATION_UNCOVERED',
          'fail',
          `${m.mutator} at line ${m.line}: ${m.status}. Review; equivalence is not decided automatically.`,
        ),
        file: m.file,
      });
    if (m.status === 'invalid' || m.status === 'unresolved')
      out.push({
        ...finding(
          'MUTATION_UNRESOLVED',
          'inconclusive',
          `${m.mutator} at line ${m.line}: ${m.engineStatus}.`,
        ),
        file: m.file,
      });
  }
  return out;
}
export function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function htmlReport(e: Evidence): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProofGate evidence</title><style>body{font:16px system-ui;max-width:1000px;margin:48px auto;padding:24px;color:#17251f;background:#f4f4ef}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ccd4cc;padding:12px}code{overflow-wrap:anywhere}h1{font-size:44px}small{color:#536259}</style><h1>ProofGate / ${escapeHtml(e.verdict)}</h1><p>${e.simulated ? 'Bundled synthetic example; no live project was executed.' : 'Observed execution evidence; applies only to the recorded scope.'}</p><p>Candidate <code>${escapeHtml(e.candidateHash)}</code></p><p>Image <code>${escapeHtml(e.image)}</code></p><p>${e.trials.length} trials · ${e.mutations.length} mutations · ${Math.round(e.elapsedMs / 1000)} seconds</p><table><tr><th>Code</th><th>Observation</th></tr>${e.findings.map((f) => `<tr><td>${escapeHtml(f.code)}</td><td>${escapeHtml(f.detail)}</td></tr>`).join('')}</table><h2>Test observations</h2><table><tr><th>Trial</th><th>Test</th><th>Status</th></tr>${e.trials.flatMap((t) => t.tests.map((x) => `<tr><td>${t.variant}${t.index}</td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.status)}</td></tr>`)).join('')}</table><p><small>Not a general correctness or security certificate. Evidence schema ${e.schemaVersion}, tool ${escapeHtml(e.toolVersion)}.</small></p></html>`;
}
