'use client';

import type { AcademyLibrarySyncUpdates, LibrarySyncConflict, LibrarySyncResolution, SyncValue } from '@cove/shared';
import * as React from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/studio/button';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { reviewFieldKey } from '@/components/studio/library-review-label';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { PrivateImageContext } from '@/components/editor/private-image-context';

const GRADING_UNITS = /^exercise\.(testCase|limits|gradingProfile|submissionPolicy|manualAssessment|language|quiz)/;

/** Review only the disputed parts. Internal release history is not an editing workflow. */
export function LibraryUpdates({ academyId, courseId, canResolve, initial, nodeKey }: {
  academyId: string; courseId: string; canResolve: boolean;
  initial: AcademyLibrarySyncUpdates; nodeKey?: string;
}) {
  const { t } = useTranslation('library-sync');
  const errorText = useErrorText();
  const client = useQueryClient();
  const router = useRouter();
  const [state, setState] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const seenGroups = new Set<string>();
  const visible = state.conflicts.filter(item => !nodeKey || item.nodeKey === nodeKey)
    .filter(item => { if (seenGroups.has(item.groupId)) return false; seenGroups.add(item.groupId); return true; });
  const field = (key: string) => t(`fields.${reviewFieldKey(key)}`);
  const firstId = visible[0]?.id;
  const conflictId = selectedId && visible.some(item => item.id === selectedId)
    ? selectedId : nodeKey ? firstId : undefined;
  const detail = useQuery({
    queryKey: ['academy', academyId, 'library-review', conflictId],
    queryFn: () => orpc.academyLibrarySync.conflict({ academyId, conflictId: conflictId! }),
    initialData: state.detail?.id === conflictId ? state.detail : undefined,
    staleTime: 30_000,
    enabled: Boolean(conflictId), retry: false,
  });
  const open = conflictId ? detail.data ?? null : null;
  const loading = Boolean(conflictId) && detail.isFetching;
  const resolveImage = React.useCallback(async (src: string) => open?.imageUrls?.[src] ?? '', [open]);
  function show(conflict: LibrarySyncConflict) { setError(null); setNotice(null); setSelectedId(conflict.id); void client.invalidateQueries({ queryKey: ['academy', academyId, 'library-review', conflict.id] }); }

  async function resolve(action: LibrarySyncResolution) {
    if (!open) return;
    setBusy(true); setError(null);
    try {
      await orpc.academyLibrarySync.resolve({ academyId, conflictId: open.id, action,
        expectedOursHash: open.expectedOursHash, expectedTheirsHash: open.expectedTheirsHash,
        requestKey: crypto.randomUUID() });
      setSelectedId(null);
      setNotice(t(action === 'ACCEPT_LIBRARY' ? 'actions.used_admin' : 'actions.kept_academy'));
      setState(await orpc.academyLibrarySync.updates({ academyId, courseId, nodeKey }));
      await Promise.all([
        client.invalidateQueries({ queryKey: ['academy', academyId, 'course', courseId] }),
        client.invalidateQueries({ queryKey: ['notifications', 'list'] }),
      ]);
      router.refresh();
    } catch (caught) { setError(caught); }
    finally { setBusy(false); }
  }

  return <PrivateImageContext.Provider value={resolveImage}><div className="flex flex-col gap-5">
    {visible.length > 0 ? <div className="flex items-start gap-2.5 rounded-card border border-draft/25 bg-draft-soft px-4 py-3">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-draft" />
      <div><p className="text-[14px] font-bold text-ink">{t('row.review')}</p><p className="mt-1 text-[13px] text-sub">{t('banner.preserved')}</p></div>
    </div> : <p className="text-[14px] text-sub">{t('empty.decisions')}</p>}
    {notice ? <p className="rounded-lg bg-success/10 px-4 py-3 text-[13.5px] font-semibold text-success" role="status">{notice}</p> : null}
    {error || detail.error ? <p className="text-[13.5px] font-semibold text-danger" role="alert">{errorText(error ?? detail.error)}</p> : null}
    {visible.length > 0 ? <ul className="flex flex-wrap gap-2" aria-label={t('page.parts')}>
      {visible.map(conflict => <li key={conflict.id}><button type="button" disabled={busy} aria-pressed={open?.groupId === conflict.groupId}
        className={`rounded-lg border px-3 py-2 text-left text-[13px] ${open?.groupId === conflict.groupId ? 'border-brand bg-brand-soft font-bold text-brand' : 'border-border bg-card text-ink hover:border-brand'}`}
        onClick={() => void show(conflict)}>
        {!nodeKey ? <span className="mr-2 font-semibold">{conflict.path.join(' › ') || t('fields.presence')}</span> : null}{field(conflict.unitKey)}
      </button></li>)}
    </ul> : null}
    {loading ? <p className="text-sm text-sub" role="status">{t('page.loading')}</p> : null}
    {open ? <section className="rounded-card border border-border bg-card p-4 sm:p-5" aria-label={field(open.unitKey)}>
      <h2 className="text-[17px] font-bold text-ink">{field(open.unitKey)}</h2>
      <p className="mt-1 text-[13px] text-sub">{t(`kind.${open.kind}`)}</p>
      {open.message ? <p className="mt-2 text-[13px] text-danger">{open.message}</p> : null}
      {GRADING_UNITS.test(open.unitKey) ? <p className="mt-2 text-[12.5px] text-sub">{t('consequence.grading')}</p> : null}
      {open.unitKey === 'mc.structure' || open.unitKey === 'sa.rule' ? <p className="mt-2 text-[12.5px] text-sub">{t('consequence.answer_key')}</p> : null}
      {open.unitKey === 'video.media' ? <p className="mt-2 text-[12.5px] text-sub">{t('consequence.media')}</p> : null}
      {open.dependents.length ? <div className="mt-2 text-[13px] text-danger"><p>{t('compare.dependents')}</p><ul>{open.dependents.map((path,index) => <li key={index}>{path.join(' › ')}</li>)}</ul></div> : null}
      {open.members.length ? <p className="mt-2 text-[13px] font-semibold text-sub">{t('compare.group')}</p> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Version label={t('compare.ours')} unitKey={open.unitKey} value={open.ours} previous={open.base} />
        <Version label={t('compare.theirs')} unitKey={open.unitKey} value={open.theirs} previous={open.base} />
      </div>
      {open.members.map(member => <div className="mt-4" key={member.unitKey}><h3 className="text-[14px] font-semibold text-ink">{field(member.unitKey)}</h3>
        <div className="mt-2 grid gap-4 lg:grid-cols-2"><Version label={t('compare.ours')} unitKey={member.unitKey} value={member.ours} previous={member.base} /><Version label={t('compare.theirs')} unitKey={member.unitKey} value={member.theirs} previous={member.base} /></div></div>)}
      <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-[13px] font-semibold text-sub">{t('compare.show_base')}</summary>
        <div className="mt-3"><Version label={t('compare.base')} unitKey={open.unitKey} value={open.base} /></div>
        {open.members.map(member => <div className="mt-3" key={member.unitKey}><p className="mb-2 text-[13px] font-semibold">{field(member.unitKey)}</p><Version label={t('compare.base')} unitKey={member.unitKey} value={member.base} /></div>)}
      </details>
      {canResolve ? <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">{open.actions.filter(action => action !== 'MANUAL').map(action => <Button disabled={busy || loading} key={action} type="button" variant={action === 'ACCEPT_LIBRARY' ? 'default' : 'outline'} onClick={() => void resolve(action)}>{busy ? t('actions.working') : t(`actions.${action}`)}</Button>)}</div> : null}
      <p className="mt-3 text-[12px] text-sub">{t(open.members.length ? 'compare.group_scope' : 'compare.scope')}</p>
    </section> : null}
  </div></PrivateImageContext.Provider>;
}

export function Version({
  label,
  value,
  unitKey,
  previous,
}: {
  label: string;
  value: SyncValue;
  unitKey: string;
  previous?: SyncValue;
}) {
  const { t } = useTranslation('library-sync');
  const object =
    value.value &&
    typeof value.value === 'object' &&
    !Array.isArray(value.value)
      ? (value.value as Record<string, unknown>)
      : null;
  const before = typeof previous?.value === 'string' ? previous.value : null;
  const diff =
    before !== null && typeof value.value === 'string' && before !== value.value
      ? changedLines(before, value.value, value.kind === 'html')
      : null;
  return (
    <div className="min-w-0 rounded-lg border border-border bg-canvas p-3">
      <p className="mb-2 text-[12.5px] font-bold uppercase tracking-wide text-sub">
        {label}
      </p>
      {value.caption ? (
        <p className="mb-1 text-[13px] font-semibold text-ink">
          {value.caption}
        </p>
      ) : null}
      {unitKey.startsWith('manual.file:') ||
      unitKey.startsWith('manual.solutionFile:') ? (
        <p className="mb-2 break-all font-mono text-[12px]">
          {unitKey.slice(unitKey.indexOf(':') + 1)}
        </p>
      ) : null}
      {value.kind === 'absent' ? (
        <p className="text-[13px] italic text-sub">{t('compare.absent')}</p>
      ) : value.kind === 'unknown' ? (
        <p className="text-[13px] italic text-sub">{t('compare.unknown')}</p>
      ) : value.kind === 'html' && typeof value.value === 'string' ? (
        <RichTextFrame
          content={value.value}
          minHeight={40}
          title={`${label}: ${unitKey}`}
        />
      ) : unitKey.startsWith('exercise.testCase:') && object ? (
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr>
              <th>{t('compare.field')}</th>
              <th>{t('compare.value')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(object).map(([key, item]) => (
              <tr className="border-t border-border align-top" key={key}>
                <th className="py-1 pr-2 font-semibold">
                  {t(`compare.case.${key}`, { defaultValue: key })}
                </th>
                <td className="py-1">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">
                    {typeof item === 'string' ? item : JSON.stringify(item)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : unitKey === 'mc.structure' &&
        object &&
        Array.isArray(object.options) ? (
        <div>
          <p className="mb-2 text-[12px] text-sub">
            {String(object.selectionMode ?? '')} · {t('compare.shuffle')}:{' '}
            {String(object.shuffleOptions ?? false)}
          </p>
          <ol className="space-y-2">
            {object.options.map((entry, index) => {
              const option: Record<string, unknown> =
                entry && typeof entry === 'object'
                  ? (entry as Record<string, unknown>)
                  : {
                      key: entry,
                      correct:
                        Array.isArray(object.correct) &&
                        object.correct.includes(entry),
                    };
              return (
                <li
                  className="rounded border border-border p-2 text-[13px]"
                  key={index}
                >
                  <p className="font-bold">
                    {t('compare.option', { number: index + 1 })}
                    {option.correct ? (
                      <span className="ml-2 text-brand">
                        <Check aria-hidden className="mr-1 inline size-3" />{t('compare.correct')}
                      </span>
                    ) : null}
                  </p>
                  {typeof option.content === 'string' ? (
                    <RichTextFrame
                      content={option.content}
                      minHeight={24}
                      title={`${label}: ${index + 1}`}
                    />
                  ) : (
                    <code className="break-all text-[11px] text-sub">
                      {String(option.key)}
                    </code>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (unitKey === 'pdf.file' || unitKey === 'video.media') && object ? (
        <article className="rounded border border-border p-3 text-[13px]">
          <p className="font-bold">
            {unitKey === 'pdf.file' ? 'PDF' : t('compare.video')}
          </p>
          <p className="break-all">
            {String(object.filename ?? object.assetId)}
          </p>
          {typeof object.previewUrl === 'string' ? <div className="mt-3">
            {unitKey === 'pdf.file' ? <iframe className="h-96 w-full rounded border border-border bg-white" src={object.previewUrl} title={`${label}: ${String(object.filename ?? 'PDF')}`} referrerPolicy="no-referrer" /> :
              <video controls preload="metadata" crossOrigin="anonymous" className="w-full rounded bg-black" src={object.previewUrl} aria-label={label}>
                {Array.isArray(object.captions) ? object.captions.map((caption, index) => {
                  const entry = caption as { language?: string; label?: string; path?: string };
                  const urls = object.captionUrls as Record<string,string> | undefined;
                  return <track key={index} kind="captions" label={entry.label} srcLang={entry.language} src={entry.path ? urls?.[entry.path] : undefined} />;
                }) : null}
              </video>}
            <a className="mt-2 inline-block font-semibold text-brand underline underline-offset-4" href={object.previewUrl} target="_blank" rel="noreferrer">{t('compare.open_media')}</a>
          </div> : <p className="mt-2 text-sub">{t('compare.preview_unavailable')}</p>}
          <dl className="mt-2 space-y-1 text-sub">
            {['bytes', 'pages', 'durationMs']
              .filter(
                (key) => object[key] !== null && object[key] !== undefined,
              )
              .map((key) => (
                <div key={key}>
                  <dt className="inline font-semibold">{key}: </dt>
                  <dd className="inline">{String(object[key])}</dd>
                </div>
              ))}
          </dl>
          {object.captions ? (
            <div className="mt-2">
              <p className="font-semibold">{t('compare.captions')}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px]">
                {JSON.stringify(object.captions, null, 2)}
              </pre>
            </div>
          ) : null}
        </article>
      ) : unitKey === 'video.instructions' && typeof object?.description === 'string' ? (
        <RichTextFrame content={object.description} minHeight={40} title={`${label}: ${t('fields.instructions')}`} />
      ) : value.kind === 'json' &&
        value.value &&
        typeof value.value === 'object' &&
        !Array.isArray(value.value) ? (
        <dl className="space-y-2 text-[12.5px] text-ink">
          {Object.entries(value.value).map(([key, item]) => (
            <div key={key}>
              <dt className="font-semibold text-sub">{key}</dt>
              <dd>
                {['question', 'problemDescription', 'explanation'].includes(
                  key,
                ) && typeof item === 'string' ? (
                  <RichTextFrame
                    content={item}
                    minHeight={24}
                    title={`${label}: ${key}`}
                  />
                ) : (
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">
                    {typeof item === 'string'
                      ? item
                      : JSON.stringify(item, null, 2)}
                  </pre>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : Array.isArray(value.value) ? (
        <ol className="list-inside list-decimal space-y-1 text-[13px] text-ink">
          {value.value.map((item, index) => (
            <li key={index}>
              {typeof item === 'string' ? item : JSON.stringify(item)}
            </li>
          ))}
        </ol>
      ) : (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[12.5px] text-ink">
          {typeof value.value === 'string'
            ? value.value
            : JSON.stringify(value.value, null, 2)}
        </pre>
      )}
      {diff ? (
        <details open className="mt-3 border-t border-border pt-2 text-[12px]">
          <summary className="cursor-pointer font-semibold text-sub">
            {t('compare.diff')}
          </summary>
          {diff.truncated ? (
            <p>{t('compare.diff_large')}</p>
          ) : (
            <div className="mt-2 overflow-auto font-mono whitespace-pre-wrap break-words">
              {diff.removed ? (
                <del className="block bg-danger/10 text-danger">
                  − {diff.removed}
                </del>
              ) : null}
              {!diff.removed && !diff.added ? (
                <p>{t('compare.formatting')}</p>
              ) : null}
              {diff.added ? (
                <ins className="block bg-brand-soft text-ink no-underline">
                  + {diff.added}
                </ins>
              ) : null}
            </div>
          )}
        </details>
      ) : null}
    </div>
  );
}

/** Linear bounded changed region: never an unbounded quadratic diff over test/code bodies. */
export function changedLines(before: string, after: string, html = false) {
  if (before.length + after.length > 131_072)
    return { removed: '', added: '', truncated: true };
  const text = (value: string) =>
    html
      ? value
          .replace(/<[^>]*>/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .trim()
      : value;
  const left = text(before).split('\n'),
    right = text(after).split('\n');
  let start = 0;
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  )
    start++;
  let endLeft = left.length,
    endRight = right.length;
  while (
    endLeft > start &&
    endRight > start &&
    left[endLeft - 1] === right[endRight - 1]
  ) {
    endLeft--;
    endRight--;
  }
  return {
    removed: left.slice(start, endLeft).join('\n'),
    added: right.slice(start, endRight).join('\n'),
    truncated: false,
  };
}
