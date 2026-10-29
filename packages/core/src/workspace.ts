import type { Snapshot } from '../../contracts/src/index.js';
import { relativePath } from '../../contracts/src/index.js';
import { changedFiles } from './index.js';

type Package = { path: string; name: string; dependencies: string[] };
type Diagnostic = { code: string; path: string };
type Graph = {
  kind: 'single-package' | 'npm-workspaces' | 'unsupported';
  packages: Package[];
  diagnostics: Diagnostic[];
};
export interface WorkspaceImpact {
  schemaVersion: 1;
  kind: Graph['kind'];
  status: 'complete' | 'inconclusive';
  baseHash: string;
  candidateHash: string;
  executionSupport: 'reviewed-policy-required';
  packages: {
    path: string;
    name: string;
    before: boolean;
    after: boolean;
    dependencies: string[];
  }[];
  affected: {
    path: string;
    name: string;
    directFiles: string[];
    reason: 'direct' | 'dependent' | 'shared' | 'uncertain';
    via: string[];
  }[];
  sharedFiles: string[];
  cycles: string[][];
  diagnostics: Diagnostic[];
}

function matches(pattern: string, folder: string): boolean {
  const a = pattern.split('/'),
    b = folder.split('/'),
    memo = new Map<string, boolean>();
  const visit = (i: number, j: number): boolean => {
    const key = `${i}:${j}`;
    if (memo.has(key)) return memo.get(key)!;
    const result =
      i === a.length
        ? j === b.length
        : a[i] === '**'
          ? visit(i + 1, j) || (j < b.length && visit(i, j + 1))
          : j < b.length && (a[i] === '*' || a[i] === b[j]) && visit(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}
function graph(snapshot: Snapshot): Graph {
  const diagnostics: Diagnostic[] = [],
    packages: Package[] = [];
  const read = (file: string): Record<string, any> | undefined => {
    try {
      const raw = snapshot.files[file];
      if (!raw || Buffer.byteLength(raw) > 128 * 1024) throw Error();
      const json: unknown = JSON.parse(raw);
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw Error();
      return json as Record<string, any>;
    } catch {
      diagnostics.push({ code: 'INVALID_MANIFEST', path: file });
    }
  };
  const root = read('package.json');
  if (!root) return { kind: 'unsupported', packages, diagnostics };
  const declared = Object.hasOwn(root, 'workspaces');
  if (Object.hasOwn(snapshot.files, 'pnpm-workspace.yaml'))
    diagnostics.push({ code: 'UNSUPPORTED_WORKSPACE_MANAGER', path: 'pnpm-workspace.yaml' });
  const patterns: string[] = [];
  if (declared) {
    const raw = Array.isArray(root.workspaces) ? root.workspaces : root.workspaces?.packages;
    if (!Array.isArray(raw) || raw.length > 50 || !raw.length)
      diagnostics.push({ code: 'UNSUPPORTED_WORKSPACES', path: 'package.json' });
    else
      for (const value of raw) {
        if (
          typeof value !== 'string' ||
          value.length > 200 ||
          value.split('/').length > 8 ||
          !value.split('/').every((p) => p === '*' || p === '**' || /^[a-zA-Z0-9_@.-]+$/.test(p)) ||
          !relativePath.safeParse(value.replaceAll('*', 'x')).success
        )
          diagnostics.push({ code: 'UNSUPPORTED_WORKSPACE_PATTERN', path: 'package.json' });
        else patterns.push(value);
      }
  }
  const manifests = Object.keys(snapshot.files)
    .filter((f) => f.endsWith('/package.json'))
    .sort();
  const selected = manifests.filter((f) => patterns.some((p) => matches(p, f.slice(0, -13))));
  for (const pattern of patterns)
    if (!selected.some((f) => matches(pattern, f.slice(0, -13))))
      diagnostics.push({ code: 'WORKSPACE_PATTERN_UNMATCHED', path: 'package.json' });
  if (selected.length > 99) {
    diagnostics.push({ code: 'PACKAGE_LIMIT', path: 'package.json' });
    return { kind: 'unsupported', packages, diagnostics };
  }
  const entries = [
    ['.', root],
    ...selected.map((file) => [file.slice(0, -13), read(file)] as const),
  ] as const;
  const rawDependencies = new Map<string, string[]>();
  for (const [folder, pkg] of entries) {
    if (!pkg) continue;
    const file = folder === '.' ? 'package.json' : `${folder}/package.json`;
    if (folder !== '.' && Object.hasOwn(pkg, 'workspaces'))
      diagnostics.push({ code: 'NESTED_WORKSPACES', path: file });
    const name =
      typeof pkg.name === 'string' && /^[a-zA-Z0-9_@./-]{1,214}$/.test(pkg.name)
        ? pkg.name
        : folder;
    if (name === folder && pkg.name !== folder && folder !== '.')
      diagnostics.push({ code: 'PACKAGE_NAME_MISSING', path: file });
    packages.push({ path: folder, name, dependencies: [] });
    const dependencies = new Set<string>();
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const object = pkg[field];
      if (object === undefined) continue;
      if (
        !object ||
        typeof object !== 'object' ||
        Array.isArray(object) ||
        Object.keys(object).length > 500
      ) {
        diagnostics.push({ code: 'INVALID_DEPENDENCIES', path: file });
        continue;
      }
      for (const [key, spec] of Object.entries(object)) {
        if (typeof spec !== 'string' || spec.length > 1000) {
          diagnostics.push({ code: 'INVALID_DEPENDENCY_SPEC', path: file });
          continue;
        }
        if (/^(?:file|link|portal):/.test(spec))
          diagnostics.push({ code: 'LOCAL_PATH_DEPENDENCY', path: file });
        const alias = /^npm:((?:@[^/]+\/)?[^@]+)(?:@.*)?$/.exec(spec);
        dependencies.add(alias?.[1] ?? key);
        if (
          spec.startsWith('workspace:') &&
          !entries.some(([, candidate]) => candidate?.name === key)
        )
          diagnostics.push({ code: 'WORKSPACE_DEPENDENCY_MISSING', path: file });
      }
    }
    rawDependencies.set(folder, [...dependencies]);
  }
  const names = new Map<string, string[]>();
  for (const pkg of packages) names.set(pkg.name, [...(names.get(pkg.name) ?? []), pkg.path]);
  for (const paths of names.values())
    if (paths.length > 1)
      for (const folder of paths)
        diagnostics.push({
          code: 'DUPLICATE_PACKAGE_NAME',
          path: folder === '.' ? 'package.json' : `${folder}/package.json`,
        });
  for (const pkg of packages)
    pkg.dependencies = [
      ...new Set((rawDependencies.get(pkg.path) ?? []).flatMap((name) => names.get(name) ?? [])),
    ].sort();
  return {
    kind: diagnostics.some((d) => d.code === 'UNSUPPORTED_WORKSPACE_MANAGER')
      ? 'unsupported'
      : declared
        ? 'npm-workspaces'
        : 'single-package',
    packages,
    diagnostics,
  };
}

/** Manifest edges only. No package scripts, imports, network, Docker or filesystem operations. */
export function workspaceImpact(base: Snapshot, head: Snapshot): WorkspaceImpact {
  const before = graph(base),
    after = graph(head),
    diagnostics = [...before.diagnostics, ...after.diagnostics];
  const nodes = new Map<string, WorkspaceImpact['packages'][number]>();
  for (const [which, g] of [
    ['before', before],
    ['after', after],
  ] as const)
    for (const pkg of g.packages) {
      const node = nodes.get(pkg.path) ?? { ...pkg, before: false, after: false };
      node[which] = true;
      node.name = pkg.name;
      node.dependencies = [...new Set([...node.dependencies, ...pkg.dependencies])].sort();
      nodes.set(pkg.path, node);
    }
  const packages = [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
  const reverse = new Map<string, string[]>();
  for (const p of packages)
    for (const dependency of p.dependencies)
      reverse.set(dependency, [...(reverse.get(dependency) ?? []), p.path].sort());
  const direct = new Map<string, string[]>(),
    sharedFiles: string[] = [];
  const owner = (file: string, g: Graph) =>
    [...g.packages]
      .filter((p) => p.path === '.' || file.startsWith(p.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0]?.path;
  for (const file of changedFiles(base, head)) {
    const owners = new Set(
      [
        Object.hasOwn(base.files, file) ? owner(file, before) : undefined,
        Object.hasOwn(head.files, file) ? owner(file, after) : undefined,
      ].filter((p): p is string => p !== undefined),
    );
    if (!owners.size || owners.has('.')) sharedFiles.push(file);
    for (const p of owners) direct.set(p, [...(direct.get(p) ?? []), file]);
  }
  const affected = new Map<string, WorkspaceImpact['affected'][number]>();
  const add = (
    folder: string,
    reason: WorkspaceImpact['affected'][number]['reason'],
    via: string[],
  ) => {
    const node = nodes.get(folder)!;
    affected.set(folder, {
      path: folder,
      name: node.name,
      directFiles: direct.get(folder) ?? [],
      reason,
      via,
    });
  };
  const todo: string[] = [];
  for (const folder of [...direct.keys()].sort()) {
    add(folder, 'direct', [folder]);
    todo.push(folder);
  }
  for (let index = 0; index < todo.length; index++)
    for (const dependent of reverse.get(todo[index]!) ?? []) {
      if (affected.has(dependent)) continue;
      add(dependent, 'dependent', [...affected.get(todo[index]!)!.via, dependent]);
      todo.push(dependent);
    }
  if (sharedFiles.length || diagnostics.length)
    for (const p of packages) add(p.path, diagnostics.length ? 'uncertain' : 'shared', []);
  // Tarjan SCCs report actual cyclic groups; reverse closure itself remains cycle-safe.
  let index = 0;
  const indices = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    active = new Set<string>(),
    cycles: string[][] = [];
  const visit = (folder: string) => {
    indices.set(folder, index);
    low.set(folder, index++);
    stack.push(folder);
    active.add(folder);
    for (const dep of nodes.get(folder)!.dependencies) {
      if (!indices.has(dep)) {
        visit(dep);
        low.set(folder, Math.min(low.get(folder)!, low.get(dep)!));
      } else if (active.has(dep)) low.set(folder, Math.min(low.get(folder)!, indices.get(dep)!));
    }
    if (low.get(folder) === indices.get(folder)) {
      const component: string[] = [];
      let node: string;
      do {
        node = stack.pop()!;
        active.delete(node);
        component.push(node);
      } while (node !== folder);
      if (component.length > 1 || nodes.get(folder)!.dependencies.includes(folder))
        cycles.push(component.sort());
    }
  };
  for (const p of packages) if (!indices.has(p.path)) visit(p.path);
  return {
    schemaVersion: 1,
    kind:
      before.kind === 'unsupported' || after.kind === 'unsupported'
        ? 'unsupported'
        : before.kind === 'npm-workspaces' || after.kind === 'npm-workspaces'
          ? 'npm-workspaces'
          : 'single-package',
    status: diagnostics.length ? 'inconclusive' : 'complete',
    baseHash: base.hash,
    candidateHash: head.hash,
    executionSupport: 'reviewed-policy-required',
    packages,
    affected: [...affected.values()].sort((a, b) => a.path.localeCompare(b.path)),
    sharedFiles,
    cycles: cycles.sort((a, b) => a[0]!.localeCompare(b[0]!)),
    diagnostics: [...new Map(diagnostics.map((d) => [`${d.code}:${d.path}`, d])).values()],
  };
}
