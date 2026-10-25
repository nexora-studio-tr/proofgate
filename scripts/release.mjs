import { readdir, lstat, readFile, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url)),
  pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const directories = [
  'apps',
  'packages',
  'scripts',
  'tests',
  'plugins',
  'docs',
  'examples',
  '.github',
];
const roots = [
  'README.md',
  'README.tr.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.prettierignore',
  '.prettierrc.json',
  'Dockerfile.web',
  'render.yaml',
];
const files = [];
const skip = (p) =>
  p
    .split('/')
    .some(
      (s) =>
        ['node_modules', 'dist', 'artifacts', '.git', '__pycache__'].includes(s) ||
        s.startsWith('.proofgate') ||
        s.startsWith('.env'),
    );
async function collect(p) {
  if (skip(p)) return;
  const st = await lstat(path.join(root, p));
  if (st.isSymbolicLink()) throw new Error('Symlink in source: ' + p);
  if (st.isDirectory()) {
    for (const child of await readdir(path.join(root, p))) await collect(p + '/' + child);
  } else if (st.isFile()) {
    if (st.size > 2 * 1024 * 1024) throw new Error('Source file too large: ' + p);
    files.push(p);
  } else throw new Error('Unsupported source entry: ' + p);
}
for (const p of [...roots, ...directories]) await collect(p);
files.sort();
const manifest = [];
for (const p of files) {
  const bytes = await readFile(path.join(root, p));
  if (!/\.(png|jpe?g|gif)$/.test(p)) {
    const text = bytes.toString('utf8');
    if (text.includes('\uFFFD')) throw new Error('Non-UTF8 source: ' + p);
    if (
      /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|[A-Za-z]:[\\/]Users[\\/])/.test(
        text,
      )
    )
      throw new Error('Credential or workstation path in source: ' + p);
    if (p.endsWith('.md'))
      for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = m[1].split('#')[0];
        if (!target || target.startsWith('https://') || target.startsWith('http://')) continue;
        const destination = path.resolve(path.dirname(path.join(root, p)), target);
        if (!destination.startsWith(root) || !(await lstat(destination).catch(() => null)))
          throw new Error('Broken/outside link in ' + p + ': ' + target);
      }
  }
  manifest.push({
    path: p,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    gitSha: createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex'),
  });
}
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version)
  throw new Error('Version mismatch');
for (const workflow of ['ci.yml', 'release.yml']) {
  const text = await readFile(path.join(root, '.github/workflows', workflow), 'utf8');
  for (const m of text.matchAll(/uses:\s+([^\s]+)/g))
    if (!m[1].startsWith('./') && !/^[\w-]+\/[\w-]+@[a-f0-9]{40}$/.test(m[1]))
      throw new Error('Unpinned GitHub Action');
}
const output = path.join(root, 'artifacts/release');
await mkdir(output, { recursive: true });
const sourceHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
await writeFile(
  path.join(output, 'source-manifest.json'),
  JSON.stringify({ version: pkg.version, sourceHash, files: manifest }, null, 2),
);
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ status: 'passed', files: files.length, sourceHash }));
  process.exit(0);
}
const directory = path.join(output, 'stage-' + randomUUID()),
  prefix = 'proofgate-' + pkg.version;
await mkdir(path.join(directory, prefix), { recursive: true });
try {
  for (const p of files) {
    const dest = path.join(directory, prefix, p);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(path.join(root, p), dest);
  }
  const archive = path.join(output, prefix + '.tgz');
  const result = spawnSync('tar', ['-czf', archive, '-C', directory, prefix], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Source packaging failed');
  const hash = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  await writeFile(archive + '.sha256', hash + '  ' + path.basename(archive) + '\n');
  console.log(
    JSON.stringify({ status: 'passed', files: files.length, archive, sha256: hash, sourceHash }),
  );
} finally {
  if (path.dirname(directory) !== output || !path.basename(directory).startsWith('stage-'))
    throw new Error('Cleanup guard');
  await rm(directory, { recursive: true, force: true });
}
