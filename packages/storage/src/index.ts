import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { digest } from '../../core/src/index.js';
import type { Evidence, Policy, Snapshot } from '../../contracts/src/index.js';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export interface Identity {
  userId: string;
  teamId: string;
  role: Role;
  name: string;
  csrf: string;
}
export interface Project {
  id: string;
  team_id: string;
  name: string;
  root: string;
  policy: string;
}
export interface Plan {
  id: string;
  project_id: string;
  team_id: string;
  user_id: string;
  created: number;
  used: number;
  payload: string;
}
export interface Job {
  id: string;
  team_id: string;
  project_id: string;
  user_id: string;
  state: string;
  stage: string;
  plan: string;
  evidence: string | null;
  canceled: number;
  created: number;
  lease: number;
}
export const token = () => randomBytes(32).toString('base64url');
let hashing = 0;
export async function passwordHash(password: string): Promise<string> {
  if ([...password].length < 15 || Buffer.byteLength(password) > 256)
    throw new Error('PASSWORD_LENGTH');
  if (hashing >= 2) throw new Error('AUTH_BUSY');
  hashing++;
  try {
    const salt = randomBytes(16);
    const hash = await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (e, key) =>
        e ? reject(e) : resolve(key),
      ),
    );
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  } finally {
    hashing--;
  }
}
export async function passwordMatches(password: string, stored: string | null): Promise<boolean> {
  if (!stored || password.length > 256) return false;
  if (hashing >= 2) return false;
  hashing++;
  try {
    const [salt, expected] = stored.split(':');
    if (!salt || !expected) return false;
    const actual = await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        Buffer.from(salt, 'hex'),
        64,
        { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
        (e, key) => (e ? reject(e) : resolve(key)),
      ),
    );
    return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } finally {
    hashing--;
  }
}
export class Store {
  readonly db: DatabaseSync;
  readonly dataDir: string;
  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.dataDir, 'proofgate.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT);
 CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS members(user_id TEXT REFERENCES users(id),team_id TEXT REFERENCES teams(id),role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),PRIMARY KEY(user_id,team_id));
 CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON members(team_id) WHERE role='owner';
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),team_id TEXT REFERENCES teams(id),csrf TEXT NOT NULL,created INTEGER NOT NULL,touched INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,team_id TEXT REFERENCES teams(id),email TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS recovery(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS api_tokens(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),project_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,team_id TEXT REFERENCES teams(id),name TEXT NOT NULL,root TEXT NOT NULL,policy TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS project_images(project_id TEXT REFERENCES projects(id),lock_hash TEXT NOT NULL,base_image TEXT NOT NULL,image TEXT NOT NULL,PRIMARY KEY(project_id,lock_hash,base_image));
 CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),team_id TEXT NOT NULL,user_id TEXT NOT NULL,created INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,team_id TEXT NOT NULL,project_id TEXT NOT NULL,user_id TEXT NOT NULL,state TEXT NOT NULL,stage TEXT NOT NULL,plan TEXT NOT NULL,evidence TEXT,canceled INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,team_id TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,target TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,start INTEGER NOT NULL,count INTEGER NOT NULL);`);
    if (
      !this.all<{ name: string }>('PRAGMA table_info(invites)').some((c) => c.name === 'issued_by')
    )
      this.db.exec('ALTER TABLE invites ADD COLUMN issued_by TEXT');
  }
  get<T>(sql: string, ...values: (string | number | null)[]): T | undefined {
    return this.db.prepare(sql).get(...values) as T | undefined;
  }
  all<T>(sql: string, ...values: (string | number | null)[]): T[] {
    return this.db.prepare(sql).all(...values) as T[];
  }
  run(sql: string, ...values: (string | number | null)[]) {
    return this.db.prepare(sql).run(...values);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  meta(key: string): string | undefined {
    return this.get<{ value: string }>('SELECT value FROM meta WHERE key=?', key)?.value;
  }
  setMeta(key: string, value: string) {
    this.run(
      'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key,
      value,
    );
  }
  audit(i: Identity, event: string, target: string) {
    this.run(
      'INSERT INTO audit(team_id,actor,event,target,created) VALUES(?,?,?,?,?)',
      i.teamId,
      i.userId,
      event,
      target,
      Date.now(),
    );
  }
  limit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    return this.transaction(() => {
      const row = this.get<{ start: number; count: number }>(
        'SELECT start,count FROM limits WHERE key=?',
        key,
      );
      if (!row || now - row.start > windowMs) {
        this.run(
          'INSERT INTO limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET start=excluded.start,count=1',
          key,
          now,
        );
        return true;
      }
      if (row.count >= max) return false;
      this.run('UPDATE limits SET count=count+1 WHERE key=?', key);
      return true;
    });
  }
  localIdentity(): Identity {
    let user = this.get<{ id: string; name: string }>(
      'SELECT id,name FROM users WHERE email=?',
      'local@localhost',
    );
    if (!user) {
      const id = randomUUID(),
        team = randomUUID();
      this.transaction(() => {
        this.run('INSERT INTO users VALUES(?,?,?,NULL)', id, 'local@localhost', 'Local operator');
        this.run('INSERT INTO teams VALUES(?,?)', team, 'Local workspace');
        this.run('INSERT INTO members VALUES(?,?,?)', id, team, 'owner');
      });
      user = { id, name: 'Local operator' };
    }
    return this.identity(user.id)!;
  }
  identity(userId: string, teamId?: string): Identity | undefined {
    const r = this.get<{ id: string; name: string; team_id: string; role: Role }>(
      `SELECT u.id,u.name,m.team_id,m.role FROM users u JOIN members m ON m.user_id=u.id WHERE u.id=? ${teamId ? 'AND m.team_id=?' : ''} LIMIT 1`,
      userId,
      ...(teamId ? [teamId] : []),
    );
    return r
      ? { userId: r.id, teamId: r.team_id, role: r.role, name: r.name, csrf: '' }
      : undefined;
  }
  session(raw: string): Identity | undefined {
    const now = Date.now(),
      hash = digest(raw);
    const r = this.get<{
      user_id: string;
      team_id: string;
      csrf: string;
      created: number;
      touched: number;
    }>('SELECT * FROM sessions WHERE hash=?', hash);
    if (!r) return;
    if (now - r.created > 12 * 3600000 || now - r.touched > 3600000) {
      this.run('DELETE FROM sessions WHERE hash=?', hash);
      return;
    }
    const i = this.identity(r.user_id, r.team_id);
    if (!i) return;
    this.run('UPDATE sessions SET touched=? WHERE hash=?', now, hash);
    return { ...i, csrf: r.csrf };
  }
  createSession(i: Identity) {
    const raw = token(),
      csrf = token(),
      now = Date.now();
    this.run(
      'INSERT INTO sessions VALUES(?,?,?,?,?,?)',
      digest(raw),
      i.userId,
      i.teamId,
      csrf,
      now,
      now,
    );
    this.run(
      'DELETE FROM sessions WHERE user_id=? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id=? ORDER BY created DESC LIMIT 10)',
      i.userId,
      i.userId,
    );
    return { raw, csrf };
  }
  addProject(teamId: string, name: string, root: string, policy: Policy) {
    const id = randomUUID();
    this.run(
      'INSERT INTO projects VALUES(?,?,?,?,?)',
      id,
      teamId,
      name,
      root,
      JSON.stringify(policy),
    );
    return id;
  }
  project(id: string, teamId: string) {
    return this.get<Project>('SELECT * FROM projects WHERE id=? AND team_id=?', id, teamId);
  }
  addPlan(
    i: Identity,
    project: Project,
    payload: {
      base: Snapshot;
      head: Snapshot;
      policy: Policy;
      include: string[];
      baseImage: string;
      image: string;
    },
  ) {
    if (this.get<{ n: number }>('SELECT count(*) n FROM plans')!.n >= 20)
      throw new Error('QUEUE_FULL');
    const id = randomUUID();
    this.run(
      'INSERT INTO plans(id,project_id,team_id,user_id,created,payload) VALUES(?,?,?,?,?,?)',
      id,
      project.id,
      i.teamId,
      i.userId,
      Date.now(),
      JSON.stringify(payload),
    );
    return id;
  }
  enqueue(i: Identity, planId: string) {
    return this.transaction(() => {
      const plan = this.get<Plan>(
        'SELECT * FROM plans WHERE id=? AND team_id=? AND user_id=?',
        planId,
        i.teamId,
        i.userId,
      );
      if (!plan || plan.used || Date.now() - plan.created > 1800000)
        throw new Error('PLAN_EXPIRED');
      const count = this.get<{ n: number }>(
        "SELECT count(*) n FROM jobs WHERE state IN ('queued','running')",
      )!.n;
      const own = this.get<{ n: number }>(
        "SELECT count(*) n FROM jobs WHERE team_id=? AND state IN ('queued','running')",
        i.teamId,
      )!.n;
      if (count >= 8 || own >= 2) throw new Error('QUEUE_FULL');
      const id = randomUUID();
      this.run('UPDATE plans SET used=1 WHERE id=?', planId);
      this.run(
        'INSERT INTO jobs(id,team_id,project_id,user_id,state,stage,plan,created) VALUES(?,?,?,?,?,?,?,?)',
        id,
        i.teamId,
        plan.project_id,
        i.userId,
        'queued',
        'queued',
        plan.payload,
        Date.now(),
      );
      this.audit(i, 'verification.queued', id);
      return id;
    });
  }
  saveEvidence(id: string, e: Evidence) {
    this.run(
      'UPDATE jobs SET state=?,stage=?,evidence=?,lease=0 WHERE id=?',
      e.state,
      'complete',
      JSON.stringify(e),
      id,
    );
  }
  close() {
    this.db.close();
  }
  cancelUserJobs(userId: string, teamId?: string) {
    this.run(
      `UPDATE jobs SET canceled=1,state=CASE WHEN state='queued' THEN 'canceled' ELSE state END WHERE user_id=? ${teamId ? 'AND team_id=?' : ''} AND state IN ('queued','running')`,
      userId,
      ...(teamId ? [teamId] : []),
    );
  }
  revokeAccount(userId: string) {
    this.run('DELETE FROM sessions WHERE user_id=?', userId);
    this.run('DELETE FROM api_tokens WHERE user_id=?', userId);
    this.run('DELETE FROM recovery WHERE user_id=?', userId);
    this.run('DELETE FROM invites WHERE issued_by=?', userId);
    this.cancelUserJobs(userId);
  }
  prune() {
    const now = Date.now();
    this.transaction(() => {
      this.run('DELETE FROM plans WHERE created<?', now - 1800000);
      this.run(
        "DELETE FROM jobs WHERE created<? AND state NOT IN ('queued','running')",
        now - 7 * 86400000,
      );
      this.run('DELETE FROM invites WHERE expires<?', now);
      this.run('DELETE FROM recovery WHERE expires<?', now);
      this.run('DELETE FROM api_tokens WHERE expires<?', now);
      this.run('DELETE FROM sessions WHERE touched<? OR created<?', now - 3600000, now - 43200000);
      this.run('DELETE FROM limits WHERE start<?', now - 86400000);
      this.run('DELETE FROM audit WHERE created<?', now - 90 * 86400000);
    });
  }
}
