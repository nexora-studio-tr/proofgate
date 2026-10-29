import type {
  Policy,
  Snapshot,
  WorkspacePolicy,
  Trial,
  Finding,
} from '../../contracts/src/index.js';
import { finding } from '../../contracts/src/index.js';
import { changedFiles, digest, stable } from './index.js';
import { workspaceImpact } from './workspace.js';

export function workspacePlan(base: Snapshot, head: Snapshot, policy: WorkspacePolicy) {
  const impact = workspaceImpact(base, head);
  if (impact.kind !== 'npm-workspaces' || impact.status !== 'complete')
    throw Error('WORKSPACE_GRAPH_UNSUPPORTED');
  if (impact.cycles.length) throw Error('WORKSPACE_CYCLE_UNSUPPORTED');
  const root = JSON.parse(head.files['package.json']!);
  if (!Array.isArray(root.workspaces)) throw Error('WORKSPACE_DECLARATION_UNSUPPORTED');
  const members = impact.packages.filter((p) => p.path !== '.');
  if (members.some((p) => !p.before || !p.after)) throw Error('WORKSPACE_TOPOLOGY_CHANGED');
  for (const p of impact.packages) {
    const file = p.path === '.' ? 'package.json' : p.path + '/package.json';
    if (base.files[file] !== head.files[file]) throw Error('WORKSPACE_MANIFEST_CHANGED');
  }
  if (base.files['package-lock.json'] !== head.files['package-lock.json'])
    throw Error('DEPENDENCY_MISMATCH');
  const selected = new Set(policy.members.map((m) => m.path));
  if ([...selected].some((p) => !members.some((m) => m.path === p)))
    throw Error('WORKSPACE_MEMBER_UNKNOWN');
  for (const file of changedFiles(base, head)) {
    if (
      !members.some((p) => file.startsWith(p.path + '/')) ||
      /(?:^|\/)(?:package(?:-lock)?\.json|.*\.config\.[^/]+|tsconfig[^/]*\.json)$/.test(file)
    )
      throw Error('WORKSPACE_CONFIGURATION_CHANGED');
  }
  if (impact.affected.some((p) => p.path !== '.' && !selected.has(p.path)))
    throw Error('WORKSPACE_SELECTION_INCOMPLETE');
  const reserved = ['proofgate.vitest.config.mjs', 'proofgate.workspace.json'];
  if (reserved.some((f) => f in base.files || f in head.files))
    throw Error('WORKSPACE_RESERVED_PATH');
  for (const file of policy.testFiles)
    if (!(file in head.files)) throw Error('REGRESSION_FILE_MISSING');
  for (const m of policy.members)
    for (const id of m.baselineTests) {
      const file = id.split('::')[1]!;
      if (!(file in base.files)) throw Error('WORKSPACE_BASELINE_MISSING');
    }
  const links = members
    .map((m) => ({ name: m.name, path: m.path }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedMembers = members
    .filter((m) => selected.has(m.path))
    .map((m) => {
      const why = impact.affected.find((a) => a.path === m.path);
      return {
        path: m.path,
        name: m.name,
        reason: why?.reason ?? 'required',
        via: why?.via ?? [m.path],
      };
    });
  const manifestHash = digest(
    stable(
      Object.fromEntries(
        Object.entries(head.files).filter(([f]) => /(?:^|\/)package(?:-lock)?\.json$/.test(f)),
      ),
    ),
  );
  return {
    profile: policy.profile,
    impactHash: digest(stable(impact)),
    links,
    selected: selectedMembers,
    unselected: members.filter((m) => !selected.has(m.path)).map((m) => m.path),
    manifestHash,
  };
}
export function planDigest(
  base: Snapshot,
  head: Snapshot,
  policy: Policy,
  baseImage: string,
  image: string,
) {
  return digest(
    stable({
      schemaVersion: policy.schemaVersion,
      baseHash: base.hash,
      candidateHash: head.hash,
      policy,
      baseImage,
      image,
      adapter: 'npm-workspace-node-v1',
      workspace: policy.schemaVersion === 2 ? workspacePlan(base, head, policy) : null,
      runtime: 'node24-vitest5.0.5-stryker10.1.1',
      environment: { CI: 'true', TZ: 'UTC', network: 'none' },
    }),
  );
}
export function workspaceTrialFindings(trials: Trial[], policy: WorkspacePolicy): Finding[] {
  const out: Finding[] = [];
  for (const trial of trials)
    for (const m of policy.members) {
      const required =
        trial.variant === 'B'
          ? m.baselineTests
          : policy.requiredTests.filter((id) => id.startsWith(m.path + '::'));
      if (required.some((id) => !trial.tests.some((t) => t.name === id)))
        out.push(
          finding(
            'WORKSPACE_REQUIRED_TEST_MISSING',
            trial.variant === 'H' ? 'fail' : 'inconclusive',
            `${trial.variant}${trial.index}: ${m.path}`,
          ),
        );
    }
  return out;
}
