import { useEffect, useRef, useState } from 'react';
import type { WorkspaceImpact } from '../../../packages/core/src/workspace.js';
import type { Verdict } from '../../../packages/contracts/src/index.js';

export function WorkspaceScope({
  language,
  scope,
  planHash,
}: {
  language: 'en' | 'tr';
  scope: {
    selected: { path: string; name: string; reason: string; via: string[] }[];
    unselected: string[];
    members?: { path: string; required: number; observed: number; status: Verdict }[];
  };
  planHash?: string | undefined;
}) {
  const t = (en: string, tr: string) => (language === 'en' ? en : tr);
  const status = {
    pass: t('Passed', 'Geçti'),
    fail: t('Failed', 'Başarısız'),
    inconclusive: t('Incomplete', 'Belirsiz'),
  };
  return (
    <section
      className="panel workspace-scope"
      aria-label={t('Workspace verification scope', 'Workspace doğrulama kapsamı')}
    >
      <div className="panel-header">
        <h2>{t('One plan. Every required package.', 'Tek plan. Her zorunlu paket.')}</h2>
        <span>
          {scope.selected.length} {t('selected', 'seçildi')}
        </span>
      </div>
      {planHash && (
        <p className="scope-identity">
          {t('Frozen plan', 'Sabit plan')} <code>{planHash}</code>
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('Package', 'Paket')}</th>
              <th>{t('Why included', 'Seçim nedeni')}</th>
              <th>{t('Required evidence', 'Zorunlu kanıt')}</th>
            </tr>
          </thead>
          <tbody>
            {scope.selected.map((member) => {
              const result = scope.members?.find((m) => m.path === member.path);
              return (
                <tr key={member.path}>
                  <td>
                    <strong>{member.name}</strong>
                    <code className="replacement">{member.path}</code>
                  </td>
                  <td>
                    {member.reason === 'direct'
                      ? t('Changed files', 'Değişen dosyalar')
                      : member.reason === 'dependent'
                        ? t('Consumer of changed code', 'Değişen kodun tüketicisi')
                        : t('Required by policy', 'Politikada zorunlu')}
                    <code className="replacement">{member.via.join(' → ')}</code>
                  </td>
                  <td>
                    {result ? (
                      <>
                        <strong>{status[result.status]}</strong>
                        <span className="replacement">
                          {result.observed}/{result.required}{' '}
                          {t(
                            'tests passed in all three candidate trials',
                            'test, üç aday denemesinde de geçti',
                          )}
                        </span>
                      </>
                    ) : (
                      t('Not executed yet', 'Henüz çalıştırılmadı')
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="scope-identity">
        {t(
          'Shared job budget; a package result cannot replace another package’s evidence.',
          'İş bütçesi ortaktır; bir paketin sonucu diğerinin kanıtı yerine geçmez.',
        )}
      </p>
      {!!scope.unselected.length && (
        <p className="scope-identity">
          <strong>{t('Not verified', 'Doğrulanmadı')}: </strong>
          {scope.unselected.join(', ')}
        </p>
      )}
    </section>
  );
}

export function WorkspacePreflight({
  language,
  inspect,
  disabled,
}: {
  language: 'en' | 'tr';
  inspect: () => Promise<WorkspaceImpact>;
  disabled: boolean;
}) {
  const [result, setResult] = useState<WorkspaceImpact | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  const t = (en: string, tr: string) => (language === 'en' ? en : tr);
  const reason = {
    direct: t('Changed files', 'Değişen dosyalar'),
    dependent: t('Dependent package', 'Bağımlı paket'),
    shared: t('Shared root change', 'Ortak kök değişikliği'),
    uncertain: t('Incomplete graph: review all', 'Eksik grafik: tümünü incele'),
  };
  return (
    <section
      className="workspace-preflight"
      aria-label={t('Workspace impact preflight', 'Paket etki ön incelemesi')}
    >
      <button
        className="text-button"
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          const current = ++revision.current;
          setLoading(true);
          setError('');
          setResult(null);
          void inspect()
            .then((value) => {
              if (revision.current === current) setResult(value);
            })
            .catch(() => {
              if (revision.current === current)
                setError(
                  t(
                    'Could not inspect this snapshot. Check the project and base reference.',
                    'Kaynak görüntüsü incelenemedi. Projeyi ve başlangıç referansını kontrol et.',
                  ),
                );
            })
            .finally(() => {
              if (revision.current === current) setLoading(false);
            });
        }}
      >
        {loading
          ? t('Inspecting…', 'İnceleniyor…')
          : t('Inspect package impact', 'Paket etkisini incele')}
      </button>
      <p className="muted">
        {t(
          'Reads manifest dependencies from the two snapshots. No project code executes. Untracked files are excluded.',
          'İki kaynak görüntüsündeki paket bağımlılıklarını okur. Proje kodu çalıştırılmaz. İzlenmeyen dosyalar dahil değildir.',
        )}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <div role="status">
          <h3>
            {t('Packages to review', 'İncelenecek paketler')} · {result.affected.length}/
            {result.packages.length}
          </h3>
          <p>
            {result.status === 'complete'
              ? t('Manifest graph inspected', 'Bildirim grafiği incelendi')
              : t('Incomplete graph — conservative selection', 'Eksik grafik — temkinli seçim')}
          </p>
          <p>
            {t(
              'Inspection is not verification evidence. Execution still supports one npm package.',
              'Ön inceleme doğrulama kanıtı değildir. Çalıştırma hâlâ tek npm paketini destekler.',
            )}
          </p>
          <ul>
            {result.affected.map((pkg) => (
              <li key={pkg.path}>
                <strong>{pkg.name}</strong> <code>{pkg.path}</code>
                <span>{reason[pkg.reason]}</span>
                {pkg.via.length > 1 && <code>{pkg.via.join(' → ')}</code>}
                {pkg.directFiles.length > 0 && (
                  <span>
                    {pkg.directFiles.length} {t('changed files', 'değişen dosya')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!result.affected.length && (
            <p>
              {t(
                'No affected package result is available for this snapshot.',
                'Bu kaynak görüntüsü için etkilenen paket sonucu yok.',
              )}
            </p>
          )}
          {result.cycles.length > 0 && (
            <p>
              {t('Dependency cycles', 'Bağımlılık döngüleri')}:{' '}
              {result.cycles.map((c) => c.join(' ↔ ')).join('; ')}
            </p>
          )}
          {result.diagnostics.length > 0 && (
            <ul aria-label={t('Graph diagnostics', 'Grafik bulguları')}>
              {result.diagnostics.map((d) => (
                <li key={`${d.code}:${d.path}`}>
                  <code>{d.code}</code> <code>{d.path}</code>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            {t('Snapshot', 'Kaynak görüntüsü')}: <code>{result.candidateHash.slice(0, 16)}</code>
          </p>
        </div>
      )}
    </section>
  );
}
