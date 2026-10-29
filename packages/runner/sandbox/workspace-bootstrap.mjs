import { mkdir, readdir, lstat, realpath, symlink, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export async function prepareWorkspace(root) {
  root = await realpath(root);
  if (root !== '/scratch/project' && !root.startsWith('/scratch/stryker/'))
    throw Error('WORKSPACE_SANDBOX_ROOT');
  const workspace = JSON.parse(await readFile(path.join(root, 'proofgate.workspace.json'), 'utf8'));
  if (!Array.isArray(workspace.links) || workspace.links.length > 100)
    throw Error('WORKSPACE_LINK_MAP');
  const modules = path.join(root, 'node_modules');
  try {
    if ((await lstat(modules)).isSymbolicLink()) throw Error('WORKSPACE_MODULE_ROOT_LINK');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await mkdir(modules, { recursive: true });
  const locals = new Map(workspace.links.map((m) => [m.name, m.path]));
  const available = new Map();
  for (const base of [process.env.PROOFGATE_TARGET_MODULES, '/opt/proofgate/node_modules'].filter(
    Boolean,
  )) {
    for (const name of await readdir(base)) {
      if (name.startsWith('.')) continue;
      const names = name.startsWith('@')
        ? (await readdir(path.join(base, name))).map((n) => name + '/' + n)
        : [name];
      for (const item of names) {
        if (item === 'vitest' && base !== '/opt/proofgate/node_modules') continue;
        if (!available.has(item)) available.set(item, path.join(base, item));
      }
    }
  }
  for (const [name, folder] of locals) available.set(name, path.join(root, folder));
  const proof = [];
  for (const [name, target] of available) {
    if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(name)) throw Error('WORKSPACE_MODULE_NAME');
    const resolved = await realpath(target);
    if (locals.has(name)) {
      if (resolved !== path.join(root, locals.get(name)))
        throw Error('WORKSPACE_LOCAL_LINK_ESCAPE');
      proof.push({ name, target: resolved });
    } else if (
      !resolved.startsWith('/opt/target/node_modules/') &&
      !resolved.startsWith('/opt/proofgate/node_modules/')
    )
      throw Error('WORKSPACE_EXTERNAL_LINK_ESCAPE');
    const destination = path.join(modules, name);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await symlink(
        locals.has(name) ? path.relative(path.dirname(destination), target) : target,
        destination,
        'dir',
      );
    } catch (e) {
      if (e.code !== 'EEXIST' || (await realpath(destination)) !== resolved)
        throw Error('WORKSPACE_LINK_COLLISION');
    }
  }
  const record = { root, links: proof };
  await appendFile('/scratch/workspace-links.jsonl', JSON.stringify(record) + '\n');
  return record;
}
