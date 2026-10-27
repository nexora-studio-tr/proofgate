import { policySchema } from '../../../packages/contracts/src/index.js';
import { changedFiles, policyDigest, digest } from '../../../packages/core/src/index.js';
import { captureBase, captureWorking } from '../../../packages/snapshots/src/index.js';
import { workspaceImpact } from '../../../packages/core/src/workspace.js';
import { Store, type Identity, type Plan } from '../../../packages/storage/src/index.js';
export async function planVerification(
  store: Store,
  i: Identity,
  projectId: string,
  baseRef: string,
  include: string[],
) {
  if (i.role === 'viewer') throw new Error('FORBIDDEN');
  const project = store.project(projectId, i.teamId);
  if (!project) throw new Error('NOT_FOUND');
  store.prune();
  if (!store.limit('plans:' + i.userId, 10, 900000)) throw new Error('QUEUE_FULL');
  const policy = policySchema.parse(JSON.parse(project.policy));
  const base = await captureBase(project.root, baseRef);
  const head = await captureWorking(project.root, include);
  const impact = workspaceImpact(base, head);
  if (impact.kind !== 'single-package') throw new Error('WORKSPACE_EXECUTION_UNSUPPORTED');
  const baseImage = store.meta('runner_image');
  if (!baseImage) throw new Error('RUNNER_IMAGE_MISSING');
  const prepared = store.get<{ image: string }>(
    'SELECT image FROM project_images WHERE project_id=? AND lock_hash=? AND base_image=?',
    project.id,
    digest(head.files['package-lock.json'] ?? ''),
    baseImage,
  );
  if (!prepared) throw new Error('DEPENDENCIES_NOT_PREPARED');
  const id = store.addPlan(i, project, {
    base,
    head,
    policy,
    include,
    baseImage,
    image: prepared.image,
  });
  return {
    planId: id,
    projectId,
    baseHash: base.hash,
    candidateHash: head.hash,
    policyHash: policyDigest(policy),
    image: prepared.image,
    changedFiles: changedFiles(base, head),
    workspaceImpact: impact,
    budget: policy.budget,
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  };
}
export async function startVerification(store: Store, i: Identity, planId: string) {
  if (i.role === 'viewer') throw new Error('FORBIDDEN');
  const plan = store.get<Plan>(
    'SELECT * FROM plans WHERE id=? AND team_id=? AND user_id=?',
    planId,
    i.teamId,
    i.userId,
  );
  if (!plan) throw new Error('NOT_FOUND');
  const project = store.project(plan.project_id, i.teamId);
  if (!project) throw new Error('NOT_FOUND');
  const p = JSON.parse(plan.payload);
  if ((await captureWorking(project.root, p.include)).hash !== p.head.hash)
    throw new Error('STALE_PLAN');
  if (policyDigest(policySchema.parse(JSON.parse(project.policy))) !== policyDigest(p.policy))
    throw new Error('POLICY_CHANGED');
  const image = store.get<{ image: string }>(
    'SELECT image FROM project_images WHERE project_id=? AND lock_hash=? AND base_image=?',
    project.id,
    digest(p.head.files['package-lock.json'] ?? ''),
    p.baseImage,
  );
  if (store.meta('runner_image') !== p.baseImage || image?.image !== p.image)
    throw new Error('IMAGE_CHANGED');
  return { runId: store.enqueue(i, planId) };
}
