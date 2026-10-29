import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DropdownMenu, Tabs } from 'radix-ui';
import { setNonce } from 'get-nonce';
import { TeamPanel, type TeamView } from './team.js';
import { SelectControl } from './controls.js';
import { WorkspacePreflight, WorkspaceScope } from './workspace.js';
import type { Evidence } from '../../../packages/contracts/src/index.js';
import './style.css';
setNonce(document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? '');

type Language = 'en' | 'tr';
type Identity = { name: string; userId: string; teamId: string; role: string; csrf: string };
type Run = {
  id: string;
  project_id: string;
  state: string;
  stage: string;
  created: number;
  evidence: Evidence | null;
};
const copy = {
  en: {
    workspace: 'Workspace',
    workbench: 'Workbench',
    history: 'Run history',
    team: 'Team',
    heading: 'A change. Its evidence.',
    intro: 'See what changed, what was tested, and what the tests actually caught.',
    newRun: 'Verify a change',
    reference: 'REFERENCE EXECUTION',
    demo: 'Read-only demo · bundled synthetic project',
    local: 'LOCAL WORKSPACE',
    verified: 'Policy passed',
    failed: 'Findings to review',
    inconclusive: 'More evidence needed',
    empty: 'Your first verification starts here.',
    emptyHelp: 'Register a Git repository with the CLI, then freeze a change for verification.',
    regression: 'Regression evidence',
    fresh: 'fresh before / after trials',
    suite: 'Required suite',
    cases: 'test cases on the candidate',
    mutations: 'Controlled mutations',
    detected: 'detected',
    code: 'Implementation change',
    before: 'Original',
    after: 'Candidate',
    timeline: 'Execution record',
    scope: 'Bound to this change',
    report: 'Export report',
    findings: 'Findings',
    all: 'All observations',
    survivors: 'Needs review',
    noFindings: 'No open findings in the declared scope.',
    findingHelp:
      'A passing policy describes the checks below. It does not certify the entire application.',
    unchanged:
      'The regression test must fail for the declared reason on the original, and pass on the candidate.',
    mutantHelp:
      'Controlled code edits measure test sensitivity. Surviving edits need review; they are not automatically product bugs.',
    pending: 'Verification in progress',
    cancel: 'Cancel',
    close: 'Close',
    plan: 'Freeze verification plan',
    base: 'Base reference',
    project: 'Registered project',
    start: 'Run this plan',
    budget: 'Budget',
    login: 'Sign in',
    password: 'Password',
    email: 'Email',
    name: 'Display name',
    setup: 'Create your workspace',
    open: 'Open local workspace',
    bootstrap: 'Use the private launch URL written by the CLI to open this workspace.',
    invite: 'Accept team invitation',
    recover: 'Set a new password',
    logout: 'Sign out',
    members: 'Members',
    inviteMember: 'Invite a member',
    role: 'Role',
    inviteLink: 'Copy this one-use invitation link',
    noRuns: 'No runs yet',
    stale: 'Workspace changed — this report applies to an earlier snapshot.',
    ready: 'Ready',
    audit: 'Recent activity',
    mode: 'Recorded scope only',
    error: 'Request failed',
    workspaceBlocked:
      'Workspace inspection is available. Register a reviewed workspace policy v2 before planning execution.',
    waiting: 'Waiting for reference evidence',
    hash: 'Candidate snapshot',
  },
  tr: {
    workspace: 'Çalışma alanı',
    workbench: 'İnceleme',
    history: 'Geçmiş denemeler',
    team: 'Ekip',
    heading: 'Değişiklik ve kanıtı.',
    intro: 'Ne değiştiğini, neyin sınandığını ve testlerin hangi hataları yakaladığını görün.',
    newRun: 'Değişikliği doğrula',
    reference: 'KAYITLI ÖRNEK DENEME',
    demo: 'Salt okunur demo · örnek proje verileri',
    local: 'YEREL ÇALIŞMA ALANI',
    verified: 'Politika geçti',
    failed: 'İncelenecek bulgular var',
    inconclusive: 'Daha fazla kanıt gerekli',
    empty: 'İlk doğrulamanız burada başlıyor.',
    emptyHelp: 'CLI ile bir Git deposu kaydedin, ardından doğrulanacak değişikliği sabitleyin.',
    regression: 'Regresyon kanıtı',
    fresh: 'taze eski / yeni denemesi',
    suite: 'Zorunlu testler',
    cases: 'aday sürümde test',
    mutations: 'Kontrollü hatalar',
    detected: 'yakalandı',
    code: 'Uygulama değişikliği',
    before: 'Önceki',
    after: 'Aday',
    timeline: 'Çalıştırma kaydı',
    scope: 'Bu değişikliğe bağlı',
    report: 'Raporu indir',
    findings: 'Bulgular',
    all: 'Tüm gözlemler',
    survivors: 'İnceleme gerekli',
    noFindings: 'Belirlenen kapsamda açık bulgu yok.',
    findingHelp:
      'Politikanın geçmesi aşağıdaki kontrolleri kapsar. Tüm uygulamanın doğruluğunu belgelemez.',
    unchanged:
      'Regresyon testi eski kodda beklenen nedenle başarısız, aday kodda başarılı olmalıdır.',
    mutantHelp:
      'Kontrollü kod değişiklikleri testlerin duyarlılığını ölçer. Kaçan değişiklikler incelenmelidir; hepsi ürün hatası değildir.',
    pending: 'Doğrulama sürüyor',
    cancel: 'İptal et',
    close: 'Kapat',
    plan: 'Doğrulama planını sabitle',
    base: 'Başlangıç referansı',
    project: 'Kayıtlı proje',
    start: 'Bu planı çalıştır',
    budget: 'Bütçe',
    login: 'Giriş yap',
    password: 'Parola',
    email: 'E-posta',
    name: 'Görünen ad',
    setup: 'Çalışma alanını oluştur',
    open: 'Yerel çalışma alanını aç',
    bootstrap:
      'Bu alanı açmak için CLI tarafından kaydedilen özel başlangıç bağlantısını kullanın.',
    invite: 'Ekip davetini kabul et',
    recover: 'Yeni parola belirle',
    logout: 'Çıkış yap',
    members: 'Üyeler',
    inviteMember: 'Üye davet et',
    role: 'Rol',
    inviteLink: 'Bu tek kullanımlık davet bağlantısını paylaşın',
    noRuns: 'Henüz deneme yok',
    stale: 'Çalışma alanı değişti — bu rapor önceki görüntüye aittir.',
    ready: 'Hazır',
    audit: 'Son işlemler',
    mode: 'Yalnızca kayıtlı kapsam',
    error: 'İstek başarısız',
    workspaceBlocked:
      'Paket ön incelemesi kullanılabilir. Çalıştırma planı için incelenmiş workspace v2 politikası kaydedin.',
    waiting: 'Örnek kanıt bekleniyor',
    hash: 'Aday kaynak görüntüsü',
  },
};
function App() {
  const [lang, setLang] = useState<Language>(() =>
      localStorage.getItem('proofgate-language') === 'tr' ? 'tr' : 'en',
    ),
    t = copy[lang];
  const [session, setSession] = useState<{
      mode: string;
      identity: Identity | null;
      needsSetup?: boolean;
      version: string;
    } | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(''),
    [page, setPage] = useState('workbench'),
    [error, setError] = useState('');
  const [fragment] = useState(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname);
    return { bootstrap: p.get('bootstrap'), invite: p.get('invite'), recovery: p.get('recovery') };
  });
  const [linkMode, setLinkMode] = useState(true),
    [changeRecord, setChangeRecord] = useState<{
      runId: string;
      candidateHash: string;
      base: string;
      head: string;
      file: string;
      stale: boolean;
    } | null>(null);
  const [dialog, setDialog] = useState(false),
    [base, setBase] = useState('HEAD'),
    [project, setProject] = useState(''),
    [plan, setPlan] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [team, setTeam] = useState<TeamView | null>(null);
  const planRevision = useRef(0);
  useEffect(() => {
    planRevision.current++;
    setPlan(null);
  }, [project, base, dialog]);
  const api = useCallback(
    async (route: string, data?: unknown) => {
      const response = await fetch(route, {
        method: data ? 'POST' : 'GET',
        headers: data
          ? { 'content-type': 'application/json', 'x-csrf-token': session?.identity?.csrf ?? '' }
          : {},
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error === 'WORKSPACE_EXECUTION_UNSUPPORTED'
            ? t.workspaceBlocked
            : (result.error ?? t.error),
        );
      return result;
    },
    [session?.identity?.csrf, t.error, t.workspaceBlocked],
  );
  const refresh = useCallback(async () => {
    const s = await api('/api/session');
    setSession(s);
    if (s.identity || s.mode === 'demo') {
      const [r, p] = await Promise.all([api('/api/runs'), api('/api/projects')]);
      setRuns(r);
      setProjects(p);
      setSelected((old) => old || r[0]?.id || '');
      setProject((old) => old || p[0]?.id || '');
    }
  }, [api]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message)));
  }, [refresh]);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('proofgate-language', lang);
  }, [lang]);
  const run = runs.find((r) => r.id === selected) ?? runs[0],
    e = run?.evidence,
    demo = session?.mode === 'demo';
  const change =
    changeRecord?.runId === run?.id && changeRecord?.candidateHash === e?.candidateHash
      ? changeRecord
      : null;
  useEffect(() => {
    if (!run?.id || !e) return;
    let active = true;
    const runId = run.id,
      candidateHash = e.candidateHash;
    void api(`/api/runs/${runId}/change`)
      .then((value) => {
        if (active) setChangeRecord({ ...value, runId, candidateHash });
      })
      .catch(() => {
        if (active) setChangeRecord(null);
      });
    return () => {
      active = false;
    };
  }, [run?.id, e, api]);
  useEffect(() => {
    if (!runs.some((r) => r.state === 'queued' || r.state === 'running')) return;
    const timer = setInterval(() => void refresh().catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, [runs, refresh]);
  useEffect(() => {
    if (page === 'team' && session?.identity)
      void api('/api/team')
        .then(setTeam)
        .catch((err) => setError(err.message));
  }, [page, api, session?.identity]);
  const perform = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      email = String(data.get('email') ?? ''),
      password = String(data.get('password') ?? ''),
      name = String(data.get('name') ?? '');
    await perform(async () => {
      if (linkMode && fragment.recovery) {
        await api('/api/recovery', { token: fragment.recovery, password });
        setLinkMode(false);
      } else if (linkMode && fragment.invite) {
        await api('/api/invites/accept', { token: fragment.invite, name, password });
        setLinkMode(false);
      } else if (fragment.bootstrap && session?.mode === 'local') {
        await api('/api/bootstrap', { token: fragment.bootstrap });
      } else if (fragment.bootstrap && session?.needsSetup) {
        await api('/api/bootstrap', { token: fragment.bootstrap, email, password, name });
      } else await api('/api/login', { email, password });
      await refresh();
    });
  }
  const language = (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="text-button" aria-label="Language / Dil">
        {lang.toUpperCase()} <span aria-hidden="true">⌄</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="end">
          <DropdownMenu.Item onSelect={() => setLang('en')}>English</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => setLang('tr')}>Türkçe</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
  if (!session)
    return (
      <main className="loading" aria-busy="true">
        ProofGate <span>· · ·</span>
      </main>
    );
  if (!session.identity && !demo)
    return (
      <main className="auth-page">
        <div className="auth-top">
          <Logo />
          {language}
        </div>
        <section className="auth-card">
          <span className="eyebrow">PROOFGATE / {session.mode.toUpperCase()}</span>
          <h1>
            {linkMode && fragment.recovery
              ? t.recover
              : linkMode && fragment.invite
                ? t.invite
                : session.needsSetup
                  ? t.setup
                  : session.mode === 'local'
                    ? t.open
                    : t.login}
          </h1>
          <form onSubmit={authenticate}>
            {session.mode === 'local' ? (
              <p>{t.bootstrap}</p>
            ) : (
              <>
                {((fragment.bootstrap && session.needsSetup) || (fragment.invite && linkMode)) && (
                  <label>
                    {t.name}
                    <input name="name" autoComplete="name" required maxLength={80} />
                  </label>
                )}
                {!(linkMode && (fragment.recovery || fragment.invite)) && (
                  <label>
                    {t.email}
                    <input name="email" type="email" autoComplete="email" required />
                  </label>
                )}
                <label>
                  {t.password}
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      fragment.recovery || fragment.invite || session.needsSetup
                        ? 'new-password'
                        : 'current-password'
                    }
                    minLength={fragment.recovery || fragment.invite || session.needsSetup ? 15 : 1}
                    required
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy || (session.mode === 'local' && !fragment.bootstrap)}
            >
              {busy
                ? '…'
                : session.mode === 'local'
                  ? t.open
                  : linkMode && fragment.invite
                    ? t.invite
                    : linkMode && fragment.recovery
                      ? t.recover
                      : session.needsSetup
                        ? t.setup
                        : t.login}
            </button>
          </form>
        </section>
      </main>
    );
  return (
    <div className="shell">
      <aside className="rail">
        <Logo />
        <nav aria-label={t.workspace}>
          {[
            ['workbench', '01', t.workbench],
            ['history', '02', t.history],
            ...(session.mode === 'team' ? [['team', '03', t.team]] : []),
          ].map(([id, n, label]) => (
            <button
              key={id}
              onClick={() => setPage(id!)}
              className={page === id ? 'nav active' : 'nav'}
              aria-current={page === id ? 'page' : undefined}
            >
              <span>{n}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="online-dot" />
          {demo ? 'REFERENCE MODE' : t.ready}
          <small>v{session.version}</small>
          {!demo && (
            <button
              className="text-button"
              onClick={() =>
                void perform(async () => {
                  await api('/api/logout', {});
                  await refresh();
                })
              }
            >
              {t.logout}
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {t.workspace}
            <span className="separator">/</span>
            <strong>
              {demo && e?.workspace
                ? lang === 'en'
                  ? 'Workspace access / example'
                  : 'Workspace izinleri / örnek'
                : (projects.find((p) => p.id === run?.project_id)?.name ?? 'ProofGate')}
            </strong>
          </span>
          <div>
            {language}
            <span className="avatar" title={session.identity?.name ?? 'Demo'}>
              {demo ? 'D' : session.identity?.name.slice(0, 1)}
            </span>
          </div>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{demo ? t.reference : t.local}</span>
              <h1>{page === 'team' ? t.team : page === 'history' ? t.history : t.heading}</h1>
              <p>{demo ? t.demo : t.intro}</p>
            </div>
            {!demo && session.identity?.role !== 'viewer' && (
              <button
                className="primary"
                onClick={() => {
                  setPlan(null);
                  setDialog(true);
                }}
              >
                <span aria-hidden="true">＋</span> {t.newRun}
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => setError('')} aria-label={t.close}>
                ×
              </button>
            </div>
          )}
          {page === 'team' ? (
            <TeamPanel
              lang={lang}
              identity={session.identity!}
              data={team}
              projects={projects}
              api={api}
              refresh={refresh}
              reload={async () => setTeam(await api('/api/team'))}
            />
          ) : page === 'history' ? (
            <section className="panel history-panel">
              {runs.length ? (
                runs.map((r) => (
                  <button
                    key={r.id}
                    className="history-row"
                    onClick={() => {
                      setSelected(r.id);
                      setPage('workbench');
                    }}
                  >
                    <span className="mono">{r.id.slice(0, 8)}</span>
                    <span>
                      {r.evidence
                        ? t[
                            r.evidence.verdict === 'pass'
                              ? 'verified'
                              : r.evidence.verdict === 'fail'
                                ? 'failed'
                                : 'inconclusive'
                          ]
                        : r.stage}
                      {r.evidence && (
                        <small>
                          {r.evidence.workspace
                            ? `${r.evidence.workspace.selected.length} ${lang === 'en' ? 'workspace packages' : 'workspace paketi'}`
                            : lang === 'en'
                              ? 'Single package'
                              : 'Tek paket'}
                        </small>
                      )}
                    </span>
                    <time>{new Date(r.created).toLocaleString(lang)}</time>
                    <span>↗</span>
                  </button>
                ))
              ) : (
                <p>{t.noRuns}</p>
              )}
            </section>
          ) : !run ? (
            <section className="empty panel">
              <span className="empty-mark">∴</span>
              <h2>{demo ? t.waiting : t.empty}</h2>
              <p>{t.emptyHelp}</p>
              {!demo && <code>proofgate example --data .proofgate</code>}
            </section>
          ) : (
            <>
              <section className={`verdict-strip ${e?.verdict ?? 'pending'}`}>
                <div>
                  <span className="verdict-icon" aria-hidden="true">
                    {e?.verdict === 'pass' ? '✓' : e?.verdict === 'fail' ? '!' : '·'}
                  </span>
                  <div>
                    <h2>
                      {e
                        ? t[
                            e.verdict === 'pass'
                              ? 'verified'
                              : e.verdict === 'fail'
                                ? 'failed'
                                : 'inconclusive'
                          ]
                        : ['interrupted', 'canceled'].includes(run.state)
                          ? t.inconclusive
                          : t.pending}
                    </h2>
                    <p>{change?.stale ? t.stale : e ? t.findingHelp : run.stage}</p>
                  </div>
                </div>
                <div className="verdict-meta">
                  <span className="mono">{run.id.slice(0, 8)}</span>
                  {e ? (
                    <a className="outline-button" href={`/api/runs/${run.id}/report`}>
                      {t.report} <span aria-hidden="true">↓</span>
                    </a>
                  ) : (
                    <button
                      className="outline-button"
                      onClick={() =>
                        void perform(async () => {
                          await api(`/api/runs/${run.id}/cancel`, {});
                          await refresh();
                        })
                      }
                    >
                      {t.cancel}
                    </button>
                  )}
                </div>
              </section>
              {e && (
                <>
                  <section className="metrics" aria-label={t.scope}>
                    <Metric
                      index="01"
                      title={t.regression}
                      value={`${e.trials.filter((x) => x.variant === 'C').length} / ${e.trials.filter((x) => x.variant === 'H').length}`}
                      note={t.fresh}
                    />
                    <Metric
                      index="02"
                      title={t.suite}
                      value={String(e.trials.find((x) => x.variant === 'H')?.tests.length ?? 0)}
                      note={t.cases}
                    />
                    <Metric
                      index="03"
                      title={t.mutations}
                      value={`${e.mutations.filter((m) => m.status === 'detected').length} / ${e.mutations.length}`}
                      note={t.detected}
                    />
                  </section>
                  {e.workspace && (
                    <WorkspaceScope language={lang} scope={e.workspace} planHash={e.planHash} />
                  )}
                  <div className="review-grid">
                    <section className="panel diff-panel">
                      <div className="panel-header">
                        <h2>{t.code}</h2>
                        <span className="mono">{change?.file ?? 'source'}</span>
                      </div>
                      <div className="diff-half before">
                        <span className="diff-label">− {t.before}</span>
                        <pre>
                          <code>{change?.base ?? '…'}</code>
                        </pre>
                      </div>
                      <div className="diff-half after">
                        <span className="diff-label">＋ {t.after}</span>
                        <pre>
                          <code>{change?.head ?? '…'}</code>
                        </pre>
                      </div>
                      <div className="explanation">
                        <span className="small-mark">↳</span>
                        <p>{t.unchanged}</p>
                      </div>
                      <div className="source-stamp">
                        <span>{t.hash}</span>
                        <code>{e.candidateHash.slice(0, 24)}…</code>
                        {change?.stale && <strong>{t.stale}</strong>}
                      </div>
                    </section>
                    <section className="panel trial-panel">
                      <div className="panel-header">
                        <h2>{t.timeline}</h2>
                        <span className="mono">{(e.elapsedMs / 1000).toFixed(1)}s</span>
                      </div>
                      <ol className="trials">
                        {e.trials.map((trial) => (
                          <li key={`${trial.variant}${trial.index}`}>
                            <span
                              className={`trial-node ${trial.status !== 'complete' ? 'unknown' : trial.variant === 'C' ? 'expected' : 'good'}`}
                            >
                              {trial.variant}
                            </span>
                            <div>
                              <strong>
                                {trial.variant === 'B'
                                  ? 'Baseline'
                                  : trial.variant === 'C'
                                    ? `${t.before} / ${trial.index}`
                                    : `${t.after} / ${trial.index}`}
                              </strong>
                              <small>
                                {trial.status === 'complete'
                                  ? `${trial.tests.filter((x) => x.status === 'passed').length} passed · ${trial.tests.filter((x) => x.status === 'failed').length} failed`
                                  : trial.status}
                              </small>
                            </div>
                            <span className="mono">{(trial.elapsedMs / 1000).toFixed(1)}s</span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </div>
                  <section className="panel mutation-panel">
                    <div className="panel-header">
                      <div>
                        <h2>{t.mutations}</h2>
                        <p>{t.mutantHelp}</p>
                      </div>
                      <span className="mono">
                        {e.mutationScope.attempted} / {e.mutationScope.selected}
                      </span>
                    </div>
                    <Tabs.Root defaultValue="all">
                      <Tabs.List className="tab-list" aria-label={t.mutations}>
                        <Tabs.Trigger value="all">
                          {t.all} <span>{e.mutations.length}</span>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="review">
                          {t.survivors}{' '}
                          <span>{e.mutations.filter((m) => m.status !== 'detected').length}</span>
                        </Tabs.Trigger>
                      </Tabs.List>
                      {['all', 'review'].map((tab) => (
                        <Tabs.Content value={tab} key={tab}>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>{t.code}</th>
                                  <th>Mutation</th>
                                  <th>{t.role === 'Role' ? 'Observation' : 'Gözlem'}</th>
                                  <th>Test</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.mutations
                                  .filter((m) => tab === 'all' || m.status !== 'detected')
                                  .map((m) => (
                                    <tr key={m.id}>
                                      <td className="mono">
                                        {m.file}:{m.line}
                                      </td>
                                      <td>
                                        <strong>{m.mutator}</strong>
                                        <code className="replacement">{m.replacement || '∅'}</code>
                                      </td>
                                      <td>
                                        <span className={`status-label ${m.status}`}>
                                          <span aria-hidden="true">
                                            {m.status === 'detected' ? '●' : '◌'}
                                          </span>{' '}
                                          {m.status}
                                        </span>
                                      </td>
                                      <td className="mono">{m.killedBy.join(', ') || '—'}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                            {tab === 'review' &&
                              !e.mutations.some((m) => m.status !== 'detected') && (
                                <p className="no-findings">✓ {t.noFindings}</p>
                              )}
                          </div>
                        </Tabs.Content>
                      ))}
                    </Tabs.Root>
                  </section>
                  <section className="findings-section">
                    <span className="eyebrow">
                      {t.findings} / {e.findings.length.toString().padStart(2, '0')}
                    </span>
                    {e.findings.length ? (
                      e.findings.map((f, index) => (
                        <article className="finding" key={index}>
                          <span className="pill">{f.severity}</span>
                          <div>
                            <h3>{f.code}</h3>
                            <p>{f.detail}</p>
                            {f.file && <code>{f.file}</code>}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p>{t.noFindings}</p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer>
            <span>
              ProofGate <span className="separator">/</span> {t.mode}
            </span>
            <span>v{session.version} · MIT</span>
          </footer>
        </main>
      </div>
      <Dialog.Root open={dialog} onOpenChange={setDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>{t.newRun}</Dialog.Title>
            <Dialog.Description>{t.unchanged}</Dialog.Description>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  if (!plan) {
                    const revision = ++planRevision.current;
                    const frozen = await api('/api/plans', {
                      projectId: project,
                      baseRef: base,
                      include: [],
                    });
                    if (revision === planRevision.current) setPlan(frozen);
                  } else {
                    const r = await api('/api/runs', { planId: plan.planId });
                    setSelected(r.runId);
                    setDialog(false);
                    setPage('workbench');
                    await refresh();
                  }
                });
              }}
            >
              <SelectControl
                label={t.project}
                value={project}
                onChange={(value) => {
                  setProject(value);
                  setPlan(null);
                }}
                items={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
              <label>
                {t.base}
                <input
                  value={base}
                  onChange={(event) => {
                    setBase(event.target.value);
                    setPlan(null);
                  }}
                  required
                  maxLength={120}
                />
              </label>
              {plan && (
                <div className="plan-summary">
                  <span>{t.hash}</span>
                  <code>{plan.candidateHash.slice(0, 24)}</code>
                  <span>{lang === 'en' ? 'Plan identity' : 'Plan kimliği'}</span>
                  <code>{plan.planHash}</code>
                  <span>{t.budget}</span>
                  <p>
                    {plan.budget.mutants} mutations · {plan.budget.totalMs / 60000} min
                  </p>
                  <ul>
                    {plan.changedFiles.map((f: string) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {plan.workspace && (
                    <WorkspaceScope
                      language={lang}
                      scope={plan.workspace}
                      planHash={plan.planHash}
                    />
                  )}
                </div>
              )}
              <WorkspacePreflight
                key={`${dialog}:${project}:${base}`}
                language={lang}
                disabled={busy || !project}
                inspect={async () =>
                  (await api('/api/inspect', { projectId: project, baseRef: base, include: [] }))
                    .workspaceImpact
                }
              />
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy || !project}>
                {busy ? '…' : plan ? t.start : t.plan}
              </button>
            </form>
            <Dialog.Close className="dialog-close" aria-label={t.close}>
              ×
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-symbol" aria-hidden="true">
        p<span>g</span>
      </span>
      <span>
        ProofGate<small>OBSERVE. VERIFY.</small>
      </span>
    </div>
  );
}
function Metric({
  index,
  title,
  value,
  note,
}: {
  index: string;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <article className="metric">
      <div>
        <span>{title}</span>
        <span className="mono metric-index">{index}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
