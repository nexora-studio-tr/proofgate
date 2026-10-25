import { spawnSync } from 'node:child_process';
import { mkdir, cp } from 'node:fs/promises';
const run = (file, args) => {
  const r = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('node_modules/typescript/bin/tsc', []);
run('node_modules/vite/bin/vite.js', ['build', '--config', 'apps/web/vite.config.ts']);
await mkdir('dist/packages/runner/sandbox', { recursive: true });
await cp('packages/runner/sandbox', 'dist/packages/runner/sandbox', { recursive: true });
