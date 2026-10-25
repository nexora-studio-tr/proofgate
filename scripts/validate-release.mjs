import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command } from '../dist/packages/runner/src/process.js';
import assert from 'node:assert/strict';
const archive = path.resolve('artifacts/release/proofgate-0.1.0-alpha.1.tgz'),
  expected = (await readFile(archive + '.sha256', 'utf8')).split(' ')[0];
assert.equal(
  createHash('sha256')
    .update(await readFile(archive))
    .digest('hex'),
  expected,
);
const parent = await mkdtemp(path.join(os.tmpdir(), 'proofgate-release-'));
const dir = path.join(parent, 'proofgate-0.1.0-alpha.1');
const checks = ['Source archive checksum'];
try {
  let r = await command('tar', ['-xzf', archive, '-C', parent]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(
    !(await readdir(dir)).some(
      (n) =>
        n.startsWith('.proofgate') || ['node_modules', 'dist', 'artifacts', '.git'].includes(n),
    ),
  );
  checks.push('Only allowlisted source extracted');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run npm run test:release to locate npm');
  r = await command(
    process.execPath,
    [npm, 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: dir, timeout: 120000 },
  );
  assert.equal(r.code, 0, r.stderr);
  checks.push('Clean offline dependency installation');
  r = await command(process.execPath, ['scripts/build.mjs'], { cwd: dir, timeout: 120000 });
  assert.equal(r.code, 0, r.stderr);
  checks.push('Production build from extracted source');
  r = await command(process.execPath, ['dist/apps/cli/src/index.js', 'help'], { cwd: dir });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /ProofGate 0.1.0-alpha.1/);
  checks.push('Built CLI resolves only extracted dependencies');
  await mkdir('artifacts/release-validation', { recursive: true });
  await writeFile(
    'artifacts/release-validation/report.json',
    JSON.stringify({ status: 'passed', archiveSha256: expected, checks }, null, 2),
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length }));
} finally {
  if (
    path.dirname(parent) !== os.tmpdir() ||
    !path.basename(parent).startsWith('proofgate-release-')
  )
    throw new Error('Cleanup guard');
  await rm(parent, { recursive: true, force: true });
}
