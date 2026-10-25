import { spawn } from 'node:child_process';
const run = (args, collect = false) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, {
      stdio: collect ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      windowsHide: true,
    });
    let output = '';
    if (collect) p.stdout.on('data', (d) => (output += d));
    p.on('error', reject);
    p.on('exit', (code) =>
      code ? reject(new Error('Setup step failed: ' + args.join(' '))) : resolve(output),
    );
  });
const skip = process.argv.includes('--prepared');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 15)
  throw new Error('Node.js 24.15 or newer in the Node 24 line is required.');
if (!skip && !process.env.npm_execpath)
  throw new Error('Run npm run setup so the installed npm executable can be located.');
if (!skip) {
  await run([
    process.env.npm_execpath ?? 'node_modules/npm/bin/npm-cli.js',
    'ci',
    '--ignore-scripts',
    '--no-fund',
  ]);
  await run(['scripts/build.mjs']);
}
await run(['dist/apps/cli/src/index.js', 'doctor', '--build']);
const project = JSON.parse((await run(['dist/apps/cli/src/index.js', 'example'], true)).trim());
await run(['dist/apps/cli/src/index.js', 'doctor', '--build', '--project', project.projectId]);
console.log(
  `Ready. Run npm start, open .proofgate/launch-url, then verify project ${project.projectId} against HEAD.`,
);
