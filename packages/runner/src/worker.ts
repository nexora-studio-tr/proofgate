import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Store, type Job, type Project } from '../../storage/src/index.js';
import { verify } from './index.js';
import { policySchema } from '../../contracts/src/index.js';
import { snapshot, captureWorking } from '../../snapshots/src/index.js';
import { policyDigest } from '../../core/src/index.js';
import { docker } from './process.js';
import { dependencyKey } from './dependencies.js';
import { planDigest } from '../../core/src/workspace-plan.js';
export async function runWorker(dataDir: string, stop: AbortSignal) {
  const root = path.resolve(dataDir);
  await mkdir(root, { recursive: true });
  const lock = path.join(root, 'supervisor.lock');
  try {
    const prior = JSON.parse(await readFile(lock, 'utf8'));
    if (prior.app !== 'proofgate' || !Number.isInteger(prior.pid))
      throw new Error('Unrecognized lock');
    let alive = true;
    try {
      process.kill(prior.pid, 0);
    } catch {
      alive = false;
    }
    if (alive) throw new Error('SUPERVISOR_ALREADY_RUNNING');
    await rm(lock);
  } catch (e) {
    if (
      (e as NodeJS.ErrnoException).code !== 'ENOENT' &&
      !(e instanceof SyntaxError) &&
      String(e).includes('lock')
    )
      throw e;
    if (String(e).includes('SUPERVISOR')) throw e;
  }
  const handle = await open(lock, 'wx', 0o600);
  await handle.writeFile(JSON.stringify({ app: 'proofgate', pid: process.pid }));
  const store = new Store(root);
  store.prune();
  for (const interrupted of store.all<{ id: string }>(
    "SELECT id FROM jobs WHERE state='running'",
  )) {
    if (!/^[a-f0-9-]{36}$/.test(interrupted.id)) throw new Error('Invalid stored run identity');
    const containers = await docker(
      [
        'ps',
        '-aq',
        '--filter',
        'label=app.proofgate.owned=true',
        '--filter',
        `label=app.proofgate.run=${interrupted.id}`,
      ],
      { timeout: 15000 },
    );
    for (const id of containers.stdout.trim().split(/\s+/).filter(Boolean)) {
      if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Invalid Docker identity');
      await docker(['rm', '-f', id], { timeout: 15000 });
    }
    await rm(path.join(root, 'work', interrupted.id), { recursive: true, force: true });
  }
  store.run(
    "UPDATE jobs SET state='interrupted',stage='Worker restarted; create a fresh plan' WHERE state='running'",
  );
  try {
    while (!stop.aborted) {
      const job = store.transaction(() => {
        const j = store.get<Job>(
          "SELECT * FROM jobs WHERE state='queued' AND canceled=0 ORDER BY created LIMIT 1",
        );
        if (j)
          store.run(
            "UPDATE jobs SET state='running',stage='preparing',lease=? WHERE id=?",
            Date.now() + 30000,
            j.id,
          );
        return j;
      });
      if (!job) {
        await new Promise<void>((r) => {
          const done = () => {
            clearTimeout(timer);
            stop.removeEventListener('abort', done);
            r();
          };
          const timer = setTimeout(done, 300);
          stop.addEventListener('abort', done, { once: true });
        });
        continue;
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      stop.addEventListener('abort', abort, { once: true });
      const heartbeat = setInterval(() => {
        const live = store.identity(job.user_id, job.team_id);
        if (
          store.get<{ canceled: number }>('SELECT canceled FROM jobs WHERE id=?', job.id)
            ?.canceled ||
          !live ||
          live.role === 'viewer'
        )
          controller.abort();
        store.run('UPDATE jobs SET lease=? WHERE id=?', Date.now() + 30000, job.id);
      }, 500);
      heartbeat.unref();
      try {
        const p = JSON.parse(job.plan);
        const policy = policySchema.parse(p.policy);
        const project = store.get<Project>('SELECT * FROM projects WHERE id=?', job.project_id);
        if (
          !project ||
          policyDigest(policy) !== policyDigest(policySchema.parse(JSON.parse(project.policy)))
        )
          throw new Error('POLICY_CHANGED');
        const identity = store.identity(job.user_id, job.team_id);
        if (!identity || identity.role === 'viewer') throw new Error('PERMISSION_REVOKED');
        const baseImage = store.meta('runner_image');
        if (!baseImage) throw new Error('RUNNER_IMAGE_MISSING: run doctor --build');
        const prepared = store.get<{ image: string }>(
          'SELECT image FROM project_images WHERE project_id=? AND lock_hash=? AND base_image=?',
          project.id,
          dependencyKey(p.head),
          baseImage,
        );
        if (!prepared)
          throw new Error('DEPENDENCIES_NOT_PREPARED: run doctor --build --project <id>');
        if (baseImage !== p.baseImage || prepared.image !== p.image)
          throw new Error('IMAGE_CHANGED');
        const image = p.image as string;
        const base = snapshot(p.base.files),
          head = snapshot(p.head.files);
        if (base.hash !== p.base.hash || head.hash !== p.head.hash)
          throw new Error('PLAN_INTEGRITY');
        if ((await captureWorking(project.root, p.include)).hash !== head.hash)
          throw new Error('STALE_PLAN');
        if (p.planHash !== planDigest(base, head, policy, p.baseImage, p.image))
          throw Error('PLAN_INTEGRITY');
        const e = await verify({
          dataDir: root,
          projectId: job.project_id,
          runId: job.id,
          base,
          head,
          policy,
          image,
          baseImage: p.baseImage,
          planHash: p.planHash,
          signal: controller.signal,
          onProgress: (stage) => store.run('UPDATE jobs SET stage=? WHERE id=?', stage, job.id),
        });
        store.saveEvidence(job.id, e);
      } catch (error) {
        store.run(
          "UPDATE jobs SET state='interrupted',stage=?,lease=0 WHERE id=?",
          String(error).slice(0, 300),
          job.id,
        );
      } finally {
        clearInterval(heartbeat);
        stop.removeEventListener('abort', abort);
      }
    }
  } finally {
    store.close();
    await handle.close();
    await rm(lock, { force: true });
  }
}
if (process.argv.includes('--data')) {
  const dir = process.argv[process.argv.indexOf('--data') + 1];
  if (!dir) throw new Error('Data directory missing');
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());
  process.once('SIGTERM', () => stop.abort());
  await runWorker(dir, stop.signal);
}
