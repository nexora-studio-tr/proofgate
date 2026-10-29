#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Store, token } from '../../../packages/storage/src/index.js';
import { policySchema, VERSION } from '../../../packages/contracts/src/index.js';
import { digest, htmlReport, changedFiles } from '../../../packages/core/src/index.js';
import { repositoryRoot } from '../../../packages/snapshots/src/index.js';
import { examplePair } from '../../../packages/core/src/examples.js';
import { workspaceExample } from '../../../packages/core/src/workspace-example.js';
import { command, docker } from '../../../packages/runner/src/process.js';
import { imageId } from '../../../packages/runner/src/index.js';
import { prepareDependencies, dependencyKey } from '../../../packages/runner/src/dependencies.js';
import { workspaceImpact } from '../../../packages/core/src/workspace.js';
import { createServer } from '../../server/src/index.js';
import { startMcp } from '../../mcp/src/index.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string' },
    port: { type: 'string' },
    host: { type: 'string' },
    origin: { type: 'string' },
    team: { type: 'string' },
    policy: { type: 'string' },
    name: { type: 'string' },
    project: { type: 'string' },
    base: { type: 'string' },
    email: { type: 'string' },
    build: { type: 'boolean' },
    demo: { type: 'boolean' },
    'team-mode': { type: 'boolean' },
    live: { type: 'boolean' },
    workspace: { type: 'boolean' },
  },
});
const action = positionals[0] ?? 'help',
  dataDir = path.resolve(values.data ?? process.env.PROOFGATE_DATA_DIR ?? '.proofgate');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
