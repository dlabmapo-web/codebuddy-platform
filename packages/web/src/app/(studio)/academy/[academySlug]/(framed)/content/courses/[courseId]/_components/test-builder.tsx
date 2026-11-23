'use client';

import { BadgeCheck, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useContentAcademySlug, useContentSurface } from '@/components/studio/content-base-path-provider';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseLecture } from '../_lib/course-tree';

/** Gradable problem types, the only ones a test may hold. */
export const testMaterialTypes = new Set(['PROGRAMMING_EXERCISE', 'MULTIPLE_CHOICE', 'WRITTEN_RESPONSE']);

/** "테스트 추가" beside "수업 추가": creates a draft test with the typed title and opens it. */
export function AddTestButton({ builder, moduleId, title }: { builder: CourseBuilderState; moduleId: string; title: string }) {
  const { t } = useTranslation('exam');
  const slug = useContentAcademySlug();
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const surface = useContentSurface();
  if (surface !== 'academy') return null;
  return (
    <>
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { lectureId } = await orpc.exam.createTest({ ...builder.target, moduleId, title: title.trim() });
            builder.cancelLecture();
            router.push(routes.academyContentTest(slug, builder.target.courseId, lectureId));
          } catch (caught) {
            setError(errorText(caught));
            setBusy(false);
          }
        }}
        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-brand px-4 text-[14px] font-bold text-brand transition-colors hover:bg-brand-soft disabled:opacity-40"
      >
        <BadgeCheck aria-hidden className="size-4" /> {t('authoring.add_test')}
      </button>
      {error ? <p role="alert" className="w-full text-[13px] font-semibold text-danger">{error}</p> : null}
    </>
  );
}

/** The test badge and its settings link on a TEST lecture row. */
export function TestRowBadge({ builder, lecture }: { builder: CourseBuilderState; lecture: CourseLecture }) {
  const { t } = useTranslation('exam');
  const slug = useContentAcademySlug();
  const surface = useContentSurface();
  if (lecture.kind !== 'TEST') return null;
  return (
    <>
      <BadgeCheck aria-label={t('badge')} className="size-4 shrink-0 text-brand" />
      {surface === 'academy' ? (
        <Link href={routes.academyContentTest(slug, builder.target.courseId, lecture.id)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-[12.5px] font-semibold text-ink hover:border-brand hover:text-brand">
          <Settings2 aria-hidden className="size-3.5" /> {t('authoring.open')}
        </Link>
      ) : null}
    </>
  );
}

/** "테스트로 전환" for a lecture whose problems are all gradable. */
export function useConvertToTest(builder: CourseBuilderState, lecture: CourseLecture) {
  const { t } = useTranslation('exam');
  const slug = useContentAcademySlug();
  const surface = useContentSurface();
  const router = useRouter();
  const errorText = useErrorText();
  if (surface !== 'academy' || lecture.kind === 'TEST' || !lecture.materials.every((m) => testMaterialTypes.has(m.type))) return [];
  return [{
    label: t('authoring.convert'),
    onSelect: async () => {
      try {
        await orpc.exam.convertLecture({ ...builder.target, lectureId: lecture.id });
        router.push(routes.academyContentTest(slug, builder.target.courseId, lecture.id));
      } catch (caught) {
        window.alert(errorText(caught));
      }
    },
  }];
}
