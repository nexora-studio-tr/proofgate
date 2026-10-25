import { readFile, writeFile, mkdir, symlink, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const input = JSON.parse(await readFile('/input/input.json', 'utf8'));
await mkdir('/scratch/project', { recursive: true });
for (const [file, source] of Object.entries(input.files)) {
  if (
    !file ||
    file.startsWith('/') ||
    file.includes('\\') ||
    file.includes(':') ||
    file.split('/').some((s) => !s || s === '.' || s === '..')
  )
    throw new Error('Invalid source path');
  const destination = path.join('/scratch/project', file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
}
await mkdir('/scratch/project/node_modules', { recursive: true });
const names = new Set();
for (const modules of [process.env.PROOFGATE_TARGET_MODULES, '/opt/proofgate/node_modules'].filter(
  Boolean,
)) {
  for (const name of await readdir(modules)) {
    if (name === 'vitest' && modules !== '/opt/proofgate/node_modules') continue;
    if (!names.has(name)) {
      await symlink(modules + '/' + name, '/scratch/project/node_modules/' + name, 'dir');
      names.add(name);
    }
  }
}
await writeFile(
  '/scratch/project/proofgate.vitest.config.mjs',
  `export default { resolve: { alias: [{find:/^vitest$/,replacement:'/opt/proofgate/node_modules/vitest/dist/index.js'}] }, test: { include: ${JSON.stringify(input.testFiles)}, reporters: ['/opt/proofgate/reporter.mjs'], watch: false, maxWorkers: 1, fileParallelism: false, retry: 0, testTimeout: 5000, hookTimeout: 5000 } };`,
);
process.chdir('/scratch/project');
if (input.mode === 'test') {
  const child = spawn(
    process.execPath,
    [
      '/opt/proofgate/node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'proofgate.vitest.config.mjs',
    ],
    {
      stdio: 'inherit',
      env: { PATH: process.env.PATH, HOME: '/scratch', TMPDIR: '/scratch', CI: 'true', TZ: 'UTC' },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0 && code !== 1) process.exitCode = 2;
  const report = await readFile('/scratch/result.json', 'utf8');
  console.log('PROOFGATE_RESULT:' + Buffer.from(report).toString('base64'));
} else {
  const { Stryker } =
    await import('/opt/proofgate/node_modules/@stryker-mutator/core/dist/src/stryker.js');
  process.env.PROOFGATE_MUTANT_CAP = String(input.cap);
  const stryker = new Stryker({
    testRunner: 'vitest',
    vitest: { configFile: 'proofgate.vitest.config.mjs', related: false },
    mutate: input.mutate,
    plugins: [
      '/opt/proofgate/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js',
      '/opt/proofgate/node_modules/@stryker-mutator/core/dist/src/reporters/index.js',
      '/opt/proofgate/filter.mjs',
    ],
    reporters: ['json', 'proofgate-budget'],
    jsonReporter: { fileName: '/scratch/mutation.json' },
    concurrency: 1,
    tempDirName: '/scratch/stryker',
    cleanTempDir: true,
    logLevel: 'warn',
    fileLogLevel: 'off',
    coverageAnalysis: 'perTest',
    timeoutMS: 5000,
    timeoutFactor: 1.5,
    dryRunTimeoutMinutes: 1,
    thresholds: { high: 100, low: 0, break: 0 },
    allowConsoleColors: false,
    checkers: [],
    symlinkNodeModules: true,
  });
  await stryker.runMutationTest();
  const report = JSON.parse(await readFile('/scratch/mutation.json', 'utf8'));
  const scope = JSON.parse(await readFile('/scratch/scope.json', 'utf8'));
  console.log(
    'PROOFGATE_RESULT:' + Buffer.from(JSON.stringify({ report, scope })).toString('base64'),
  );
}
