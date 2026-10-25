import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../dist/packages/storage/src/index.js';
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { data: { type: 'string' }, out: { type: 'string' } },
});
const client = positionals[0];
if (!['codex', 'claude'].includes(client)) throw new Error('Choose codex or claude');
const root = fileURLToPath(new URL('../', import.meta.url)),
  data = path.resolve(values.data ?? '.proofgate');
await readFile(path.join(data, 'connection.json'), 'utf8');
const output = path.resolve(values.out ?? path.join(data, 'integrations', client, 'proofgate'));
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
await cp(path.join(root, 'plugins/skills'), path.join(output, 'skills'), { recursive: true });
const store = new Store(data),
  projects = store.all('SELECT id,name FROM projects');
store.close();
await mkdir(path.join(output, 'skills/proofgate-verify/references'), { recursive: true });
await writeFile(
  path.join(output, 'skills/proofgate-verify/references/workspace.json'),
  JSON.stringify({ projects }, null, 2),
);
const server = {
  command: process.execPath,
  args: [path.join(root, 'dist/apps/cli/src/index.js'), 'mcp', '--data', data],
};
if (client === 'codex') {
  await writeFile(
    path.join(output, 'plugin.json'),
    JSON.stringify(
      {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'proofgate',
        version: '0.1.0-alpha.1',
        description: 'Before/after tests and bounded mutation evidence for registered code changes',
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(output, 'mcp.json'),
    JSON.stringify(
      {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: { proofgate: { type: 'stdio', ...server } },
      },
      null,
      2,
    ),
  );
} else {
  await mkdir(path.join(output, '.claude-plugin'));
  await writeFile(
    path.join(output, '.claude-plugin/plugin.json'),
    JSON.stringify(
      {
        name: 'proofgate',
        version: '0.1.0-alpha.1',
        description: 'Before/after tests and bounded mutation evidence for registered code changes',
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(output, '.mcp.json'),
    JSON.stringify({ mcpServers: { proofgate: server } }, null, 2),
  );
}
console.log(JSON.stringify({ client, path: output, projects: projects.length }));
