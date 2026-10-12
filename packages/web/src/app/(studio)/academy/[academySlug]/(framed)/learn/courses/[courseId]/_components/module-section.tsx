'use client';
import {useVideoTranslation} from "@/components/video/use-video-translation";


import { useManualTranslation } from '@/components/manual/use-manual-translation';
import { PdfResourceLink } from '@/components/pdf/pdf-resource-link';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import type { LearnCourseOutline } from '@cove/shared';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import {
  formatProblemOutlineNumber,
  lectureProgress,
} from '../_lib/course-outline';
import { ExerciseRow } from './exercise-row';

type Module = LearnCourseOutline['modules'][number];

export function ModuleSection({
  academyId,
  classId,
  expanded,
  isLectureExpanded,
  module,
  onToggle,
  onToggleLecture,
  requestedLectureId,
}: {
  academyId: string;
  classId: string;
  expanded: boolean;
  isLectureExpanded: (lectureId: string) => boolean;
  module: Module;
  onToggle: () => void;
  onToggleLecture: (lectureId: string) => void;
  requestedLectureId: string | null;
}) {
  const {t:mt}=useManualTranslation();
  const {t:vt}=useVideoTranslation();
  const slug = useAcademySlug();
  const { t } = useLayoutTranslation('learn');
  const exerciseCount = module.lectures.reduce(
    (total, lecture) => total + lecture.exercises.length,
    0,
  );

  return (
    <section
      className={`overflow-hidden rounded-card border bg-card transition-colors ${
        expanded ? 'border-brand/30' : 'border-border'
      }`}
    >
      <h2>
        <button
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas/60"
          onClick={onToggle}
          type="button"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft font-mono text-[13px] font-bold text-brand">
            {module.position}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[0.07em] text-brand">
              {t('outline.module_label', { position: module.position })}
            </span>
            <span className="mt-0.5 block truncate text-[15px] font-bold">
              {module.title}
            </span>
          </span>
          <span className="hidden shrink-0 text-[12px] text-sub sm:block">
            {exerciseCount}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-sub transition-transform ${
              expanded ? 'rotate-180 text-brand' : ''
            }`}
          />
        </button>
      </h2>

      {expanded ? (
        <div className="border-t border-border bg-canvas/40 p-3">
          <div className="flex flex-col gap-4">
            {module.lectures.map((lecture) => (
              <Collapsible.Root
                asChild
                key={lecture.id}
                onOpenChange={() => onToggleLecture(lecture.id)}
                open={isLectureExpanded(lecture.id)}
              >
                <section
                  id={`lecture-${lecture.id}`}
                  // A deep link needs a scroll target that survives the
                  // collapse state, so the anchor lives on the lecture.
                  className={`overflow-hidden rounded-lg border bg-card transition-colors ${
                    lecture.id === requestedLectureId
                      ? 'border-brand/40 ring-2 ring-brand/20'
                      : 'border-border'
                  }`}
                >
                  {lecture.exercises.length > 0 || (lecture.manualMaterials?.length??0)>0 ||
                  (lecture.documents?.length ?? 0) > 0 || (lecture.videos?.length??0)>0 ? (
                    <header>
                      <Collapsible.Trigger asChild>
                        <button
                          aria-label={t('outline.toggle_lecture', {
                            title: lecture.title,
                          })}
                          className="flex w-full items-start gap-2.5 px-3 py-3 text-left transition-colors hover:bg-canvas/70"
                          type="button"
                        >
                          <ChevronDown
                            aria-hidden
                            className={`mt-0.5 size-4 shrink-0 text-sub transition-transform duration-200 motion-reduce:transition-none ${
                              isLectureExpanded(lecture.id)
                                ? 'rotate-180 text-brand'
                                : ''
                            }`}
                          />
                          {/* One column on a phone: the progress block below
                              needs its own line before the title starts
                              truncating to nothing. */}
                          <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <span className="min-w-0 flex-1">
                              <span className="block text-[10.5px] font-bold uppercase tracking-[0.07em] text-sub">
                                {t('outline.lecture_label', {
                                  position: lecture.position,
                                })}
                              </span>
                              <span className="mt-0.5 block truncate text-[13.5px] font-bold text-ink">
                                {lecture.title}
                              </span>
                              {lecture.description ? (
                                // Two lines: enough to say what the lecture
                                // covers, never enough to push the next one
                                // off the screen.
                                <span className="mt-1 line-clamp-2 text-[12.5px] leading-[1.5] text-sub">
                                  {lecture.description}
                                </span>
                              ) : null}
                            </span>
                            <LectureProgress lecture={lecture} />
                          </span>
                        </button>
                      </Collapsible.Trigger>
                    </header>
                  ) : (
                    <header className="px-3 py-2.5">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-sub">
                        {t('outline.lecture_label', {
                          position: lecture.position,
                        })}
                      </span>
                      <h3 className="mt-0.5 text-[13.5px] font-bold">
                        {lecture.title}
                      </h3>
                    </header>
                  )}

                  <Collapsible.Content className="cove-collapse">
                    {lecture.exercises.length === 0 &&
                    !lecture.documents?.length && !lecture.manualMaterials?.length && !lecture.videos?.length ? (
                      <p className="border-t border-dashed border-border px-3 py-4 text-center text-[12.5px] text-sub">
                        {t('outline.lecture_empty')}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2 border-t border-border bg-canvas/35 p-2.5">
                        {[
                          ...(lecture.videos??[]).map(video=>({kind:'video' as const,position:video.position,video})),
                          ...(lecture.manualMaterials??[]).map(manual=>({kind:'manual' as const,position:manual.position,manual})),
                          ...lecture.exercises.map((exercise) => ({
                            kind: 'exercise' as const,
                            position: exercise.position,
                            exercise,
                          })),
                          ...(lecture.documents ?? [])
                            .filter((d) => d.pdf.placement !== 'SUPPLEMENTARY')
                            .map((doc) => ({
                              kind: 'pdf' as const,
                              position: doc.position,
                              doc,
                            })),
                        ]
                          .sort((a, b) => a.position - b.position)
                          .map((row, index) =>
                            row.kind === 'video' ? (<li key={row.video.materialId}><Link className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm font-semibold text-brand" href={routes.academyLearnVideo(slug,row.video.materialId,{classId})}><span>{row.video.title}</span><span className="ml-auto text-xs text-sub">{vt('badge')} · {row.video.status==='SOLVED'?vt('completed'):vt(row.video.video.includeInScore?'include_score':'excluded')}</span></Link></li>) : row.kind === 'manual' ? (<li key={row.manual.materialId}><Link className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm font-semibold text-brand" href={routes.academyLearnAssessment(slug,row.manual.materialId,row.manual.type,{classId})}><span>{row.manual.title}</span><span className="ml-auto text-xs text-sub">{row.manual.type === "MULTIPLE_CHOICE" ? `${mt("automatic_graded")} · ` : row.manual.type === "TURTLE_EXERCISE" ? `${mt("teacher_graded")} ` : ""}{row.manual.pending?'Awaiting review':row.manual.status==='SOLVED'?'Completed':row.manual.includeInScore?'Included in score':'Excluded from score'}</span></Link></li>) : row.kind === 'exercise' ? (
                              <ExerciseRow
                                academyId={academyId}
                                classId={classId}
                                exercise={row.exercise}
                                key={row.exercise.materialId}
                                label={formatProblemOutlineNumber(
                                  module.position,
                                  lecture.position,
                                  index + 1,
                                )}
                              />
                            ) : (
                              <li key={row.doc.materialId}>
                                <Link
                                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm font-semibold text-brand"
                                  href={routes.academyLearnPdf(
                                    slug,
                                    row.doc.materialId,
                                    { classId },
                                  )}
                                >
                                  <span className="font-mono text-xs">PDF</span>
                                  {row.doc.title}
                                  <span className="ml-auto text-xs text-sub">
                                    {row.doc.pdf.pageCount}
                                  </span>
                                </Link>
                              </li>
                            ),
                          )}
                      </ul>
                    )}
                    {lecture.documents?.some(
                      (d) => d.pdf.placement !== 'MAIN',
                    ) ? (
                      <div className="border-t border-border p-3">
                        <h4 className="mb-2 text-sm font-bold">
                          {t('pdf.resources')}
                        </h4>
                        <ul className="grid gap-2">
                          {lecture.documents
                            .filter((d) => d.pdf.placement !== 'MAIN')
                            .map((document) => (
                              <PdfResourceLink
                                key={document.materialId}
                                academyId={academyId}
                                classId={classId}
                                document={document}
                              />
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </Collapsible.Content>
                </section>
              </Collapsible.Root>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The lecture card's scan line: how many problems, how many solved, and a bar.
 *
 * The count is always printed beside the bar rather than replaced by it —
 * width alone is not a number, and a bar is the first thing to become
 * unreadable at narrow widths or in high contrast.
 */
function LectureProgress({ lecture }: { lecture: Module['lectures'][number] }) {
  const { t } = useLayoutTranslation('learn');
  const progress = lectureProgress(lecture);
  if (progress.percent === null) return null;

  return (
    <span className="flex shrink-0 items-center gap-2 sm:w-44">
      <span className="whitespace-nowrap text-[12px] font-semibold text-sub">
        {t('outline.progress', {
          solved: progress.solved,
          total: progress.total,
        })}
      </span>
      <span
        aria-label={t('outline.lecture_progress_label', {
          title: lecture.title,
        })}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border sm:block"
        role="progressbar"
      >
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${progress.percent}%` }}
        />
      </span>
    </span>
  );
}
