import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { docker } from './process.js';
import { imageId } from './index.js';
import type { Snapshot } from '../../contracts/src/index.js';
import { workspaceImpact } from '../../core/src/workspace.js';
import { digest, stable } from '../../core/src/index.js';
export function dependencyKey(s: Snapshot) {
  const pkg = JSON.parse(s.files['package.json'] ?? '{}');
  return pkg.workspaces
    ? digest(
        stable({
          profile: 'npm-workspace-node-v1',
          manifests: Object.fromEntries(
            Object.entries(s.files).filter(([f]) => /(?:^|\/)package(?:-lock)?\.json$/.test(f)),
          ),
        }),
      )
    : digest(s.files['package-lock.json'] ?? '');
}
export function workspaceInstall(s: Snapshot) {
  const impact = workspaceImpact(s, s);
  if (impact.kind !== 'npm-workspaces' || impact.status !== 'complete' || impact.cycles.length)
    throw Error('WORKSPACE_INSTALL_GRAPH');
  const pkg = JSON.parse(s.files['package.json']!);
  if (!Array.isArray(pkg.workspaces)) throw Error('WORKSPACE_DECLARATION_UNSUPPORTED');
  const members = impact.packages.filter((p) => p.path !== '.');
  if (members.some((m) => !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(m.path)))
    throw Error('WORKSPACE_INSTALL_PATH_UNSUPPORTED');
  const links = new Map(members.map((p) => ['node_modules/' + p.name, p.path]));
  const manifests = new Map(
    members.map((p) => [p.path, JSON.parse(s.files[p.path + '/package.json']!)]),
  );
  for (const manifest of manifests.values()) {
    if (
      typeof manifest.name !== 'string' ||
      manifest.name.length > 214 ||
      !/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name) ||
      ['vitest', 'vite'].includes(manifest.name) ||
      /^@(?:vitest|stryker-mutator)\//.test(manifest.name)
    )
      throw Error('WORKSPACE_PACKAGE_NAME_UNSUPPORTED');
    if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version))
      throw Error('WORKSPACE_VERSION_UNSUPPORTED');
  }
  for (const manifest of [pkg, ...manifests.values()]) {
    for (const section of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ])
      for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
        if (typeof spec !== 'string' || /^(?:workspace:|file:|link:)/.test(spec))
          throw Error('WORKSPACE_DEPENDENCY_PROTOCOL_UNSUPPORTED');
        const local = members.find((m) => m.name === name);
        if (local && spec !== '*' && spec !== manifests.get(local.path)?.version)
          throw Error('WORKSPACE_LOCAL_VERSION_UNSUPPORTED');
      }
  }
  return { members, links, manifests };
}
export function validateDependencies(s: Snapshot) {
  const pkg = JSON.parse(s.files['package.json'] ?? 'null'),
    lock = JSON.parse(s.files['package-lock.json'] ?? 'null');
  if (!pkg || !lock || lock.lockfileVersion !== 3)
    throw new Error('A single-package npm v3 lockfile is required');
  if (pkg.devDependencies?.vitest !== '5.0.5' && pkg.dependencies?.vitest !== '5.0.5')
    throw new Error('Pin Vitest 5.0.5 in this initial adapter');
  const entries = Object.entries(lock.packages ?? {});
  const workspace = pkg.workspaces ? workspaceInstall(s) : undefined;
  if (workspace)
    for (const [name, target] of workspace.links) {
      const entry = lock.packages[name],
        member = lock.packages[target];
      if (
        !entry?.link ||
        entry.resolved !== target ||
        !member ||
        member.version !== workspace.manifests.get(target)?.version
      )
        throw Error('WORKSPACE_LOCK_LINK_MISMATCH');
    }
  if (entries.length > 2500) throw new Error('Dependency limit exceeded');
  for (const [key, value] of entries as [string, any][]) {
    if (!key) continue;
    if (workspace?.manifests.has(key)) continue;
    if (workspace?.links.has(key)) continue;
    if (workspace && !key.startsWith('node_modules/'))
      throw Error('WORKSPACE_NESTED_DEPENDENCIES_UNSUPPORTED');
    const resolved = value.resolved ? new URL(value.resolved) : undefined;
    if (
      value.link ||
      !resolved ||
      resolved.origin !== 'https://registry.npmjs.org' ||
      resolved.username ||
      resolved.password ||
      !/^sha512-[A-Za-z0-9+/=]+$/.test(value.integrity ?? '')
    )
      throw new Error('Only integrity-pinned public npm registry dependencies are supported');
  }
  return { pkg, lock };
}
export async function prepareDependencies(
  s: Snapshot,
  baseImage: string,
  dataDir: string,
): Promise<string> {
  validateDependencies(s);
  if (!/^sha256:[a-f0-9]{64}$/.test(baseImage)) throw new Error('Immutable base image required');
  const directory = path.join(path.resolve(dataDir), 'dependency-builds', randomUUID());
  await mkdir(directory, { recursive: true });
  const tag = 'proofgate-build-base:' + baseImage.slice(7, 23),
    output = 'proofgate-deps:' + randomUUID();
  try {
    let r = await docker(['image', 'tag', baseImage, tag]);
    if (r.code) throw new Error(r.stderr);
    await writeFile(path.join(directory, 'package.json'), s.files['package.json']!);
    await writeFile(path.join(directory, 'package-lock.json'), s.files['package-lock.json']!);
    const workspace = JSON.parse(s.files['package.json']!).workspaces
      ? workspaceInstall(s)
      : undefined;
    if (workspace)
      for (const member of workspace.members) {
        await mkdir(path.join(directory, member.path), { recursive: true });
        await writeFile(
          path.join(directory, member.path, 'package.json'),
          s.files[member.path + '/package.json']!,
        );
      }
    await writeFile(
      path.join(directory, 'Dockerfile'),
      `FROM ${tag}\nUSER root\nWORKDIR /opt/target\nCOPY package.json package-lock.json ./\n${workspace ? workspace.members.map((m) => `COPY ${m.path}/package.json ${m.path}/package.json\n`).join('') : ''}RUN npm ci --ignore-scripts --no-audit --no-fund && npm --version > /opt/target/proofgate-npm-version\nENV PROOFGATE_TARGET_MODULES=/opt/target/node_modules\nUSER node\nWORKDIR /scratch\n`,
    );
    r = await docker(['build', '--tag', output, directory], { timeout: 600000 });
    if (r.code || r.timedOut)
      throw new Error('DEPENDENCY_PREPARATION_FAILED: ' + r.stderr.slice(-1500));
    return await imageId(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
