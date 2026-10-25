import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Snapshot } from '../../contracts/src/index.js';
import { relativePath } from '../../contracts/src/index.js';
import { digest, stable } from '../../core/src/index.js';

const exec = promisify(execFile);
const ignored =
  /(^|\/)(?:\.git|\.proofgate[^/]*|node_modules|dist|artifacts|coverage|\.ssh|\.aws|\.codex|\.agents)(\/|$)|(^|\/)\.env|(^|\/)(?:\.npmrc|\.netrc|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx)$/i;
export function validateSourcePath(p: string): string {
  relativePath.parse(p);
  if (ignored.test(p)) throw new Error('Excluded source path');
  return p;
}
export function snapshot(files: Record<string, string>): Snapshot {
  const manifest: Record<string, string> = {};
  let bytes = 0;
  for (const f of Object.keys(files).sort()) {
    validateSourcePath(f);
    if (files[f]!.includes('\0') || files[f]!.includes('\uFFFD'))
      throw new Error('Only UTF-8 text source is supported');
    bytes += Buffer.byteLength(files[f]!);
    if (bytes > 4 * 1024 * 1024) throw new Error('Snapshot exceeds 4 MiB');
    manifest[f] = digest(files[f]!);
  }
  if (Object.keys(files).length > 500) throw new Error('Snapshot exceeds 500 files');
  if (new Set(Object.keys(files).map((f) => f.toLowerCase())).size !== Object.keys(files).length)
    throw new Error('Case-colliding paths');
  return { hash: digest(stable(manifest)), files, manifest };
}
const gitArgs = (root: string, args: string[]) => [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'submodule.recurse=false',
  '-c',
  'protocol.ext.allow=never',
  '--no-replace-objects',
  '-C',
  root,
  ...args,
];
const gitEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_NOSYSTEM: '1',
});
async function git(root: string, args: string[]): Promise<string> {
  return (
    await exec('git', gitArgs(root, args), {
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      env: gitEnv(),
    })
  ).stdout;
}
export async function repositoryRoot(input: string): Promise<string> {
  const root = await realpath(input);
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  if (path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase())
    throw new Error('Register the exact repository root, not a nested directory');
  return root;
}
async function readSafe(root: string, f: string): Promise<string> {
  validateSourcePath(f);
  let current = root;
  for (const part of f.split('/')) {
    current = path.join(current, part);
    const st = await lstat(current);
    if (st.isSymbolicLink()) throw new Error('Symlink source is unsupported');
  }
  const st = await lstat(current);
  if (!st.isFile() || st.size > 512 * 1024) throw new Error('Source file type/size unsupported');
  const b = await readFile(current);
  if (b.includes(0) || b.toString('utf8').includes('\uFFFD'))
    throw new Error('Only UTF-8 text source is supported');
  return b.toString('utf8');
}
export async function captureWorking(root: string, include: string[] = []): Promise<Snapshot> {
  const names = (await git(root, ['ls-files', '-z', '--cached']))
    .split('\0')
    .filter(Boolean)
    .filter((f) => !ignored.test(f));
  const tracked = new Set(names);
  for (const f of include) {
    validateSourcePath(f);
    tracked.add(f);
  }
  if (tracked.size > 500) throw new Error('Snapshot exceeds 500 files');
  const capture = async () => {
    const files: Record<string, string> = {};
    let bytes = 0;
    for (const f of [...tracked].sort()) {
      try {
        const text = await readSafe(root, f);
        bytes += Buffer.byteLength(text);
        if (bytes > 4 * 1024 * 1024) throw new Error('Snapshot exceeds 4 MiB');
        files[f] = text;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    return snapshot(files);
  };
  const a = await capture();
  const b = await capture();
  if (a.hash !== b.hash) throw new Error('SOURCE_CHANGED_DURING_CAPTURE');
  return a;
}
export async function captureBase(root: string, ref: string): Promise<Snapshot> {
  if (!/^[\w./~-]{1,120}$/.test(ref) || ref.startsWith('-'))
    throw new Error('Invalid base reference');
  const commit = (await git(root, ['rev-parse', '--verify', `${ref}^{commit}`])).trim();
  const entries = (await git(root, ['ls-tree', '-r', '-z', commit])).split('\0').filter(Boolean);
  const files: Record<string, string> = {};
  if (entries.length > 1000) throw new Error('Repository too large for initial support');
  const selected: { file: string; sha: string }[] = [];
  for (const e of entries) {
    const [meta, f] = e.split('\t');
    if (!meta || !f || ignored.test(f)) continue;
    validateSourcePath(f);
    if (!meta.startsWith('100644 ') && !meta.startsWith('100755 '))
      throw new Error('Symlinks/submodules unsupported');
    const sha = meta.split(' ')[2];
    if (!sha || !/^[a-f0-9]{40,64}$/.test(sha)) throw new Error('Invalid Git object');
    selected.push({ file: f, sha });
  }
  if (selected.length > 500) throw new Error('Snapshot exceeds 500 files');
  if (!selected.length) return snapshot(files);
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const child = execFile(
      'git',
      gitArgs(root, ['cat-file', '--batch']),
      {
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'buffer',
        windowsHide: true,
        timeout: 15000,
        env: gitEnv(),
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin!.end(selected.map((s) => s.sha).join('\n') + '\n');
  });
  let offset = 0,
    total = 0;
  for (const { file, sha } of selected) {
    const end = buffer.indexOf(10, offset);
    if (end < 0) throw new Error('Incomplete Git object header');
    const header = buffer
      .subarray(offset, end)
      .toString('ascii')
      .match(/^([a-f0-9]{40,64}) blob (\d+)$/);
    if (!header || header[1] !== sha) throw new Error('Unexpected Git object');
    const size = Number(header[2]);
    total += size;
    if (size > 512 * 1024 || total > 4 * 1024 * 1024) throw new Error('Source size limit exceeded');
    offset = end + 1;
    if (offset + size >= buffer.length || buffer[offset + size] !== 10)
      throw new Error('Incomplete Git object body');
    files[file] = buffer.subarray(offset, offset + size).toString('utf8');
    offset += size + 1;
  }
  return snapshot(files);
}
