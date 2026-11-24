'use client';

import { formatPoints, type ExamResults } from '@cove/shared';
import { Code2, Download, Search, Settings2, Timer, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { formatClock, formatDuration } from '@/components/exam/exam-format';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { Dialog } from '@/components/exam/exam-dialog';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

type Student = ExamResults['students'][number];
type Release = 'hidden' | 'now' | 'at';

/**
 * One class's results for one test (Elice elice/23–24): the period and
 * result release, three tiles, the per-problem table and the per-student
 * grid with 응시 종료 and 재응시 허용.
 */
export function TestResults({ academyId, initial, canManageContent }: { academyId: string; initial: ExamResults; canManageContent: boolean }) {
  const { t } = useTranslation('exam');
  const slug = useAcademySlug();
  const errorText = useErrorText();
  const [results, setResults] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<'name' | 'score'>('name');
  const target = { academyId, classId: results.classId, lectureId: results.lectureId };

  // Refreshed every 30 s only while someone is sitting the test (AGENTS.md rule 7).
  const live = results.tiles.inProgress > 0;
  React.useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void orpc.exam.results(target).then(setResults, () => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, results.classId, results.lectureId]);

  const act = async (action: () => Promise<ExamResults>) => {
    setError(null);
    try { setResults(await action()); return true; } catch (caught) { setError(errorText(caught)); return false; }
  };

  const exportCsv = async () => {
    const { filename, csv } = await orpc.exam.exportResults(target);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const students = results.students
    .filter((student) => !query.trim() || `${student.name} ${student.username ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'score' ? (b.earnedHundredths ?? -1) - (a.earnedHundredths ?? -1) : a.name.localeCompare(b.name));

  return (
    <div className="space-y-6 px-4 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sub">{formatDuration(t, results.settings.timeLimitMinutes)} · {t('results.problem_count', { count: results.items.length })} · {t('points_value', { points: formatPoints(results.totalPointsHundredths) })}</span>
        <span className="flex-1" />
        {canManageContent ? (
          <Link href={routes.academyContentTest(slug, results.courseId, results.lectureId)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-surface">
            <Settings2 aria-hidden className="size-4" /> {t('results.open_test_settings')}
          </Link>
        ) : null}
        <button type="button" onClick={() => void exportCsv()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-bold text-on-brand hover:bg-brand-deep">
          <Download aria-hidden className="size-4" /> {t('results.export')}
        </button>
      </div>

      <ScheduleCard results={results} onSave={(schedule) => act(() => orpc.exam.updateSchedule({ ...target, schedule }))} />
      {error ? <p role="alert" className="text-[13px] font-semibold text-danger">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={TrendingUp} label={t('results.avg_score')} value={results.tiles.averageHundredths == null ? '—' : t('points_value', { points: formatPoints(results.tiles.averageHundredths) })} />
        <Tile icon={Users} label={t('results.submitted_taken')} value={t('results.users', { submitted: results.tiles.submitted, taken: results.tiles.taken })} />
        <Tile icon={Timer} label={t('results.in_progress')} value={String(results.tiles.inProgress)} />
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[12.5px] font-semibold text-sub">
              <th className="px-5 py-3">{t('results.problem')}</th>
              <th className="px-3 py-3">{t('results.type')}</th>
              <th className="px-3 py-3 text-right">{t('results.points')}</th>
              <th className="px-3 py-3 text-right">{t('results.avg')}</th>
              <th className="px-3 py-3 text-right">{t('results.full_rate')}</th>
              <th className="px-3 py-3 text-right">{t('results.avg_submissions')}</th>
              <th className="px-5 py-3 text-right">{t('results.avg_runs')}</th>
            </tr>
          </thead>
          <tbody>
            {results.items.map((item) => (
              <tr key={item.materialId} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-semibold">{item.position + 1}. {item.title}</td>
                <td className="px-3 py-3 text-sub">{t(`results.types.${item.type}`)}</td>
                <td className="px-3 py-3 text-right">{formatPoints(item.pointsHundredths)}</td>
                <td className="px-3 py-3 text-right">{item.averageHundredths == null ? '—' : formatPoints(Math.round(item.averageHundredths))}</td>
                <td className="px-3 py-3 text-right">{item.fullScoreRate == null ? '—' : `${Math.round(item.fullScoreRate * 100)}%`}</td>
                <td className="px-3 py-3 text-right">{item.averageSubmissions == null ? '—' : item.averageSubmissions.toFixed(1)}</td>
                <td className="px-5 py-3 text-right">{item.averageRuns == null ? '—' : item.averageRuns.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-bold">{t('results.students')}</h2>
          <label className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border px-3">
            <Search aria-hidden className="size-4 text-sub" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('results.search')} aria-label={t('results.search')}
              className="w-44 bg-transparent text-[13px] outline-none" />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value as 'name' | 'score')} aria-label={t('results.sort_name')}
            className="h-9 rounded-lg border border-border bg-card px-2 text-[13px]">
            <option value="name">{t('results.sort_name')}</option>
            <option value="score">{t('results.sort_score')}</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] font-semibold text-sub">
                <th className="sticky left-0 z-10 bg-card px-5 py-3">{t('results.name')}</th>
                <th className="px-3 py-3">{t('results.state')}</th>
                <th className="px-3 py-3 text-right">{t('results.total')}</th>
                {results.items.map((item) => (
                  <th key={item.materialId} title={item.title} className="whitespace-nowrap px-3 py-3 text-center">
                    {item.type === 'CODE' ? <Code2 aria-hidden className="mr-1 inline size-3.5" /> : null}{item.position + 1}
                  </th>
                ))}
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <StudentRow key={student.userId} student={student} results={results} slug={slug}
                  onEnd={() => act(() => orpc.exam.endAttempt({ ...target, userId: student.userId }))}
                  onRetake={() => act(() => orpc.exam.grantRetake({ ...target, userId: student.userId }))} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5">
      <Icon aria-hidden className="size-7 shrink-0 text-ink" />
      <span className="flex-1 text-[14px] font-semibold text-ink">{label}</span>
      <span className="text-[20px] font-bold text-brand">{value}</span>
    </div>
  );
}

function StudentRow({ student, results, slug, onEnd, onRetake }: {
  student: Student; results: ExamResults; slug: string; onEnd: () => Promise<boolean>; onRetake: () => Promise<boolean>;
}) {
  const { t } = useTranslation('exam');
  // Cove's own dialog, not the browser's: it matches the app and stays inside a fullscreen page.
  const [confirming, setConfirming] = React.useState<'end' | 'retake' | null>(null);
  const [busy, setBusy] = React.useState(false);
  const confirm = async () => {
    setBusy(true);
    await (confirming === 'end' ? onEnd() : onRetake());
    setBusy(false);
    setConfirming(null);
  };
  // As of the last read; the grid refreshes every 30 s while anyone is sitting the test.
  const now = new Date(results.serverNow).getTime();
  const status = student.status === 'NOT_STARTED' ? t('results.state_not_started')
    : student.status === 'IN_PROGRESS'
      ? `${t('results.state_in_progress')}${student.deadlineAt ? ` · ${t('results.time_left', { time: formatClock(new Date(student.deadlineAt).getTime() - now) })}` : ''}`
      : `${t('results.state_ended')}${student.endReason ? ` · ${t(`results.reason.${student.endReason}`)}` : ''}`;
  const tone = student.status === 'IN_PROGRESS' ? 'text-brand' : student.status === 'ENDED' ? 'text-ink' : 'text-sub';
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface/60">
      <td className="sticky left-0 z-10 bg-card px-5 py-3 font-semibold">
        <div className="max-w-[180px] truncate">{student.name}</div>
        {student.username ? <div className="text-[11.5px] font-normal text-sub">{student.username}</div> : null}
      </td>
      <td className={`whitespace-nowrap px-3 py-3 text-[12.5px] font-semibold ${tone}`}>{status}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-bold" title={student.pending ? t('results.grading') : undefined}>
        {student.earnedHundredths == null ? '—' : student.pending ? <span className="text-warning">{t('results.grading')}</span> : formatPoints(student.earnedHundredths)}
      </td>
      {student.cells.map((cell) => {
        const href = !cell.submissionId ? null : cell.manual
          ? routes.academyTeachManual(slug, results.classId, cell.materialId)
          : routes.academyTeachSubmission(slug, results.classId, student.membershipId, cell.submissionId);
        const text = !cell.submitted ? (student.status === 'NOT_STARTED' ? '' : '·')
          : cell.scoreHundredths == null ? '—' : formatPoints(cell.scoreHundredths);
        return (
          <td key={cell.materialId} className="whitespace-nowrap px-3 py-3 text-center"
            title={[cell.submitted ? t('results.cell_submissions', { count: cell.submissionCount }) : t('results.not_submitted'),
              results.items.find((row) => row.materialId === cell.materialId)?.type === 'CODE' ? t('results.cell_runs', { count: cell.runCount }) : null]
              .filter(Boolean).join(' · ')}>
            {href ? <Link href={href} className="font-semibold text-brand hover:underline">{text}</Link> : <span className="text-sub">{text}</span>}
          </td>
        );
      })}
      <td className="whitespace-nowrap px-5 py-3 text-right">
        {student.status === 'IN_PROGRESS' ? (
          <button type="button" onClick={() => setConfirming('end')}
            className="rounded-md border border-danger/40 px-2.5 py-1 text-[12px] font-semibold text-danger hover:bg-danger/10">{t('results.end_attempt')}</button>
        ) : student.status === 'ENDED' ? (
          student.retakeGranted ? <span className="text-[12px] font-semibold text-success">{t('results.retake_granted')}</span> : (
            <button type="button" onClick={() => setConfirming('retake')}
              className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-surface">{t('results.grant_retake')}</button>
          )
        ) : null}
      </td>
      {confirming ? (
        <td className="p-0">
          <Dialog title={confirming === 'end' ? t('results.end_attempt') : t('results.grant_retake')} onClose={() => setConfirming(null)} footer={
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="h-10 rounded-lg border border-border px-4 text-[14px] font-semibold hover:bg-surface">{t('authoring.cancel')}</button>
              <button type="button" disabled={busy} onClick={() => void confirm()}
                className={`h-10 rounded-lg px-5 text-[14px] font-bold disabled:opacity-40 ${confirming === 'end' ? 'bg-danger text-on-danger' : 'bg-brand text-on-brand hover:bg-brand-deep'}`}>
                {confirming === 'end' ? t('results.end_attempt') : t('results.grant_retake')}
              </button>
            </div>
          }>
            <p className="text-[14px] text-ink">{t(confirming === 'end' ? 'results.end_attempt_confirm' : 'results.grant_retake_confirm', { name: student.name })}</p>
          </Dialog>
        </td>
      ) : null}
    </tr>
  );
}

function toLocalInput(value: Date | string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ScheduleCard({ results, onSave }: { results: ExamResults; onSave: (schedule: ExamResults['schedule']) => Promise<boolean> }) {
  const { t } = useTranslation('exam');
  const { schedule } = results;
  const [always, setAlways] = React.useState(!schedule.opensAt && !schedule.closesAt);
  const [opensAt, setOpensAt] = React.useState(toLocalInput(schedule.opensAt));
  const [closesAt, setClosesAt] = React.useState(toLocalInput(schedule.closesAt));
  const released = schedule.resultsReleasedAt ? new Date(schedule.resultsReleasedAt) : null;
  const [release, setRelease] = React.useState<Release>(!released ? 'hidden' : released.getTime() <= new Date(results.serverNow).getTime() ? 'now' : 'at');
  const [releaseAt, setReleaseAt] = React.useState(toLocalInput(schedule.resultsReleasedAt));
  const [entryClosesAt, setEntryClosesAt] = React.useState(toLocalInput(schedule.entryClosesAt));
  const [exitOpensAt, setExitOpensAt] = React.useState(toLocalInput(schedule.exitOpensAt));
  const [saved, setSaved] = React.useState(false);
  const invalid = !always && Boolean(opensAt && closesAt && new Date(opensAt) >= new Date(closesAt));
  // Both times must fall inside the period, as the server also checks.
  const outside = (value: string) => Boolean(value) && !always && (
    (opensAt !== '' && new Date(value) < new Date(opensAt)) || (closesAt !== '' && new Date(value) > new Date(closesAt)));
  const entryInvalid = outside(entryClosesAt);
  const exitInvalid = outside(exitOpensAt);
  const save = async () => {
    setSaved(false);
    const ok = await onSave({
      opensAt: always || !opensAt ? null : new Date(opensAt),
      closesAt: always || !closesAt ? null : new Date(closesAt),
      entryClosesAt: entryClosesAt ? new Date(entryClosesAt) : null,
      exitOpensAt: exitOpensAt ? new Date(exitOpensAt) : null,
      resultsReleasedAt: release === 'hidden' ? null : release === 'now' ? (released && release === 'now' && released <= new Date() ? released : new Date()) : releaseAt ? new Date(releaseAt) : null,
    });
    setSaved(ok);
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[15px] font-bold">{t('results.schedule')}</h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <fieldset>
          <legend className="text-[13px] font-semibold text-sub">{t('period')}</legend>
          <label className="mt-2 flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={always} onChange={(event) => setAlways(event.target.checked)} />
            {t('results.always')}
          </label>
          {!always ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-[12px] text-sub">{t('results.opens_at')}
                <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-2 text-[13px] text-ink" />
              </label>
              <label className="text-[12px] text-sub">{t('results.closes_at')}
                <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} aria-invalid={invalid}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-2 text-[13px] text-ink aria-[invalid=true]:border-danger" />
              </label>
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-[12px] text-sub">{t('results.entry_closes_at')}
              <input type="datetime-local" value={entryClosesAt} onChange={(event) => setEntryClosesAt(event.target.value)} aria-invalid={entryInvalid}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-2 text-[13px] text-ink aria-[invalid=true]:border-danger" />
              <span className="mt-1 block text-[11.5px]">{t('results.entry_closes_help')}</span>
            </label>
            <label className="text-[12px] text-sub">{t('results.exit_opens_at')}
              <input type="datetime-local" value={exitOpensAt} onChange={(event) => setExitOpensAt(event.target.value)} aria-invalid={exitInvalid}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-2 text-[13px] text-ink aria-[invalid=true]:border-danger" />
              <span className="mt-1 block text-[11.5px]">{t('results.exit_opens_help')}</span>
            </label>
          </div>
          {entryInvalid || exitInvalid ? <p role="alert" className="mt-1 text-[12px] font-semibold text-danger">{t('results.timing_outside')}</p> : null}
        </fieldset>
        <fieldset>
          <legend className="text-[13px] font-semibold text-sub">{t('results.release')}</legend>
          {results.settings.showScoreOnFinish ? (
            <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-[12.5px] font-semibold text-success">{t('results.release_auto')}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-4 text-[13.5px]">
            {(['hidden', 'now', 'at'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="release" className="size-4 accent-[var(--brand)]" checked={release === value} onChange={() => setRelease(value)} />
                {t(value === 'hidden' ? 'results.release_hidden' : value === 'now' ? 'results.release_now' : 'results.release_at')}
              </label>
            ))}
          </div>
          {release === 'at' ? (
            <input type="datetime-local" value={releaseAt} onChange={(event) => setReleaseAt(event.target.value)} aria-label={t('results.release_at')}
              className="mt-2 h-10 rounded-lg border border-border bg-card px-2 text-[13px]" />
          ) : null}
        </fieldset>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {saved ? <span role="status" className="text-[13px] font-semibold text-success">{t('results.saved')}</span> : null}
        <button type="button" onClick={() => void save()} disabled={invalid || entryInvalid || exitInvalid || (release === 'at' && !releaseAt)}
          className="h-10 rounded-lg bg-brand px-5 text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:opacity-40">{t('results.save')}</button>
      </div>
    </section>
  );
}
