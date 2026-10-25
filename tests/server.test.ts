import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from '../apps/server/src/index.js';
import { digest } from '../packages/core/src/index.js';
import { token } from '../packages/storage/src/index.js';
const origin = 'http://127.0.0.1:4329',
  password = 'a long account test password';
describe('real HTTP identity and team boundaries', () => {
  let dir: string,
    server: Awaited<ReturnType<typeof createServer>>,
    ownerCookie = '',
    ownerCsrf = '',
    viewerCookie = '',
    viewerCsrf = '',
    ownerId = '',
    teamId = '',
    viewerId = '';
  const request = (
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
    cookie = ownerCookie,
    csrf = ownerCsrf,
  ) =>
    server.app.inject({
      method,
      url,
      headers: {
        host: '127.0.0.1:4329',
        origin,
        ...(cookie ? { cookie, 'x-csrf-token': csrf } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'proofgate-test-'));
    server = await createServer({ dataDir: dir, origin, mode: 'team' });
    const r = await request(
      'POST',
      '/api/bootstrap',
      { token: server.bootstrap, name: 'Owner', email: 'owner@example.test', password },
      '',
      '',
    );
    expect(r.statusCode).toBe(200);
    ownerCookie = r.headers['set-cookie']!.toString().split(';')[0]!;
    ownerCsrf = r.json().identity.csrf;
    ownerId = r.json().identity.userId;
    teamId = r.json().identity.teamId;
  });
  afterAll(async () => {
    await server.app.close();
    if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('proofgate-test-'))
      await rm(dir, { recursive: true, force: true });
  });
  test('anonymous access cannot read projects', async () =>
    expect((await request('GET', '/api/projects', undefined, '', '')).statusCode).toBe(401));
  test('rejects hostile Host and Origin', async () => {
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: '/api/session',
          headers: { host: 'evil.test' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: '/api/session',
          headers: { host: '127.0.0.1:4329', origin: 'https://evil.test' },
        })
      ).statusCode,
    ).toBe(403);
  });
  test('requires CSRF for cookie mutations', async () =>
    expect(
      (await request('POST', '/api/teams', { name: 'Denied' }, ownerCookie, 'wrong')).statusCode,
    ).toBe(403));
  test('bootstrap is single-use', async () =>
    expect(
      (
        await request('POST', '/api/bootstrap', {
          token: server.bootstrap,
          name: 'Intruder',
          email: 'other@example.test',
          password,
        })
      ).statusCode,
    ).toBe(401));
  test('session has HttpOnly and Strict cookie protection', async () => {
    const r = await request(
      'POST',
      '/api/login',
      { email: 'owner@example.test', password },
      '',
      '',
    );
    expect(r.headers['set-cookie']).toContain('HttpOnly');
    expect(r.headers['set-cookie']).toContain('SameSite=Strict');
  });
  test('invitation creates only the invited role and cannot be replayed', async () => {
    const r = await request('POST', '/api/invites', {
      email: 'viewer@example.test',
      role: 'viewer',
    });
    expect(r.statusCode).toBe(200);
    const raw = r.json().url.split('=')[1];
    expect(
      server.store.get<{ hash: string }>('SELECT hash FROM invites WHERE hash=?', digest(raw))
        ?.hash,
    ).not.toBe(raw);
    const joined = await request(
      'POST',
      '/api/invites/accept',
      { token: raw, name: 'Viewer', password },
      '',
      '',
    );
    expect(joined.statusCode).toBe(200);
    viewerCookie = joined.headers['set-cookie']!.toString().split(';')[0]!;
    viewerCsrf = joined.json().identity.csrf;
    viewerId = joined.json().identity.userId;
    expect(joined.json().identity.role).toBe('viewer');
    expect(
      (
        await request(
          'POST',
          '/api/invites/accept',
          { token: raw, name: 'Viewer', password },
          '',
          '',
        )
      ).statusCode,
    ).toBe(401);
  });
  test('viewer cannot launch work, invite or change roles', async () => {
    expect(
      (
        await request(
          'POST',
          '/api/plans',
          { projectId: randomUUID(), baseRef: 'HEAD', include: [] },
          viewerCookie,
          viewerCsrf,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'POST',
          '/api/invites',
          { email: 'x@example.test', role: 'member' },
          viewerCookie,
          viewerCsrf,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'POST',
          `/api/members/${ownerId}/role`,
          { role: 'viewer' },
          viewerCookie,
          viewerCsrf,
        )
      ).statusCode,
    ).toBe(403);
  });
  test('cannot issue owner invites or alter own owner role', async () => {
    expect(
      (await request('POST', '/api/invites', { email: 'x@example.test', role: 'owner' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await request('POST', `/api/members/${ownerId}/role`, { role: 'viewer' })).statusCode,
    ).toBe(403);
  });
  test('cross-team run and artifact IDs return 404', async () => {
    const team = randomUUID(),
      id = randomUUID();
    server.store.run('INSERT INTO teams VALUES(?,?)', team, 'Other team');
    server.store.run(
      'INSERT INTO jobs(id,team_id,project_id,user_id,state,stage,plan,created) VALUES(?,?,?,?,?,?,?,?)',
      id,
      team,
      randomUUID(),
      randomUUID(),
      'completed',
      'done',
      '{}',
      Date.now(),
    );
    expect((await request('GET', `/api/runs/${id}`)).statusCode).toBe(404);
    expect((await request('GET', `/api/runs/${id}/report`)).statusCode).toBe(404);
  });
  test('role changes affect already existing sessions', async () => {
    expect(
      (await request('POST', `/api/members/${viewerId}/role`, { role: 'member' })).statusCode,
    ).toBe(200);
    const r = await request('GET', '/api/session', undefined, viewerCookie, viewerCsrf);
    expect(r.json().identity.role).toBe('member');
  });
  test('rejects mismatched or expired invitation credentials', async () => {
    const r = await request('POST', '/api/invites', {
      email: 'viewer@example.test',
      role: 'viewer',
    });
    expect(
      (
        await request(
          'POST',
          '/api/invites/accept',
          {
            token: r.json().url.split('=')[1],
            name: 'Takeover',
            password: 'wrong but long password',
          },
          '',
          '',
        )
      ).statusCode,
    ).toBe(401);
  });
  test('recovery consumes a hashed one-use token and revokes sessions', async () => {
    const raw = token();
    server.store.run(
      'INSERT INTO recovery VALUES(?,?,?)',
      digest(raw),
      viewerId,
      Date.now() + 60000,
    );
    expect(
      (
        await request(
          'POST',
          '/api/recovery',
          { token: raw, password: 'a completely new account password' },
          '',
          '',
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', '/api/projects', undefined, viewerCookie, viewerCsrf)).statusCode,
    ).toBe(401);
    expect(
      (await request('POST', '/api/recovery', { token: raw, password }, '', '')).statusCode,
    ).toBe(401);
  });
  test('removed membership immediately loses access', async () => {
    const login = await request(
      'POST',
      '/api/login',
      { email: 'viewer@example.test', password: 'a completely new account password' },
      '',
      '',
    );
    const cookie = login.headers['set-cookie']!.toString().split(';')[0]!;
    expect((await request('POST', `/api/members/${viewerId}/remove`, {})).statusCode).toBe(200);
    expect(
      (await request('GET', '/api/projects', undefined, cookie, login.json().identity.csrf))
        .statusCode,
    ).toBe(401);
  });
  test('project tokens cannot access another project or team administration and can be revoked', async () => {
    const a = randomUUID(),
      b = randomUUID();
    for (const id of [a, b])
      server.store.run(
        'INSERT INTO projects VALUES(?,?,?,?,?)',
        id,
        teamId,
        'Project',
        '/registered-fixture',
        '{}',
      );
    const issued = await request('POST', `/api/projects/${a}/tokens`, { days: 7 });
    expect(issued.statusCode).toBe(200);
    const bearer = { host: '127.0.0.1:4329', authorization: `Bearer ${issued.json().token}` };
    const list = await server.app.inject({ method: 'GET', url: '/api/projects', headers: bearer });
    expect(list.json().map((p: { id: string }) => p.id)).toEqual([a]);
    expect(
      (await server.app.inject({ method: 'GET', url: '/api/team', headers: bearer })).statusCode,
    ).toBe(403);
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: '/api/plans',
          headers: bearer,
          payload: { projectId: b, baseRef: 'HEAD', include: [] },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `/api/projects/${a}/tokens/revoke`, {
          tokenId: issued.json().tokenId,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await server.app.inject({ method: 'GET', url: '/api/projects', headers: bearer }))
        .statusCode,
    ).toBe(401);
  });
  test('ownership transfer requires password and preserves exactly one owner', async () => {
    const invite = await request('POST', '/api/invites', {
      email: 'successor@example.test',
      role: 'member',
    });
    const accepted = await request(
      'POST',
      '/api/invites/accept',
      { token: invite.json().url.split('=')[1], name: 'Successor', password },
      '',
      '',
    );
    const successor = accepted.json().identity.userId;
    expect(
      (
        await request('POST', '/api/team/transfer', {
          userId: successor,
          password: 'wrong password',
        })
      ).statusCode,
    ).toBe(401);
    const moved = await request('POST', '/api/team/transfer', { userId: successor, password });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().identity.role).toBe('admin');
    expect(
      server.store.get<{ n: number }>(
        "SELECT count(*) n FROM members WHERE team_id=? AND role='owner'",
        teamId,
      )?.n,
    ).toBe(1);
    ownerCookie = moved.headers['set-cookie']!.toString().split(';')[0]!;
    ownerCsrf = moved.json().identity.csrf;
    expect(server.store.identity(successor, teamId)?.role).toBe('owner');
  });
  test('logout revokes the actual session token', async () => {
    expect((await request('POST', '/api/logout', {})).statusCode).toBe(200);
    expect((await request('GET', '/api/projects')).statusCode).toBe(401);
  });
});
test('demo is read-only and cannot be switched into a team database', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proofgate-test-'));
  const server = await createServer({ dataDir: dir, origin, mode: 'demo' });
  try {
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: '/api/plans',
          headers: { host: '127.0.0.1:4329', origin },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await server.app.close();
  }
  await expect(createServer({ dataDir: dir, origin, mode: 'team' })).rejects.toThrow(
    'mode mismatch',
  );
  if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('proofgate-test-'))
    await rm(dir, { recursive: true, force: true });
});