async function main() {
  if (action === 'help') {
    console.log(
      `ProofGate ${VERSION}\n\n  inspect <repo> --base <ref> Read-only manifest workspace impact\n  doctor --build             Build and pin the isolated runner\n  example                    Create and register the editable sample\n  register <repo> --policy <file> [--team <id>]\n  serve [--team-mode]         Start UI/API and one supervisor\n  demo                       Start a read-only synthetic demo\n  verify --project <id> --base <ref>\n  mcp                        Connect a local MCP host to a running server\n  recovery --email <email>    Issue a single-use local operator recovery link\n\nAll commands accept --data <directory>. Default UI: http://127.0.0.1:4327`,
    );
    return;
  }
  if (action === 'mcp') {
    await startMcp(dataDir);
    return;
  }
  if (action === 'inspect') {
    const repo = await repositoryRoot(path.resolve(positionals[1] ?? '.'));
    const { captureBase, captureWorking } =
      await import('../../../packages/snapshots/src/index.js');
    const base = await captureBase(repo, values.base ?? 'HEAD');
    const head = await captureWorking(repo);
    const impact = workspaceImpact(base, head);
    console.log(
      JSON.stringify({
        baseHash: base.hash,
        candidateHash: head.hash,
        changedFiles: changedFiles(base, head),
        workspaceImpact: impact,
      }),
    );
    if (impact.status === 'inconclusive') process.exitCode = 2;
    return;
  }
  if (action === 'doctor') {
    const result = await docker(['version', '--format', '{{.Server.Os}}']);
    if (result.code !== 0 || result.stdout.trim() !== 'linux')
      throw new Error('Docker Linux engine is required; start Docker Desktop.');
    if (values.build) {
      const context = path.join(root, 'packages/runner/sandbox');
      const r = await docker(['build', '--tag', 'proofgate-runner:0.1.0', context], {
        timeout: 600000,
      });
      if (r.code) throw new Error(r.stderr.slice(-2000));
    }
    const image = await imageId();
    const store = new Store(dataDir);
    store.setMeta('runner_image', image);
    let projectImage: string | undefined;
    if (values.project) {
      const p = store.get<{ root: string }>('SELECT root FROM projects WHERE id=?', values.project);
      if (!p) throw new Error('Project not found');
      const { captureWorking } = await import('../../../packages/snapshots/src/index.js');
      const snapshot = await captureWorking(p.root);
      projectImage = await prepareDependencies(snapshot, image, dataDir);
      store.run(
        'INSERT INTO project_images VALUES(?,?,?,?) ON CONFLICT DO UPDATE SET image=excluded.image',
        values.project,
        dependencyKey(snapshot),
        image,
        projectImage,
      );
    }
    store.close();
    console.log(JSON.stringify({ ok: true, node: process.version, image, projectImage }));
    return;
  }
  if (action === 'register' || action === 'example') {
    const store = new Store(dataDir);
    let repo = positionals[1],
      policy;
    if (action === 'example') {
      repo = path.join(dataDir, 'examples', randomUUID());
      await mkdir(repo, { recursive: true });
      const p = values.workspace ? workspaceExample() : examplePair();
      for (const [name, source] of Object.entries(p.base.files)) {
        await mkdir(path.dirname(path.join(repo, name)), { recursive: true });
        await writeFile(path.join(repo, name), source);
      }
      for (const args of [
        ['init', '--initial-branch=main'],
        ['add', '--', ...Object.keys(p.base.files)],
        [
          '-c',
          'user.name=ProofGate Example',
          '-c',
          'user.email=example@proofgate.local',
          'commit',
          '-m',
          'Original permissions',
        ],
      ]) {
        const r = await command('git', args, { cwd: repo });
        if (r.code) throw new Error(r.stderr);
      }
      for (const [name, source] of Object.entries(p.head.files))
        await writeFile(path.join(repo, name), source);
      policy = p.policy;
    } else {
      if (!repo || !values.policy) throw new Error('Repository and --policy required');
      policy = policySchema.parse(JSON.parse(await readFile(path.resolve(values.policy), 'utf8')));
    }
    const team =
      values.team ?? (store.meta('mode') === 'team' ? undefined : store.localIdentity().teamId);
    if (!team || !store.get('SELECT id FROM teams WHERE id=?', team))
      throw new Error('Use an existing --team ID for team mode');
    const canonical = await repositoryRoot(path.resolve(repo!));
    const id = store.addProject(
      team,
      values.name ??
        (action === 'example'
          ? values.workspace
            ? 'Workspace access control'
            : 'Access control'
          : path.basename(canonical)),
      canonical,
      policy,
    );
    store.close();
    console.log(JSON.stringify({ projectId: id, root: canonical, baseRef: 'HEAD' }));
    return;
  }
  if (action === 'verify') {
    if (!values.project) throw new Error('--project required');
    const connection = JSON.parse(await readFile(path.join(dataDir, 'connection.json'), 'utf8'));
    const url = new URL(connection.origin);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Local server required');
    const api = async (route: string, payload?: unknown) => {
      const r = await fetch(new URL(route, url), {
        method: payload ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${connection.token}`,
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      const data = (await r.json()) as any;
      if (!r.ok) throw new Error(data.error);
      return data;
    };
    const plan = await api('/api/plans', {
      projectId: values.project,
      baseRef: values.base ?? 'HEAD',
      include: [],
    });
    const job = await api('/api/runs', { planId: plan.planId });
    let stage = '';
    let record: any;
    const cancel = () => void api(`/api/runs/${job.runId}/cancel`, {});
    process.once('SIGINT', cancel);
    for (;;) {
      record = await api(`/api/runs/${job.runId}`);
      if (record.stage !== stage) {
        stage = record.stage;
        process.stderr.write(`${stage}\n`);
      }
      if (!['queued', 'running'].includes(record.state)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    process.removeListener('SIGINT', cancel);
    if (!record.evidence) throw new Error('Verification interrupted: ' + record.stage);
    const e = record.evidence;
    const change = await api(`/api/runs/${job.runId}/change`);
    const out = path.join(dataDir, 'reports', job.runId);
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'evidence.json'), JSON.stringify(e, null, 2));
    await writeFile(path.join(out, 'report.html'), htmlReport(e));
    console.log(
      JSON.stringify({
        verdict: change.stale ? 'inconclusive' : e.verdict,
        workspaceStale: change.stale,
        report: out,
      }),
    );
    process.exitCode =
      e.state === 'canceled'
        ? 130
        : change.stale
          ? 2
          : e.verdict === 'pass'
            ? 0
            : e.verdict === 'fail'
              ? 1
              : 2;
    return;
  }
  if (action === 'recovery') {
    if (!values.email) throw new Error('--email required');
    const store = new Store(dataDir),
      u = store.get<{ id: string }>(
        'SELECT id FROM users WHERE email=?',
        values.email.toLowerCase(),
      );
    if (!u || store.meta('mode') !== 'team') throw new Error('Team account not found');
    const raw = token();
    store.run('DELETE FROM recovery WHERE user_id=?', u.id);
    store.run('INSERT INTO recovery VALUES(?,?,?)', digest(raw), u.id, Date.now() + 1800000);
    const url = `${store.meta('origin')}/#recovery=${raw}`;
    store.close();
    console.log(url);
    return;
  }
  if (action === 'serve' || action === 'demo') {
    const mode = action === 'demo' || values.demo ? 'demo' : values['team-mode'] ? 'team' : 'local';
    const port = Number(values.port ?? process.env.PORT ?? 4327);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
    const host = values.host ?? process.env.LISTEN_HOST ?? '127.0.0.1';
    if (mode === 'local' && !['127.0.0.1', '::1'].includes(host))
      throw new Error('Local mode binds only to loopback');
    const origin =
      values.origin ??
      process.env.PUBLIC_URL ??
      (mode === 'demo' ? process.env.RENDER_EXTERNAL_URL : undefined) ??
      `http://127.0.0.1:${port}`;
    const server = await createServer({
      dataDir,
      origin,
      mode,
      webRoot: path.join(root, 'dist/web'),
    });
    await server.app.listen({ port, host });
    const worker =
      mode === 'demo'
        ? undefined
        : spawn(
            process.execPath,
            [path.join(root, 'dist/packages/runner/src/worker.js'), '--data', dataDir],
            { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] },
          );
    if (server.bootstrap) {
      await writeFile(
        path.join(dataDir, 'launch-url'),
        `${origin}/#bootstrap=${server.bootstrap}`,
        { mode: 0o600 },
      );
      console.log(
        `ProofGate ${mode}: ${origin}\nOpen the private launch URL saved in ${path.join(dataDir, 'launch-url')}`,
      );
    } else console.log(`ProofGate ${mode}: ${origin}`);
    const stop = async () => {
      worker?.kill('SIGTERM');
      await server.app.close();
    };
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
    return;
  }
  throw new Error('Unknown command; run help');
}
main().catch((e) => {
  process.stderr.write(`ProofGate: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 2;
});
