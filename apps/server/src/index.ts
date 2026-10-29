import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { z } from 'zod';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Store,
  token,
  passwordHash,
  passwordMatches,
  type Identity,
  type Role,
  type Job,
  type Project,
} from '../../../packages/storage/src/index.js';
import { digest, htmlReport } from '../../../packages/core/src/index.js';
import {
  VERSION,
  idSchema,
  verifyInput,
  type Evidence,
} from '../../../packages/contracts/src/index.js';
import { planVerification, startVerification } from './service.js';
import { captureBase, captureWorking } from '../../../packages/snapshots/src/index.js';
import { changedFiles, policyDigest } from '../../../packages/core/src/index.js';
import { workspaceImpact } from '../../../packages/core/src/workspace.js';
import { policySchema } from '../../../packages/contracts/src/index.js';
import { dependencyKey } from '../../../packages/runner/src/dependencies.js';
import { planDigest } from '../../../packages/core/src/workspace-plan.js';
import { examplePair } from '../../../packages/core/src/examples.js';
import { workspaceExample } from '../../../packages/core/src/workspace-example.js';

interface Options {
  dataDir: string;
  origin: string;
  mode: 'local' | 'team' | 'demo';
  webRoot?: string;
}
const body = <T>(schema: z.ZodType<T>, r: FastifyRequest): T => schema.parse(r.body);
const credentials = z.object({ email: z.email().max(254), password: z.string().max(256) }).strict();
const setup = credentials.extend({
  name: z.string().trim().min(1).max(80),
  token: z.string().length(43),
});
const roleSchema = z.enum(['admin', 'member', 'viewer']);
export async function createServer(options: Options) {
  const origin = new URL(options.origin);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    !['http:', 'https:'].includes(origin.protocol)
  )
    throw new Error('Invalid origin');
  if (
    options.mode === 'team' &&
    origin.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  )
    throw new Error('Team mode requires HTTPS');
  const app = Fastify({
    logger: false,
    bodyLimit: 32 * 1024,
    requestTimeout: 15000,
    trustProxy: false,
  });
  await app.register(cookie);
  const store = new Store(options.dataDir);
  if (store.meta('mode') && store.meta('mode') !== options.mode) {
    store.close();
    throw new Error('Data directory mode mismatch');
  }
  store.setMeta('mode', options.mode);
  store.setMeta('origin', origin.origin);
  const sessions = new WeakMap<FastifyRequest, { i: Identity; scope?: string }>();
  const nonces = new WeakMap<FastifyRequest, string>();
  const secure = origin.protocol === 'https:';
  const cookieName = secure ? '__Host-proofgate-session' : 'proofgate-session';
  let bootstrap: string | undefined;
  if (
    options.mode === 'local' ||
    (options.mode === 'team' && !store.get('SELECT id FROM users LIMIT 1'))
  ) {
    bootstrap = token();
    store.setMeta('bootstrap', digest(bootstrap));
    store.setMeta('bootstrap_expires', String(Date.now() + 1800000));
    await writeFile(path.join(store.dataDir, 'bootstrap-token'), bootstrap, { mode: 0o600 });
  }
  const local = options.mode === 'local' ? store.localIdentity() : undefined;
  const connectionToken = options.mode === 'local' ? token() : undefined;
  if (connectionToken)
    await writeFile(
      path.join(store.dataDir, 'connection.json'),
      JSON.stringify({ origin: origin.origin, token: connectionToken }),
      { mode: 0o600 },
    );
  const auth = (r: FastifyRequest) => {
    const s = sessions.get(r);
    if (!s) throw new Error('UNAUTHORIZED');
    return s.i;
  };
  const human = (r: FastifyRequest) => {
    const i = auth(r);
    if (sessions.get(r)?.scope) throw new Error('FORBIDDEN');
    return i;
  };
  const scoped = (r: FastifyRequest, projectId: string) => {
    const i = auth(r);
    const scope = sessions.get(r)?.scope;
    if (scope && scope !== projectId) throw new Error('NOT_FOUND');
    return i;
  };
  const issue = (reply: FastifyReply, i: Identity) => {
    const s = store.createSession(i);
    reply.setCookie(cookieName, s.raw, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: 43200,
    });
    return { ...i, csrf: s.csrf };
  };
  app.addHook('onRequest', async (r, reply) => {
    const nonce = token();
    nonces.set(r, nonce);
    reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    if (r.headers.host !== origin.host) return reply.code(403).send({ error: 'HOST_NOT_ALLOWED' });
    if (r.headers.origin && r.headers.origin !== origin.origin)
      return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(r.method) &&
      r.headers.origin !== origin.origin &&
      !r.headers.authorization
    )
      return reply.code(403).send({ error: 'ORIGIN_REQUIRED' });
    if (options.mode === 'demo' && r.method !== 'GET')
      return reply.code(403).send({ error: 'DEMO_READ_ONLY' });
    const bearer = r.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (bearer && local && connectionToken && digest(bearer) === digest(connectionToken))
      sessions.set(r, { i: local });
    else if (bearer) {
      const row = store.get<{ user_id: string; project_id: string; expires: number }>(
        'SELECT * FROM api_tokens WHERE hash=?',
        digest(bearer),
      );
      if (row && row.expires > Date.now()) {
        const p = store.get<Project>('SELECT * FROM projects WHERE id=?', row.project_id);
        const i = p ? store.identity(row.user_id, p.team_id) : undefined;
        if (i) sessions.set(r, { i, scope: row.project_id });
      }
    } else {
      const raw = r.cookies[cookieName];
      const i = raw ? store.session(raw) : undefined;
      if (i) {
        sessions.set(r, { i });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method) && r.headers['x-csrf-token'] !== i.csrf)
          return reply.code(403).send({ error: 'CSRF_REQUIRED' });
      }
    }
  });
  app.setErrorHandler((e, _r, reply) => {
    const message =
      e instanceof z.ZodError ? 'INVALID_INPUT' : e instanceof Error ? e.message : 'REQUEST_FAILED';
    const status =
      e instanceof z.ZodError
        ? 400
        : message === 'UNAUTHORIZED'
          ? 401
          : message === 'FORBIDDEN'
            ? 403
            : message === 'NOT_FOUND'
              ? 404
              : ['QUEUE_FULL', 'AUTH_BUSY'].includes(message)
                ? 429
                : ['STALE_PLAN', 'PLAN_EXPIRED', 'POLICY_CHANGED', 'IMAGE_CHANGED'].includes(
                      message,
                    )
                  ? 409
                  : 400;
    reply.code(status).send({ error: message.length < 80 ? message : 'REQUEST_FAILED' });
  });
  app.get('/healthz', () => ({ ok: true, version: VERSION, mode: options.mode }));
  app.get('/api/session', (r) => {
    if (options.mode === 'demo') return { mode: 'demo', identity: null, version: VERSION };
    const i = sessions.get(r)?.i;
    return {
      mode: options.mode,
      identity: i ?? null,
      needsSetup: !store.get('SELECT id FROM users LIMIT 1'),
      version: VERSION,
    };
  });
  app.post('/api/bootstrap', async (r, reply) => {
    if (options.mode === 'demo') throw new Error('FORBIDDEN');
    if (!store.limit('bootstrap:' + r.ip, 8, 900000)) throw new Error('AUTH_BUSY');
    const input =
      options.mode === 'local'
        ? z
            .object({ token: z.string().length(43) })
            .strict()
            .parse(r.body)
        : setup.parse(r.body);
    const hash =
      options.mode === 'team'
        ? await passwordHash((input as z.infer<typeof setup>).password)
        : null;
    const i = store.transaction(() => {
      if (
        store.meta('bootstrap') !== digest(input.token) ||
        Number(store.meta('bootstrap_expires')) < Date.now()
      )
        throw new Error('UNAUTHORIZED');
      store.setMeta('bootstrap', 'used');
      if (local) return local;
      if (store.get('SELECT id FROM users LIMIT 1')) throw new Error('FORBIDDEN');
      const s = input as z.infer<typeof setup>,
        uid = randomUUID(),
        tid = randomUUID();
      store.run('INSERT INTO users VALUES(?,?,?,?)', uid, s.email.toLowerCase(), s.name, hash);
      store.run('INSERT INTO teams VALUES(?,?)', tid, 'My workspace');
      store.run('INSERT INTO members VALUES(?,?,?)', uid, tid, 'owner');
      return store.identity(uid, tid)!;
    });
    return { identity: issue(reply, i) };
  });
  app.post('/api/login', async (r, reply) => {
    if (options.mode !== 'team') throw new Error('FORBIDDEN');
    if (!store.limit('login:' + r.ip, 10, 900000)) throw new Error('AUTH_BUSY');
    const input = body(credentials, r);
    const user = store.get<{ id: string; password: string }>(
      'SELECT id,password FROM users WHERE email=?',
      input.email.toLowerCase(),
    );
    const ok = await passwordMatches(
      input.password,
      user?.password ?? '00000000000000000000000000000000:' + '00'.repeat(64),
    );
    if (!ok || !user) throw new Error('UNAUTHORIZED');
    return { identity: issue(reply, store.identity(user.id)!) };
  });
  app.post('/api/logout', (r, reply) => {
    human(r);
    store.run('DELETE FROM sessions WHERE hash=?', digest(r.cookies[cookieName] ?? ''));
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });
  app.get('/api/projects', (r) => {
    if (options.mode === 'demo') return [{ id: 'demo', name: 'Access control / example' }];
    const i = auth(r);
    const scope = sessions.get(r)?.scope;
    return store
      .all<{ id: string; name: string }>('SELECT id,name FROM projects WHERE team_id=?', i.teamId)
      .filter((p) => !scope || scope === p.id);
  });
  app.post('/api/plans', async (r) => {
    const input = body(verifyInput, r);
    const i = scoped(r, input.projectId);
    return planVerification(store, i, input.projectId, input.baseRef, input.include);
  });
  app.post('/api/inspect', async (r) => {
    const input = body(verifyInput, r),
      i = scoped(r, input.projectId),
      p = store.project(input.projectId, i.teamId);
    if (!p) throw new Error('NOT_FOUND');
    const base = await captureBase(p.root, input.baseRef),
      head = await captureWorking(p.root, input.include);
    return {
      projectId: p.id,
      baseHash: base.hash,
      candidateHash: head.hash,
      changedFiles: changedFiles(base, head),
      workspaceImpact: workspaceImpact(base, head),
      policyHash: policyDigest(policySchema.parse(JSON.parse(p.policy))),
    };
  });
  app.post('/api/runs', async (r) => {
    const { planId } = body(z.object({ planId: idSchema }).strict(), r);
    const i = auth(r);
    const p = store.get<{ project_id: string }>(
      'SELECT project_id FROM plans WHERE id=? AND team_id=?',
      planId,
      i.teamId,
    );
    if (!p) throw new Error('NOT_FOUND');
    scoped(r, p.project_id);
    return startVerification(store, i, planId);
  });
  const demoEvidence = async () => {
    const records = await Promise.all(
      ['strong.json', 'workspace-strong.json'].map(async (file) => {
        try {
          return JSON.parse(
            await readFile(
              fileURLToPath(new URL('../../../../examples/evidence/' + file, import.meta.url)),
              'utf8',
            ),
          ) as Evidence;
        } catch {
          return null;
        }
      }),
    );
    return records.filter((e): e is Evidence => e !== null);
  };
  app.get('/api/runs', async (r) => {
    if (options.mode === 'demo') {
      return (await demoEvidence()).map((e) => ({
        id: e.runId,
        project_id: 'demo',
        state: 'completed',
        stage: e.workspace ? 'Recorded workspace execution' : 'Bundled reference execution',
        created: Date.parse(e.startedAt),
        evidence: e,
      }));
    }
    const i = auth(r);
    const scope = sessions.get(r)?.scope;
    return store
      .all<Job>('SELECT * FROM jobs WHERE team_id=? ORDER BY created DESC LIMIT 50', i.teamId)
      .filter((j) => !scope || scope === j.project_id)
      .map(({ plan, ...j }) => ({ ...j, evidence: j.evidence ? JSON.parse(j.evidence) : null }));
  });
  const owned = (r: FastifyRequest) => {
    const { id } = z.object({ id: idSchema }).parse(r.params);
    const i = auth(r);
    const j = store.get<Job>('SELECT * FROM jobs WHERE id=? AND team_id=?', id, i.teamId);
    if (!j) throw new Error('NOT_FOUND');
    scoped(r, j.project_id);
    return j;
  };
  app.get('/api/runs/:id', async (r) => {
    if (options.mode === 'demo') {
      const e = (await demoEvidence()).find((e) => e.runId === (r.params as { id: string }).id);
      if (!e) throw new Error('NOT_FOUND');
      return { id: e.runId, state: 'completed', stage: 'reference', evidence: e };
    }
    const { plan, ...j } = owned(r);
    return { ...j, evidence: j.evidence ? JSON.parse(j.evidence) : null };
  });
  app.get('/api/runs/:id/report', async (r, reply) => {
    let e: Evidence;
    if (options.mode === 'demo') {
      const found = (await demoEvidence()).find((e) => e.runId === (r.params as { id: string }).id);
      if (!found) throw new Error('NOT_FOUND');
      e = found;
    } else {
      const j = owned(r);
      if (!j.evidence) throw new Error('NOT_FOUND');
      e = JSON.parse(j.evidence);
    }
    return reply
      .type('text/html')
      .header('Content-Disposition', 'attachment; filename="proofgate-report.html"')
      .send(htmlReport(e));
  });
  app.get('/api/runs/:id/change', async (r) => {
    if (options.mode === 'demo') {
      const e = (await demoEvidence()).find((e) => e.runId === (r.params as { id: string }).id);
      if (!e) throw new Error('NOT_FOUND');
      const p = e.workspace ? workspaceExample() : examplePair();
      const file = e.workspace ? 'packages/access/src/access.ts' : 'src/access.ts';
      return {
        base: p.base.files[file],
        head: p.head.files[file],
        file,
        stale: false,
      };
    }
    const j = owned(r),
      p = JSON.parse(j.plan),
      project = store.project(j.project_id, auth(r).teamId);
    if (!project) throw new Error('NOT_FOUND');
    const file = p.policy.productionFiles[0];
    let stale = true;
    try {
      const currentImage = store.get<{ image: string }>(
        'SELECT image FROM project_images WHERE project_id=? AND lock_hash=? AND base_image=?',
        project.id,
        dependencyKey(p.head),
        p.baseImage ?? '',
      );
      stale =
        (await captureWorking(project.root, p.include)).hash !== p.head.hash ||
        policyDigest(policySchema.parse(JSON.parse(project.policy))) !== policyDigest(p.policy) ||
        store.meta('runner_image') !== p.baseImage ||
        currentImage?.image !== p.image ||
        p.planHash !== planDigest(p.base, p.head, p.policy, p.baseImage, p.image);
    } catch {}
    return { base: p.base.files[file] ?? '', head: p.head.files[file] ?? '', file, stale };
  });
  app.post('/api/runs/:id/cancel', (r) => {
    const j = owned(r);
    const i = auth(r);
    if (i.role === 'viewer' || (j.user_id !== i.userId && !['owner', 'admin'].includes(i.role)))
      throw new Error('FORBIDDEN');
    store.run(
      "UPDATE jobs SET canceled=1,state=CASE WHEN state='queued' THEN 'canceled' ELSE state END WHERE id=?",
      j.id,
    );
    store.audit(i, 'verification.canceled', j.id);
    return { ok: true };
  });
  app.get('/api/team', (r) => {
    const i = human(r);
    return {
      team: store.get('SELECT id,name FROM teams WHERE id=?', i.teamId),
      members: store.all(
        'SELECT u.id,u.email,u.name,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.team_id=?',
        i.teamId,
      ),
      teams: store.all(
        'SELECT t.id,t.name FROM members m JOIN teams t ON t.id=m.team_id WHERE m.user_id=?',
        i.userId,
      ),
    };
  });
  app.post('/api/teams', (r) => {
    const i = human(r);
    const { name } = body(z.object({ name: z.string().trim().min(1).max(80) }).strict(), r);
    const id = randomUUID();
    store.transaction(() => {
      store.run('INSERT INTO teams VALUES(?,?)', id, name);
      store.run('INSERT INTO members VALUES(?,?,?)', i.userId, id, 'owner');
    });
    store.audit(i, 'team.created', id);
    return { id, name };
  });
  app.post('/api/teams/:id/switch', (r, reply) => {
    const i = human(r),
      { id } = z.object({ id: idSchema }).parse(r.params);
    const next = store.identity(i.userId, id);
    if (!next) throw new Error('NOT_FOUND');
    store.run('DELETE FROM sessions WHERE hash=?', digest(r.cookies[cookieName] ?? ''));
    return { identity: issue(reply, next) };
  });
  app.post('/api/invites', (r) => {
    const i = human(r);
    if (!['owner', 'admin'].includes(i.role)) throw new Error('FORBIDDEN');
    const input = body(z.object({ email: z.email().max(254), role: roleSchema }).strict(), r);
    if (input.role === 'admin' && i.role !== 'owner') throw new Error('FORBIDDEN');
    const raw = token();
    store.run(
      'INSERT INTO invites(hash,team_id,email,role,expires,issued_by) VALUES(?,?,?,?,?,?)',
      digest(raw),
      i.teamId,
      input.email.toLowerCase(),
      input.role,
      Date.now() + 86400000,
      i.userId,
    );
    store.audit(i, 'invite.created', input.role);
    return { url: `${origin.origin}/#invite=${raw}` };
  });
  app.post('/api/invites/accept', async (r, reply) => {
    if (options.mode !== 'team') throw new Error('FORBIDDEN');
    if (!store.limit('invite:' + r.ip, 8, 900000)) throw new Error('AUTH_BUSY');
    const input = body(
      z
        .object({
          token: z.string().length(43),
          name: z.string().min(1).max(80),
          password: z.string().max(256),
        })
        .strict(),
      r,
    );
    const row = store.get<{
      team_id: string;
      email: string;
      role: Role;
      expires: number;
      issued_by: string;
    }>('SELECT * FROM invites WHERE hash=?', digest(input.token));
    if (!row || row.expires < Date.now()) throw new Error('UNAUTHORIZED');
    const existing = store.get<{ id: string; password: string }>(
      'SELECT id,password FROM users WHERE email=?',
      row.email,
    );
    if (existing && !(await passwordMatches(input.password, existing.password)))
      throw new Error('UNAUTHORIZED');
    const hash = existing ? null : await passwordHash(input.password),
      uid = existing?.id ?? randomUUID();
    store.transaction(() => {
      if (
        !store.get(
          'SELECT hash FROM invites WHERE hash=? AND expires>?',
          digest(input.token),
          Date.now(),
        )
      )
        throw new Error('UNAUTHORIZED');
      const issuer = store.identity(row.issued_by, row.team_id);
      if (
        !issuer ||
        !['owner', 'admin'].includes(issuer.role) ||
        (row.role === 'admin' && issuer.role !== 'owner')
      )
        throw new Error('UNAUTHORIZED');
      if (!existing)
        store.run('INSERT INTO users VALUES(?,?,?,?)', uid, row.email, input.name, hash);
      store.run(
        'INSERT INTO members VALUES(?,?,?) ON CONFLICT DO NOTHING',
        uid,
        row.team_id,
        row.role,
      );
      store.run('DELETE FROM invites WHERE hash=?', digest(input.token));
    });
    return { identity: issue(reply, store.identity(uid, row.team_id)!) };
  });
  app.post('/api/members/:id/role', (r) => {
    const i = human(r);
    if (i.role !== 'owner') throw new Error('FORBIDDEN');
    const { id } = z.object({ id: idSchema }).parse(r.params),
      { role } = body(z.object({ role: roleSchema }).strict(), r);
    const member = store.identity(id, i.teamId);
    if (!member) throw new Error('NOT_FOUND');
    if (member.role === 'owner') throw new Error('FORBIDDEN');
    store.run('UPDATE members SET role=? WHERE user_id=? AND team_id=?', role, id, i.teamId);
    if (role === 'viewer') store.cancelUserJobs(id, i.teamId);
    if (role === 'viewer' || role === 'member')
      store.run('DELETE FROM invites WHERE issued_by=? AND team_id=?', id, i.teamId);
    store.audit(i, 'member.role.changed', id);
    return { ok: true };
  });
  app.post('/api/members/:id/remove', (r) => {
    const i = human(r);
    if (i.role !== 'owner') throw new Error('FORBIDDEN');
    const { id } = z.object({ id: idSchema }).parse(r.params);
    if (id === i.userId) throw new Error('FORBIDDEN');
    store.run('DELETE FROM members WHERE user_id=? AND team_id=?', id, i.teamId);
    store.cancelUserJobs(id, i.teamId);
    store.run('DELETE FROM invites WHERE issued_by=? AND team_id=?', id, i.teamId);
    store.audit(i, 'member.removed', id);
    return { ok: true };
  });
  app.post('/api/password', async (r) => {
    const i = human(r);
    const input = body(
      z.object({ current: z.string().max(256), password: z.string().max(256) }).strict(),
      r,
    );
    const user = store.get<{ password: string }>(
      'SELECT password FROM users WHERE id=?',
      i.userId,
    )!;
    if (!(await passwordMatches(input.current, user.password))) throw new Error('UNAUTHORIZED');
    const hash = await passwordHash(input.password);
    store.transaction(() => {
      store.run('UPDATE users SET password=? WHERE id=?', hash, i.userId);
      store.revokeAccount(i.userId);
    });
    return { ok: true };
  });
  app.post('/api/recovery', async (r) => {
    if (options.mode !== 'team') throw new Error('FORBIDDEN');
    if (!store.limit('recovery:' + r.ip, 8, 900000)) throw new Error('AUTH_BUSY');
    const input = body(
      z.object({ token: z.string().length(43), password: z.string().max(256) }).strict(),
      r,
    );
    const row = store.get<{ user_id: string; expires: number }>(
      'SELECT * FROM recovery WHERE hash=?',
      digest(input.token),
    );
    if (!row || row.expires < Date.now()) throw new Error('UNAUTHORIZED');
    const hash = await passwordHash(input.password);
    store.transaction(() => {
      if (!store.get('SELECT hash FROM recovery WHERE hash=?', digest(input.token)))
        throw new Error('UNAUTHORIZED');
      store.run('UPDATE users SET password=? WHERE id=?', hash, row.user_id);
      store.revokeAccount(row.user_id);
    });
    return { ok: true };
  });
  app.get('/api/audit', (r) => {
    const i = human(r);
    if (!['owner', 'admin'].includes(i.role)) throw new Error('FORBIDDEN');
    return store.all(
      'SELECT event,target,created FROM audit WHERE team_id=? ORDER BY id DESC LIMIT 100',
      i.teamId,
    );
  });
  app.post('/api/team/transfer', async (r, reply) => {
    const i = human(r);
    if (i.role !== 'owner' || options.mode !== 'team') throw new Error('FORBIDDEN');
    const input = body(z.object({ userId: idSchema, password: z.string().max(256) }).strict(), r);
    const account = store.get<{ password: string }>(
      'SELECT password FROM users WHERE id=?',
      i.userId,
    )!;
    if (!(await passwordMatches(input.password, account.password))) throw new Error('UNAUTHORIZED');
    store.transaction(() => {
      if (store.identity(i.userId, i.teamId)?.role !== 'owner') throw new Error('FORBIDDEN');
      const target = store.identity(input.userId, i.teamId);
      if (!target || target.userId === i.userId) throw new Error('NOT_FOUND');
      store.run(
        "UPDATE members SET role='admin' WHERE user_id=? AND team_id=?",
        i.userId,
        i.teamId,
      );
      store.run(
        "UPDATE members SET role='owner' WHERE user_id=? AND team_id=?",
        input.userId,
        i.teamId,
      );
      store.run('DELETE FROM sessions WHERE team_id=?', i.teamId);
      store.audit(i, 'ownership.transferred', input.userId);
    });
    return { identity: issue(reply, store.identity(i.userId, i.teamId)!) };
  });
  app.post('/api/projects/:id/tokens', (r) => {
    const i = human(r);
    if (i.role === 'viewer') throw new Error('FORBIDDEN');
    const { id } = z.object({ id: idSchema }).parse(r.params);
    if (!store.project(id, i.teamId)) throw new Error('NOT_FOUND');
    const { days } = body(z.object({ days: z.number().int().min(1).max(30) }).strict(), r);
    const raw = token(),
      expires = Date.now() + days * 86400000;
    store.run('INSERT INTO api_tokens VALUES(?,?,?,?)', digest(raw), i.userId, id, expires);
    store.audit(i, 'project.token.created', id);
    return { token: raw, tokenId: digest(raw), expires };
  });
  app.get('/api/projects/:id/tokens', (r) => {
    const i = human(r),
      { id } = z.object({ id: idSchema }).parse(r.params);
    if (!store.project(id, i.teamId)) throw new Error('NOT_FOUND');
    return store.all(
      'SELECT hash tokenId,expires FROM api_tokens WHERE user_id=? AND project_id=?',
      i.userId,
      id,
    );
  });
  app.post('/api/projects/:id/tokens/revoke', (r) => {
    const i = human(r),
      { id } = z.object({ id: idSchema }).parse(r.params);
    if (!store.project(id, i.teamId)) throw new Error('NOT_FOUND');
    const { tokenId } = body(z.object({ tokenId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), r);
    store.run(
      'DELETE FROM api_tokens WHERE hash=? AND project_id=? AND user_id=?',
      tokenId,
      id,
      i.userId,
    );
    store.audit(i, 'project.token.revoked', id);
    return { ok: true };
  });
  const root = options.webRoot ?? fileURLToPath(new URL('../../../web/', import.meta.url));
  try {
    if ((await stat(path.join(root, 'index.html'))).isFile()) {
      const template = await readFile(path.join(root, 'index.html'), 'utf8');
      const html = (r: FastifyRequest, reply: FastifyReply) =>
        reply.type('text/html').send(template.replace('__PROOFGATE_NONCE__', nonces.get(r) ?? ''));
      app.get('/', html);
      await app.register(staticFiles, { root, cacheControl: false });
      app.setNotFoundHandler((r, reply) =>
        r.url.startsWith('/api/') ? reply.code(404).send({ error: 'NOT_FOUND' }) : html(r, reply),
      );
    }
  } catch {
    /* API-only tests do not require a UI build. */
  }
  app.addHook('onClose', () => store.close());
  return { app, store, bootstrap, connectionToken };
}
