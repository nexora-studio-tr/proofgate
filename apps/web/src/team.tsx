import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { SelectControl } from './controls.js';
interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface TeamView {
  team: { id: string; name: string };
  members: Member[];
  teams: { id: string; name: string }[];
}
interface Props {
  lang: 'en' | 'tr';
  identity: { userId: string; role: string };
  data: TeamView | null;
  projects: { id: string; name: string }[];
  api: (route: string, data?: unknown) => Promise<any>;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
}
export function TeamPanel({ lang, identity, data, projects, api, refresh, reload }: Props) {
  const tr = lang === 'tr',
    owner = identity.role === 'owner',
    admin = ['owner', 'admin'].includes(identity.role);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [link, setLink] = useState(''),
    [token, setToken] = useState(''),
    [dialog, setDialog] = useState<{ action: 'remove' | 'transfer'; member: Member } | null>(null);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel team-panel">
      <div className="panel-header">
        <div>
          <h2>{data?.team.name ?? (tr ? 'Ekip' : 'Team')}</h2>
          <p className="mono">ID / {data?.team.id}</p>
        </div>
        <span className="pill">{identity.role}</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="team-columns">
        <section>
          <h3>{tr ? 'Üyeler' : 'Members'}</h3>
          {data?.members.map((m) => (
            <div className="member" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <small>{m.email}</small>
              </div>
              <div className="member-actions">
                {owner && m.id !== identity.userId ? (
                  <>
                    <SelectControl
                      label={`${m.name} / ${tr ? 'Rol' : 'Role'}`}
                      value={m.role}
                      onChange={(role) =>
                        void act(async () => {
                          await api(`/api/members/${m.id}/role`, { role });
                          await reload();
                        })
                      }
                      items={['admin', 'member', 'viewer'].map((value) => ({
                        value,
                        label: value,
                      }))}
                    />
                    <button
                      className="text-button"
                      onClick={() => setDialog({ action: 'transfer', member: m })}
                    >
                      {tr ? 'Sahipliği devret' : 'Transfer ownership'}
                    </button>
                    <button
                      className="text-button danger"
                      onClick={() => setDialog({ action: 'remove', member: m })}
                    >
                      {tr ? 'Kaldır' : 'Remove'}
                    </button>
                  </>
                ) : (
                  <span className="pill">{m.role}</span>
                )}
              </div>
            </div>
          ))}
          {admin && (
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void act(async () => {
                  const result = await api('/api/invites', {
                    email: f.get('email'),
                    role: f.get('role'),
                  });
                  setLink(result.url);
                });
              }}
            >
              <h3>{tr ? 'Üye davet et' : 'Invite a member'}</h3>
              <label>
                {tr ? 'E-posta' : 'Email'}
                <input name="email" type="email" required maxLength={254} />
              </label>
              <SelectControl
                label={tr ? 'Rol' : 'Role'}
                name="role"
                items={['member', 'viewer', ...(owner ? ['admin'] : [])].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <button className="primary" disabled={busy}>
                {tr ? 'Davet bağlantısı oluştur' : 'Create invitation link'}
              </button>
              {link && (
                <label>
                  {tr ? 'Tek kullanımlık davet bağlantısı' : 'Single-use invitation link'}
                  <input value={link} readOnly onFocus={(e) => e.target.select()} />
                </label>
              )}
            </form>
          )}
        </section>
        <section>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void act(async () => {
                const result = await api('/api/teams', { name: f.get('name') });
                await api(`/api/teams/${result.id}/switch`, {});
                await refresh();
              });
            }}
          >
            <h3>{tr ? 'Çalışma alanları' : 'Workspaces'}</h3>
            {data && data.teams.length > 1 && (
              <SelectControl
                label={tr ? 'Çalışma alanı' : 'Workspace'}
                value={data.team.id}
                onChange={(id) =>
                  void act(async () => {
                    await api(`/api/teams/${id}/switch`, {});
                    await refresh();
                  })
                }
                items={data.teams.map((t) => ({ value: t.id, label: t.name }))}
              />
            )}
            <label>
              {tr ? 'Yeni alan adı' : 'New workspace name'}
              <input name="name" required maxLength={80} />
            </label>
            <button className="outline-button" disabled={busy}>
              {tr ? 'Alan oluştur' : 'Create workspace'}
            </button>
          </form>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void act(async () => {
                await api('/api/password', {
                  current: f.get('current'),
                  password: f.get('password'),
                });
                await refresh();
              });
            }}
          >
            <h3>{tr ? 'Parola değiştir' : 'Change password'}</h3>
            <label>
              {tr ? 'Mevcut parola' : 'Current password'}
              <input name="current" type="password" autoComplete="current-password" required />
            </label>
            <label>
              {tr ? 'Yeni parola (en az 15 karakter)' : 'New password (at least 15 characters)'}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={15}
                required
              />
            </label>
            <p className="settings-note">
              {tr
                ? 'Parola değişince tüm oturumlar ve erişim anahtarları kapatılır.'
                : 'Changing your password revokes sessions and access tokens.'}
            </p>
            <button className="outline-button" disabled={busy}>
              {tr ? 'Parolayı değiştir' : 'Change password'}
            </button>
          </form>
          {identity.role !== 'viewer' && projects.length > 0 && (
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void act(async () => {
                  const result = await api(`/api/projects/${f.get('project')}/tokens`, { days: 7 });
                  setToken(result.token);
                });
              }}
            >
              <h3>{tr ? 'Proje erişim anahtarı' : 'Project access token'}</h3>
              <SelectControl
                label={tr ? 'Proje' : 'Project'}
                name="project"
                items={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
              <p className="settings-note">
                {tr
                  ? '7 gün geçerlidir; yalnızca seçili projeye erişir.'
                  : 'Expires in 7 days and is restricted to the selected project.'}
              </p>
              <button className="outline-button" disabled={busy}>
                {tr ? 'Anahtar oluştur' : 'Create token'}
              </button>
              {token && (
                <label>
                  {tr ? 'Bir kez gösterilen anahtar' : 'Token shown once'}
                  <input value={token} readOnly onFocus={(e) => e.target.select()} />
                </label>
              )}
            </form>
          )}
        </section>
      </div>
      <Dialog.Root
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>
              {dialog?.action === 'remove'
                ? tr
                  ? 'Üyeyi kaldır'
                  : 'Remove member'
                : tr
                  ? 'Sahipliği devret'
                  : 'Transfer ownership'}
            </Dialog.Title>
            <Dialog.Description>
              {dialog?.member.name} · {dialog?.member.email}
            </Dialog.Description>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void act(async () => {
                  if (!dialog) return;
                  if (dialog.action === 'remove')
                    await api(`/api/members/${dialog.member.id}/remove`, {});
                  else
                    await api('/api/team/transfer', {
                      userId: dialog.member.id,
                      password: f.get('password'),
                    });
                  setDialog(null);
                  await refresh();
                  await reload();
                });
              }}
            >
              {dialog?.action === 'transfer' && (
                <label>
                  {tr ? 'Mevcut parolanız' : 'Your current password'}
                  <input type="password" name="password" autoComplete="current-password" required />
                </label>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {tr ? 'Onayla' : 'Confirm'}
              </button>
            </form>
            <Dialog.Close className="dialog-close" aria-label={tr ? 'Kapat' : 'Close'}>
              ×
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
