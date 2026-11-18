'use client';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

type Report = Awaited<ReturnType<typeof orpc.academyLibrarySync.unmatched>>;
export function UnmatchedMaterials({
  academyId,
  courseId,
  initial,
  canResolve,
}: {
  academyId: string;
  courseId: string;
  initial: Report;
  canResolve: boolean;
}) {
  const { t } = useTranslation('library-sync');
  const errorText = useErrorText();
  const [report, setReport] = React.useState(initial);
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  async function resolve(nodeKey: string) {
    const value = selected[nodeKey];
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await orpc.academyLibrarySync.resolveLink({
        academyId,
        courseId,
        nodeKey,
        localId: value === 'deleted' || value === 'new' ? null : value,
        action:
          value === 'new'
            ? 'ADD'
            : value === 'deleted'
              ? 'KEEP_DELETED'
              : 'MATCH',
        expectedHash: report.hash,
      });
      setReport(
        await orpc.academyLibrarySync.unmatched({ academyId, courseId }),
      );
      setSelected({});
    } catch (e) {
      setError(e);
      setReport(
        await orpc.academyLibrarySync.unmatched({ academyId, courseId }),
      );
    } finally {
      setBusy(false);
    }
  }
  if (!report.nodes.length) return null;
  return (
    <section className="mb-5 rounded-card border border-border bg-card p-4">
      <h2 className="font-bold">{t('legacy.title')}</h2>
      <p className="mt-1 text-sm text-sub">{t('legacy.description')}</p>
      {error ? <p role="alert">{errorText(error)}</p> : null}
      <ul className="mt-3 space-y-3">
        {report.nodes.map((n) => (
          <li key={n.nodeKey}>
            <p className="text-sm font-semibold">
              {n.title} · {n.materialType ?? n.kind}
            </p>
            {canResolve ? (
              <div className="mt-1 flex flex-wrap gap-2">
                <select
                  aria-label={t('legacy.choose', { title: n.title })}
                  className="max-w-full rounded border border-border bg-card p-2 text-sm"
                  disabled={busy}
                  value={selected[n.nodeKey] ?? ''}
                  onChange={(e) =>
                    setSelected({ ...selected, [n.nodeKey]: e.target.value })
                  }
                >
                  <option value="">{t('legacy.select')}</option>
                  {report.candidates
                    .filter(
                      (c) =>
                        c.kind === n.kind && c.materialType === n.materialType,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  <option value="new">{t('legacy.add')}</option>
                  <option value="deleted">{t('legacy.deleted')}</option>
                </select>
                <Button
                  disabled={busy || !selected[n.nodeKey]}
                  onClick={() => void resolve(n.nodeKey)}
                >
                  {t('legacy.save')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
