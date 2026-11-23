'use client';

import {
  examDefaultRules,
  formatPoints,
  type ExamSettings,
  type ExamStaffTest,
  type TestType,
} from '@cove/shared';
import {
  ArrowDown, ArrowUp, BadgeCheck, BookOpen, CalendarClock, ChevronDown, ClipboardList, Code2, Download, FileQuestion, Hourglass,
  Lightbulb, ListChecks, PenLine, RefreshCcw, ShieldCheck, Timer, TriangleAlert, Undo2,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog } from '@/components/exam/exam-dialog';
import { formatDuration } from '@/components/exam/exam-format';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { Switch } from '@/components/studio/switch';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

type Tab = 'guide' | 'settings' | 'problems';

/**
 * A test, for its authors (Elice elice/01–07): chips, title, time limit and
 * problem count, the summary rows, 공개/비공개 and 수정하기, then the tabs
 * 테스트 안내 · 설정 · 문제.
 */
export function TestAuthoringPage({ academyId, initial }: { academyId: string; initial: ExamStaffTest }) {
  const { t } = useTranslation('exam');
  const slug = useAcademySlug();
  const errorText = useErrorText();
  const [test, setTest] = React.useState(initial);
  const [tab, setTab] = React.useState<Tab>('settings');
  const [editing, setEditing] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const target = { academyId, courseId: test.courseId, lectureId: test.lectureId };

  const update = async (patch: Partial<Parameters<typeof orpc.exam.updateTest>[0]>) => {
    setBusy(true);
    setNotice(null);
    try {
      setTest(await orpc.exam.updateTest({ ...target, ...patch }));
      setNotice({ tone: 'ok', text: t('authoring.saved') });
      return true;
    } catch (caught) {
      setNotice({ tone: 'error', text: errorText(caught) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Reordered with the course builder's own operation, then the test is read again.
  const reorder = async (orderedMaterialIds: string[]) => {
    setBusy(true);
    setNotice(null);
    try {
      await orpc.academyCourses.reorderExercises({ ...target, orderedMaterialIds });
      setTest(await orpc.exam.staffTest(target));
    } catch (caught) {
      setNotice({ tone: 'error', text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const gradable = test.items.filter((item) => item.type);
  const yesNo = (value: boolean) => (value ? t('authoring.rows.yes') : t('authoring.rows.no'));

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pb-16 sm:px-6">
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${test.isVisible ? 'bg-brand-soft text-brand' : 'bg-surface text-sub'}`}>
            {test.isVisible ? t('authoring.published') : t('authoring.draft')}
          </span>
          {test.settings.testType !== 'NONE' ? (
            <span className="rounded bg-surface px-2 py-0.5 text-[12px] font-semibold text-sub">{t(`authoring.types.${test.settings.testType}`)}</span>
          ) : null}
        </div>
        <BadgeCheck aria-label={t('badge')} className="mt-3 size-7 text-brand" />
        <h1 className="mt-2 text-[26px] font-bold text-ink">{test.title}</h1>
        {test.settings.summary ? <p className="mt-1 text-[14px] text-sub">{test.settings.summary}</p> : null}

        <dl className="mt-6 flex gap-10">
          <div>
            <Timer aria-hidden className="size-5 text-sub" />
            <dt className="mt-1 text-[12px] font-semibold text-sub">{t('time_limit')}</dt>
            <dd className="mt-0.5 text-[17px] font-semibold text-ink">{formatDuration(t, test.settings.timeLimitMinutes)}</dd>
          </div>
          <div>
            <ShieldCheck aria-hidden className="size-5 text-sub" />
            <dt className="mt-1 text-[12px] font-semibold text-sub">{t('problem_count')}</dt>
            <dd className="mt-0.5 text-[17px] font-semibold text-ink">{t('problem_count_value', { count: gradable.length })}</dd>
          </div>
        </dl>

        <dl className="mt-6 grid gap-3 border-t border-border pt-6 text-[14px] sm:grid-cols-[230px_1fr]">
          <dt className="text-sub">{t('authoring.rows.period')}</dt>
          <dd className="text-ink">{t('authoring.rows.period_value')}</dd>
          <dt className="text-sub">{t('authoring.rows.results')}</dt>
          <dd className="text-ink">{test.settings.showScoreOnFinish ? t('authoring.rows.results_auto') : t('authoring.rows.results_value')}</dd>
          <dt className="text-sub">{t('authoring.rows.review')}</dt>
          <dd className="text-ink">{yesNo(test.settings.reviewAfterEnd)}</dd>
          <dt className="text-sub">{t('authoring.rows.retake')}</dt>
          <dd className="text-ink">{yesNo(test.settings.allowSelfRetake)}</dd>
          <dt className="text-sub">{t('authoring.rows.reference')}</dt>
          <dd className="text-ink">{yesNo(test.settings.languageReference)}</dd>
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <PublishMenu isVisible={test.isVisible} busy={busy} onChange={(isVisible) => void update({ isVisible })} />
          <button type="button" onClick={() => setEditing(true)}
            className="h-12 rounded-lg border border-brand px-8 text-[15px] font-bold text-brand hover:bg-brand-soft">
            {t('authoring.edit')}
          </button>
        </div>
        {notice ? (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-4 text-[13px] font-semibold ${notice.tone === 'error' ? 'text-danger' : 'text-success'}`}>{notice.text}</p>
        ) : null}
      </section>

      <ClassResults test={test} slug={slug} academyId={academyId} />

      <div role="tablist" className="mt-8 flex gap-1 border-b border-border">
        {(['guide', 'settings', 'problems'] as const).map((key) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-5 py-3 text-[14px] font-semibold transition-colors ${tab === key ? 'border-brand text-brand' : 'border-transparent text-sub hover:text-ink'}`}>
            {t(`authoring.tabs.${key}`)}
          </button>
        ))}
      </div>

      <section className="rounded-b-2xl border border-t-0 border-border bg-card p-6 sm:p-8">
        {tab === 'guide' ? <GuideTab test={test} busy={busy} onSave={(guide) => update({ settings: { guide } })} />
          : tab === 'settings' ? <SettingsTab test={test} busy={busy} onSave={(settings) => update({ settings })} />
            : <ProblemsTab key={test.items.map((item) => `${item.materialId}:${item.pointsHundredths}`).join(',')} test={test} busy={busy} academySlug={slug}
              onSave={(points) => update({ points })} onReorder={reorder} />}
      </section>

      {editing ? (
        <EditDialog test={test} busy={busy} onClose={() => setEditing(false)}
          onSave={async (patch) => { if (await update(patch)) setEditing(false); }} />
      ) : null}
    </div>
  );
}

function PublishMenu({ isVisible, busy, onChange }: { isVisible: boolean; busy: boolean; onChange: (next: boolean) => void }) {
  const { t } = useTranslation('exam');
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={busy} onClick={() => setOpen((value) => !value)} aria-expanded={open}
        className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 text-[15px] font-bold text-on-brand hover:bg-brand-deep disabled:opacity-50">
        {isVisible ? t('authoring.unpublish') : t('authoring.publish')} <ChevronDown aria-hidden className="size-4" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-modal">
          {[true, false].map((value) => (
            <button key={String(value)} type="button" onClick={() => { setOpen(false); if (value !== isVisible) onChange(value); }}
              className={`block w-full px-4 py-2.5 text-left text-[14px] hover:bg-surface ${value === isVisible ? 'font-bold text-brand' : 'text-ink'}`}>
              {value ? t('authoring.published') : t('authoring.draft')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditDialog({ test, busy, onClose, onSave }: {
  test: ExamStaffTest; busy: boolean; onClose: () => void;
  onSave: (patch: { title: string; settings: Partial<ExamSettings> }) => Promise<void>;
}) {
  const { t } = useTranslation('exam');
  const [title, setTitle] = React.useState(test.title);
  const [summary, setSummary] = React.useState(test.settings.summary);
  const [testType, setTestType] = React.useState<TestType>(test.settings.testType);
  return (
    <Dialog title={t('authoring.edit_title')} onClose={onClose} footer={
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-[14px] font-semibold hover:bg-surface">{t('authoring.cancel')}</button>
        <button type="button" disabled={busy || !title.trim()} onClick={() => void onSave({ title, settings: { summary, testType } })}
          className="h-10 rounded-lg bg-brand px-5 text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:opacity-40">{t('authoring.save')}</button>
      </div>
    }>
      <label className="block text-[13px] font-semibold text-ink">{t('authoring.title_label')} *
        <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] font-normal outline-none focus:border-brand" />
      </label>
      <label className="mt-4 block text-[13px] font-semibold text-ink">{t('authoring.summary_label')}
        <textarea value={summary} maxLength={200} onChange={(event) => setSummary(event.target.value)}
          className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[14px] font-normal outline-none focus:border-brand" />
      </label>
      <label className="mt-4 block text-[13px] font-semibold text-ink">{t('authoring.test_type')}
        <select value={testType} onChange={(event) => setTestType(event.target.value as TestType)}
          className="mt-1.5 h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] font-normal outline-none focus:border-brand">
          {(['NONE', 'DIAGNOSTIC', 'FORMATIVE', 'SUMMATIVE'] as const).map((value) => (
            <option key={value} value={value}>{t(`authoring.types.${value}`)}</option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}

function GuideTab({ test, busy, onSave }: { test: ExamStaffTest; busy: boolean; onSave: (guide: string) => Promise<boolean> }) {
  const { t, i18n } = useTranslation('exam');
  const [guide, setGuide] = React.useState(test.settings.guide);
  const defaults = i18n.language.startsWith('ko') ? examDefaultRules.ko : examDefaultRules.en;
  return (
    <div>
      <p className="text-[13px] text-sub">{t('authoring.guide_hint')}</p>
      <textarea value={guide} onChange={(event) => setGuide(event.target.value)} placeholder={defaults.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}
        aria-label={t('authoring.tabs.guide')}
        className="mt-4 h-64 w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 text-[14px] leading-7 outline-none focus:border-brand" />
      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <button type="button" onClick={() => setGuide('')} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-[13px] font-semibold hover:bg-surface">
          <Undo2 aria-hidden className="size-4" /> {t('authoring.guide_default')}
        </button>
        <SaveButton busy={busy} disabled={guide === test.settings.guide} onClick={() => void onSave(guide)} />
      </div>
    </div>
  );
}

function SaveButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  const { t } = useTranslation('exam');
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled}
      className="h-11 min-w-[116px] rounded-lg bg-brand px-6 text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:opacity-40">
      {t('authoring.save')}
    </button>
  );
}

function SettingRow({ icon: Icon, title, help, checked, onChange, disabled = false, children }: {
  icon: typeof Timer; title: string; help: string; checked: boolean; onChange?: (next: boolean) => void;
  disabled?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 px-3 py-4 ${disabled ? 'rounded-lg bg-surface opacity-70' : ''}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink"><Icon aria-hidden className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
          {title}
        </div>
        <p className="mt-0.5 text-[12.5px] text-sub">{help}</p>
        {children}
      </div>
      <Switch checked={checked} disabled={disabled} label={title} onCheckedChange={(next) => onChange?.(next)} />
    </div>
  );
}

function SettingsTab({ test, busy, onSave }: { test: ExamStaffTest; busy: boolean; onSave: (settings: Partial<ExamSettings>) => Promise<boolean> }) {
  const { t } = useTranslation('exam');
  const [draft, setDraft] = React.useState(test.settings);
  const [minutes, setMinutes] = React.useState(String(test.settings.timeLimitMinutes ?? 60));
  const limitOn = draft.timeLimitMinutes != null;
  const parsedMinutes = Number(minutes);
  const minutesValid = !limitOn || (Number.isInteger(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= 600);
  const next: ExamSettings = { ...draft, timeLimitMinutes: limitOn ? parsedMinutes : null };
  const changed = JSON.stringify(next) !== JSON.stringify(test.settings);
  const set = (patch: Partial<ExamSettings>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <div className="divide-y divide-border">
      <SettingRow icon={ClipboardList} title={t('authoring.settings.preparation')} help={t('authoring.settings.preparation_help')}
        checked={draft.usePreparation} onChange={(usePreparation) => set({ usePreparation })} />
      <SettingRow icon={Hourglass} title={t('authoring.settings.time_limit')} help={t('authoring.settings.time_limit_help')}
        checked={limitOn} onChange={(on) => set({ timeLimitMinutes: on ? Number(minutes) || 60 : null })}>
        {limitOn ? (
          <label className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3">
            <input type="number" min={1} max={600} value={minutes} onChange={(event) => setMinutes(event.target.value)}
              aria-label={t('authoring.settings.time_limit')} aria-invalid={!minutesValid}
              className="h-10 w-24 bg-transparent text-[14px] outline-none" />
            <span className="text-[13px] text-sub">{t('authoring.settings.minutes')}</span>
          </label>
        ) : null}
      </SettingRow>
      <SettingRow icon={CalendarClock} title={t('authoring.settings.show_score')} help={t('authoring.settings.show_score_help')}
        checked={draft.showScoreOnFinish} onChange={(showScoreOnFinish) => set({ showScoreOnFinish })} />
      <SettingRow icon={ListChecks} title={t('authoring.settings.review')} help={t('authoring.settings.review_help')}
        checked={draft.reviewAfterEnd} onChange={(reviewAfterEnd) => set({ reviewAfterEnd })} />
      <SettingRow icon={RefreshCcw} title={t('authoring.settings.retake')} help={t('authoring.settings.retake_help')}
        checked={draft.allowSelfRetake} onChange={(allowSelfRetake) => set({ allowSelfRetake })} />
      <SettingRow icon={Lightbulb} title={t('authoring.settings.explanations')} help={t('authoring.settings.explanations_help')}
        checked={draft.showExplanations} disabled={!draft.reviewAfterEnd} onChange={(showExplanations) => set({ showExplanations })} />
      <SettingRow icon={BookOpen} title={t('authoring.settings.reference')} help={t('authoring.settings.reference_help')}
        checked={draft.languageReference} onChange={(languageReference) => set({ languageReference })} />
      <p className="px-3 py-4 text-[12.5px] text-sub">{t('authoring.settings.timing_per_class')}</p>
      <div className="pt-6">
        <SaveButton busy={busy} disabled={!changed || !minutesValid} onClick={() => void onSave(next)} />
      </div>
    </div>
  );
}

function ProblemsTab({ test, busy, academySlug, onSave, onReorder }: {
  test: ExamStaffTest; busy: boolean; academySlug: string; onSave: (points: Record<string, number>) => Promise<boolean>;
  onReorder: (orderedMaterialIds: string[]) => Promise<void>;
}) {
  const { t } = useTranslation('exam');
  const initial = React.useMemo(() => Object.fromEntries(test.items.map((item) => [item.materialId, formatPoints(item.pointsHundredths)])), [test.items]);
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const parsed = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, Math.round(Number(value) * 100)]));
  const valid = Object.values(parsed).every((value) => Number.isFinite(value) && value >= 0 && value <= 100_000);
  const total = test.items.filter((item) => item.type).reduce((sum, item) => sum + (parsed[item.materialId] ?? 0), 0);
  const changed = test.items.some((item) => parsed[item.materialId] !== item.pointsHundredths);
  if (!test.items.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-[14px] text-sub">{t('authoring.problems.empty')}</p>
        <Link href={routes.academyLearnCourse(academySlug, test.courseId)} className="mt-4 inline-block text-[14px] font-semibold text-brand">{t('authoring.problems.add_problem')} →</Link>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-sub">{t('authoring.problems.reorder_hint')}</p>
        <Link href={routes.academyLearnCourse(academySlug, test.courseId)} className="text-[13px] font-semibold text-brand">{t('authoring.problems.add_problem')} →</Link>
      </div>
      {test.locked ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-[12.5px] font-semibold text-sub">
          <TriangleAlert aria-hidden className="size-4 text-warning" /> {t('authoring.problems.locked')}
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {test.items.map((item, index) => {
          const move = (by: number) => {
            const ids = test.items.map((row) => row.materialId);
            [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!];
            void onReorder(ids);
          };
          const Icon = item.type === 'CODE' ? Code2 : item.type === 'SHORT_ANSWER' ? PenLine : FileQuestion;
          const editorHref = item.materialType === 'PROGRAMMING_EXERCISE'
            ? `${routes.academyCourse(academySlug, test.courseId)}/lectures/${test.lectureId}/exercises/${item.materialId}`
            : routes.academyLearnCourse(academySlug, test.courseId);
          return (
            <li key={item.materialId} className="flex items-center gap-3 py-2.5">
              <span className="flex shrink-0 flex-col">
                <button type="button" disabled={busy || index === 0} onClick={() => move(-1)} aria-label={t('authoring.problems.move_up', { title: item.title })}
                  className="grid size-5 place-items-center rounded text-sub hover:bg-surface hover:text-ink disabled:opacity-30"><ArrowUp aria-hidden className="size-3.5" /></button>
                <button type="button" disabled={busy || index === test.items.length - 1} onClick={() => move(1)} aria-label={t('authoring.problems.move_down', { title: item.title })}
                  className="grid size-5 place-items-center rounded text-sub hover:bg-surface hover:text-ink disabled:opacity-30"><ArrowDown aria-hidden className="size-3.5" /></button>
              </span>
              <span className="w-5 shrink-0 text-right text-[13px] font-bold text-sub">{index + 1}</span>
              <Icon aria-hidden className="size-4 shrink-0 text-sub" />
              <Link href={editorHref} className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink hover:text-brand">{item.title}</Link>
              {!item.type ? <span className="text-[12px] font-semibold text-danger">{t('authoring.problems.invalid')}</span> : (
                <label className="flex items-center gap-2">
                  <input type="number" min={0} step={0.5} value={values[item.materialId] ?? ''} disabled={test.locked}
                    aria-label={`${item.title} ${t('authoring.problems.points')}`}
                    onChange={(event) => setValues((current) => ({ ...current, [item.materialId]: event.target.value }))}
                    className="h-10 w-20 rounded-lg border border-border bg-surface px-2 text-right text-[14px] outline-none focus:border-brand disabled:text-sub" />
                  <span className="text-[13px] text-sub">{t('authoring.problems.points')}</span>
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-b border-border py-4 text-[13px]">
        <span className="font-bold text-ink">{t('authoring.problems.total')}</span>
        <span className="text-sub">{t('authoring.problems.total_hint')}</span>
        <span className="ml-auto text-[16px] font-bold text-brand">{t('points_value', { points: formatPoints(total) })}</span>
        {total !== 10_000 ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">{t('authoring.problems.not_100')}</span> : null}
      </div>
      {test.locked ? null : (
        <div className="pt-6"><SaveButton busy={busy} disabled={!changed || !valid} onClick={() => void onSave(parsed)} /></div>
      )}
    </div>
  );
}

/**
 * Where a manager or team lead reads how a test went: results live per class
 * (each class sits it on its own period), so every class that learns the
 * course is listed with who took it, who finished and who is still in it.
 */
function ClassResults({ test, slug, academyId }: { test: ExamStaffTest; slug: string; academyId: string }) {
  const { t } = useTranslation('exam');
  const errorText = useErrorText();
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const { filename, csv } = await orpc.exam.exportCourseReport({ academyId, courseId: test.courseId, lectureId: test.lectureId });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[16px] font-bold text-ink">{t('authoring.results_link')}</h2>
        {test.classes.length ? (
          <button type="button" disabled={downloading} onClick={() => void download()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-surface disabled:opacity-50">
            <Download aria-hidden className="size-4" /> {t('authoring.course_report')}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">{error}</p> : null}
      <p className="mt-1 text-[13px] text-sub">{t('authoring.results_hint')}</p>
      {test.classes.length ? (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {test.classes.map((row) => (
            <li key={row.classId}>
              <Link href={routes.academyTeachClassTest(slug, row.classId, test.lectureId)}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{row.name}</span>
                <span className="text-[12.5px] text-sub">{t('results.taken', { count: row.taken })}</span>
                <span className="text-[12.5px] font-semibold text-success">{t('authoring.results_ended', { count: row.ended })}</span>
                {row.inProgress ? <span className="text-[12.5px] font-semibold text-brand">{t('results.in_progress_count', { count: row.inProgress })}</span> : null}
                <span className="text-[13px] font-semibold text-brand">{t('authoring.results_open')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-sub">{t('authoring.results_no_classes')}</p>
      )}
    </section>
  );
}
