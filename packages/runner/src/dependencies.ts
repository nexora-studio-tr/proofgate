import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { docker } from './process.js';
import { imageId } from './index.js';
import type { Snapshot } from '../../contracts/src/index.js';
export function validateDependencies(s: Snapshot) {
  const pkg = JSON.parse(s.files['package.json'] ?? 'null'),
    lock = JSON.parse(s.files['package-lock.json'] ?? 'null');
  if (!pkg || !lock || lock.lockfileVersion !== 3 || pkg.workspaces)
    throw new Error('A single-package npm v3 lockfile is required');
  if (pkg.devDependencies?.vitest !== '5.0.5' && pkg.dependencies?.vitest !== '5.0.5')
    throw new Error('Pin Vitest 5.0.5 in this initial adapter');
  const entries = Object.entries(lock.packages ?? {});
  if (entries.length > 2500) throw new Error('Dependency limit exceeded');
  for (const [key, value] of entries as [string, any][]) {
    if (!key) continue;
    if (
      value.link ||
      !value.resolved ||
      new URL(value.resolved).origin !== 'https://registry.npmjs.org' ||
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
    await writeFile(
      path.join(directory, 'Dockerfile'),
      `FROM ${tag}\nUSER root\nWORKDIR /opt/target\nCOPY package.json package-lock.json ./\nRUN npm ci --ignore-scripts --no-audit --no-fund\nENV PROOFGATE_TARGET_MODULES=/opt/target/node_modules\nUSER node\nWORKDIR /scratch\n`,
    );
    r = await docker(['build', '--tag', output, directory], { timeout: 600000 });
    if (r.code || r.timedOut)
      throw new Error('DEPENDENCY_PREPARATION_FAILED: ' + r.stderr.slice(-1500));
    return await imageId(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
