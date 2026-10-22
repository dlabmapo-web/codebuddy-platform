'use client';

import { CheckCircle2, Users, Pencil, ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { ManualConfig, ManualWorkspace } from '@cove/shared';
import { manualApi } from '@/lib/manual-api';
import { routes } from '@/lib/routes';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { AssessmentDrawer } from './assessment-ui';
import { lessonAction as assessmentAction } from '@/components/workspace/lesson-chrome';
import { ChoiceRich } from './choice-options';
import { useManualTranslation } from './use-manual-translation';

// Authoring tools load only when an authorized member opens Edit.
const ManualAuthorDialog = dynamic(() => import('./manual-author-dialog').then(module => module.ManualAuthorDialog));

function SolutionReference({ config, academyId, materialId }: {
  config: ManualConfig; academyId: string; materialId: string;
}) {
  const { t } = useManualTranslation();
  const choice = config.multipleChoice;
  const short = config.shortAnswer;
  const scope = { academyId, materialId, preview: true };
  return <div className="space-y-5 text-sm leading-7">
    {short ? <section>
      <h3 className="mb-2 font-bold">{t(short.gradingMode === 'REGEX' ? 'ui.answer_pattern' : 'correct_answer')}</h3>
      <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-canvas p-3">
        {short.gradingMode === 'REGEX' ? short.pattern : short.expectedAnswer || config.modelAnswer || t('ui.no_reference')}
      </pre>
    </section> : null}
    {choice ? <section>
      <h3 className="mb-2 font-bold">{t('correct_option')}</h3>
      <ul className="space-y-2">
        {choice.options.filter(o => choice.correctOptionIds?.includes(o.id)).map(o => (
          <li key={o.id} className="flex gap-2 rounded-lg border border-success/20 bg-success/5 p-3">
            <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0 text-success" />
            <ChoiceRich content={o.content} scope={scope} />
          </li>
        ))}
      </ul>
    </section> : null}
    {config.modelAnswer && !short ? <section>
      <h3 className="mb-2 font-bold">{t('model_answer_private')}</h3>
      <p className="whitespace-pre-wrap">{config.modelAnswer}</p>
    </section> : null}
    {config.solutionFiles ? <section>
      <h3 className="mb-2 font-bold">{t('view_solution')}</h3>
      {Object.entries(config.solutionFiles).map(([name, code]) => <div key={name}>
        <p className="font-semibold">{name}</p>
        <pre className="overflow-auto rounded-lg bg-canvas p-3">{code}</pre>
      </div>)}
    </section> : null}
    {short?.explanation || choice?.explanation ? <section>
      <h3 className="mb-2 font-bold">{t('explanation')}</h3>
      <ChoiceRich content={short?.explanation || choice?.explanation || ''} scope={scope} />
    </section> : null}
    {!short && !choice && !config.modelAnswer && !config.solutionFiles ? <p>{t('ui.no_reference')}</p> : null}
  </div>;
}

/** Shared assessment actions. Visibility is a server capability, never a role-mode cookie. */
export function ManualStaffActions({ academyId, data, classId, reviewing = false, allowNavigate = () => true }: {
  academyId: string;
  data: ManualWorkspace;
  classId?: string;
  reviewing?: boolean;
  allowNavigate?: () => boolean;
}) {
  const { t } = useManualTranslation();
  const slug = useAcademySlug();
  const cache = useQueryClient();
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const staff = data.staff;
  // The editor loads on material changes; polling must not reset unsaved fields.
  const material = useMemo(
    () => ({ id: data.materialId, title: data.title, type: data.type }),
    [data.materialId, data.title, data.type],
  );
  const reference = useQuery({
    queryKey: ['manual-reference', academyId, data.materialId],
    queryFn: () => manualApi.read({ academyId, materialId: data.materialId, preview: true }),
    enabled: Boolean(staff?.canViewSolutions && solutionOpen),
    retry: false,
    staleTime: 0,
  });
  if (!staff) return null;
  const activity = routes.academyLearnMaterial(slug, data.materialId, data.type, { classId });
  return <>
    {staff.canViewSolutions ? <AssessmentDrawer
      title={t('view_solution')} open={solutionOpen} onOpenChange={setSolutionOpen}
      trigger={<button type="button" className={assessmentAction}>
        <CheckCircle2 aria-hidden className="size-3.5" />{t('view_solution')}
      </button>}
    >
      <p className="mb-4 rounded-lg border border-brand/20 bg-brand-soft p-3 text-sm text-brand">{t('ui.staff_reference_notice')}</p>
      {reference.isPending ? <p role="status">{t('loading_activity')}</p>
        : reference.isError ? <p role="alert" className="text-danger">{t('ui.reference_unavailable')}</p>
        : reference.data ? <SolutionReference config={reference.data.config} academyId={academyId} materialId={data.materialId} /> : null}
    </AssessmentDrawer> : null}
    {staff.canTutor ? <AssessmentDrawer
      title={t('ui.tutoring')}
      trigger={<button type="button" aria-pressed={reviewing}
        className={`${assessmentAction} aria-pressed:border-brand/30 aria-pressed:bg-brand-soft aria-pressed:text-brand`}>
        <Users aria-hidden className="size-3.5" />{t('ui.tutoring')}
      </button>}
    >
      <p className="mb-4 text-sm leading-6 text-sub">{t('ui.tutoring_help')}</p>
      <nav className="grid gap-2" aria-label={t('ui.assigned_classes')}>
        {staff.classes.map(c => <Link key={c.classId}
          href={routes.academyTeachManual(slug, c.classId, data.materialId)}
          aria-current={reviewing && classId === c.classId ? 'page' : undefined}
          onClick={event => { if (!allowNavigate()) event.preventDefault(); }}
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm font-semibold hover:border-brand/30 hover:bg-brand-soft aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand"
        >
          <Users aria-hidden className="size-4 shrink-0 text-brand" />{c.name}
        </Link>)}
      </nav>
      {!staff.classes.length ? <p role="status" className="rounded-lg border border-border bg-canvas p-4 text-sm leading-6 text-sub">{t('ui.no_assigned_classes')}</p> : null}
    </AssessmentDrawer> : null}
    {staff.canAuthor ? <button type="button" className={assessmentAction}
      onClick={() => { if (allowNavigate()) setEditing(true); }}>
      <Pencil aria-hidden className="size-3.5" />{t('ui.edit')}
    </button> : null}
    {reviewing ? <Link href={activity} className={assessmentAction}
      onClick={event => { if (!allowNavigate()) event.preventDefault(); }}>
      <ArrowLeft aria-hidden className="size-4" />{t('ui.my_answer')}
    </Link> : null}
    {editing ? <ManualAuthorDialog
      target={{ academyId, courseId: data.course.id, lectureId: staff.lectureId }}
      material={material} type={data.type} shortAnswer={Boolean(data.config.shortAnswer)}
      onClose={() => setEditing(false)}
      onSaved={async () => {
        await Promise.all([
          cache.invalidateQueries({ queryKey: ['manual'] }),
          cache.invalidateQueries({ queryKey: ['manual-reference', academyId, data.materialId] }),
        ]);
      }}
    /> : null}
  </>;
}
