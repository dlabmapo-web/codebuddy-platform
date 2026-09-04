'use client';

import type { AvailableLibraryCourse, CourseTree } from '@cove/shared';
import { suggestedCopyTitle } from '@cove/shared';
import {
  BookOpen,
  Check,
  Copy,
  Layers,
  Library,
  Presentation,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useContentBasePath } from '@/components/studio/content-base-path-provider';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { courseAccent, courseAccentClasses } from '@/lib/course-accent';
import { orpc } from '@/lib/orpc';

import { academyCoursesQueryKey } from '../../courses/_lib/courses-query';

/**
 * What head office publishes, and the one button that makes it yours.
 *
 * Cards rather than a table. A team lead here is *choosing* a course, not
 * auditing a list of them — they are reading what each one covers and how big
 * it is, which is a comparison a row of numbers makes harder rather than
 * easier.
 *
 * Each card wears its master's identity hue as a spine, from the same
 * `courseAccent` the student catalog uses, so forty published courses are
 * scannable by something other than their first word.
 *
 * The copy is a copy, and the interface says so plainly rather than implying a
 * subscription: nothing here promises the course will keep up with head
 * office, because it will not. What it promises is that the copy is yours.
 */
export function LibraryBrowser({
  academyId,
  initialCourses,
}: {
  academyId: string;
  initialCourses: AvailableLibraryCourse[];
}) {
  const { t } = useTranslation('academy-library');
  const { t: courses } = useTranslation('courses');
  const errorText = useErrorText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const contentPaths = useContentBasePath();

  const [available, setAvailable] = React.useState(initialCourses);
  const [previewing, setPreviewing] =
    React.useState<AvailableLibraryCourse | null>(null);
  const [tree, setTree] = React.useState<CourseTree | null>(null);
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const open = async (course: AvailableLibraryCourse) => {
    setPreviewing(course);
    setTree(null);
    setError(null);
    // Pre-filled, and editable. Course titles are unique per academy, so an
    // academy taking head office's newer version of a course it already holds
    // has to be able to name the second one — otherwise the copy is refused
    // with nowhere to go.
    setTitle(
      suggestedCopyTitle(
        course.title,
        course.existingCopies.map((copy) => copy.title),
      ),
    );
    try {
      setTree(
        await orpc.academyLibrary.preview({
          academyId,
          libraryCourseId: course.id,
        }),
      );
    } catch (caught) {
      setError(caught);
    }
  };

  const adopt = async () => {
    if (!previewing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const course = await orpc.academyLibrary.adopt({
        academyId,
        libraryCourseId: previewing.id,
        title: title.trim(),
      });
      setPreviewing(null);
      setAvailable(
        await orpc.academyLibrary
          .available({ academyId })
          .then((result) => result.courses),
      );
      // The copy is a new course in this academy, and two surfaces cache that
      // list behind one query client that outlives this navigation: the courses
      // table and a class's course picker. Without this the Team Lead walks
      // back from the builder to a table that does not list the course they
      // just took, and only a full page reload — which builds a new query
      // client — shows it.
      await queryClient.invalidateQueries({
        queryKey: academyCoursesQueryKey(academyId),
      });
      router.push(contentPaths.course(course.id));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (available.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center">
        <span
          aria-hidden
          className="mx-auto grid size-11 place-items-center rounded-xl bg-course-a-soft text-course-a"
        >
          <Library className="size-5" strokeWidth={2.25} />
        </span>
        <h2 className="mt-3 text-[15px] font-bold text-ink">
          {t('empty_heading')}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-[14px] leading-6 text-sub">
          {t('empty_body')}
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {available.map((course) => {
          const accent = courseAccentClasses[courseAccent(course.id)];
          const taken = course.existingCopies[0];
          return (
            <li
              className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-card transition-shadow hover:shadow-card"
              key={course.id}
            >
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-[3px] ${accent.spine}`}
              />
              <div className="flex-1 px-5 pb-4 pt-5">
                <h3 className="text-[15px] font-bold text-ink">
                  {course.title}
                </h3>
                {course.description ? (
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-5 text-sub">
                    {course.description}
                  </p>
                ) : null}
                <dl className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                  <Shape
                    icon={Layers}
                    label={String(course.moduleCount)}
                    title={courses('path.module')}
                    tone="text-course-b"
                  />
                  <Shape
                    icon={Presentation}
                    label={String(course.lectureCount)}
                    title={courses('path.lecture')}
                    tone="text-course-c"
                  />
                  <Shape
                    icon={BookOpen}
                    label={String(course.exerciseCount)}
                    title={courses('path.problem')}
                    tone="text-course-a"
                  />
                </dl>
                {taken ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-[12.5px] font-semibold text-sub">
                    <Check className="size-3.5 text-success" strokeWidth={2.5} />
                    {t('already_have', { title: taken.title })}
                  </p>
                ) : null}
              </div>
              <div className="border-t border-border px-5 py-3">
                <Button
                  className="w-full"
                  onClick={() => void open(course)}
                  variant="outline"
                >
                  {t('preview')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        onOpenChange={(next) => {
          if (!next && !busy) setPreviewing(null);
        }}
        open={Boolean(previewing)}
      >
        <ModalContent
          description={t('preview_body')}
          title={previewing?.title ?? ''}
        >
          <div className="max-h-[50vh] overflow-y-auto px-6 py-5">
            {tree === null ? (
              <p className="text-[14px] text-sub">{t('preview')}…</p>
            ) : (
              <ol className="space-y-3">
                {tree.modules.map((courseModule) => (
                  <li key={courseModule.id}>
                    <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
                      <Layers
                        className="size-4 text-course-b"
                        strokeWidth={2.25}
                      />
                      {courseModule.title}
                    </p>
                    <ul className="mt-1.5 space-y-1 border-l border-border pl-4">
                      {courseModule.lectures.map((lecture) => (
                        <li key={lecture.id}>
                          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                            <Presentation
                              className="size-3.5 text-course-c"
                              strokeWidth={2.25}
                            />
                            {lecture.title}
                            <span className="font-mono text-[12px] font-normal text-sub">
                              {lecture.materials.length}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="border-t border-border px-6 py-4">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('title_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
              <span className="text-[12.5px] text-sub">{t('title_hint')}</span>
            </label>

            {error ? (
              <p
                className="mt-3 rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger"
                role="alert"
              >
                {errorText(error)}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                disabled={busy}
                onClick={() => setPreviewing(null)}
                type="button"
                variant="ghost"
              >
                {courses('common:action.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                disabled={busy || title.trim().length === 0}
                onClick={() => void adopt()}
                type="button"
              >
                <Copy className="size-4" />
                {busy ? t('adopting') : t('adopt')}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}

function Shape({
  icon: Icon,
  label,
  title,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  title: string;
  tone: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sub"
      title={title}
    >
      <Icon className={`size-4 ${tone}`} strokeWidth={2.25} />
      <span className="font-mono tabular-nums text-ink">{label}</span>
    </span>
  );
}
