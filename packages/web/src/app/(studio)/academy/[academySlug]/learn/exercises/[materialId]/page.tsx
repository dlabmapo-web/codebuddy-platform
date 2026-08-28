import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnExerciseBootstrap } from '@cove/shared';
import { notFound, redirect, RedirectType } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { exerciseNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import { safeReturnTo } from '@/app/(studio)/academy/[academySlug]/(framed)/learn/records/_lib/records-url';
import { Workspace } from './_components/workspace';
import { LearningClassChoice } from '@/app/(studio)/academy/[academySlug]/(framed)/learn/_components/learning-class-choice';

/**
 * Fullscreen: this page deliberately does not render `StudioShell`. The studio
 * route group has no `layout.tsx`, so opting out of the shell is all it takes.
 */
export default async function ExerciseWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; materialId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, materialId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const search = await searchParams;
  const submissionId = single(search.submission);
  const requestedClassId = single(search.classId);
  // Reduced to this academy's own records path before it reaches the client,
  // so a crafted `returnTo` cannot turn Back into an open redirect.
  const returnTo = search.returnTo
    ? safeReturnTo(academySlug, single(search.returnTo))
    : null;

  // One authorized read for the exercise and the course it sits in: the
  // navigator opens with the curriculum already in hand rather than showing a
  // loading panel on every entry. A requested attempt is loaded alongside it.
  let bootstrap: LearnExerciseBootstrap | null = null;
  try {
    bootstrap = await createServerORPCClient().learn.getExerciseBootstrap({
      academyId,
      materialId,
      ...(isUuid(requestedClassId) ? { classId: requestedClassId } : {}),
      ...(isUuid(submissionId) ? { submissionId } : {}),
    });
  } catch {
    // Unpublished, missing, and out-of-academy are all just "not here" to a
    // student, and telling them apart would leak the existence of content they
    // cannot see.
    notFound();
  }
  if (!bootstrap) notFound();

  // No class at all means staff, not a student choosing between classes: the
  // workspace runs solve sessions, submissions and monitoring against a class
  // and would record their preview as a student's attempt. The authoring view
  // shows the same exercise, and every staff role now holds the
  // `curriculum.review` it needs.
  if (bootstrap.classContext.classes.length === 0) {
    const { course, lecture } = bootstrap.workspace.breadcrumb;
    redirect(
      `${routes.academy(academySlug)}/content/courses/${course.id}` +
        `/lectures/${lecture.id}/exercises/${materialId}`,
      RedirectType.replace,
    );
  }

  if (!bootstrap.classContext.classId) {
    const choiceQuery = new URLSearchParams();
    if (isUuid(submissionId)) choiceQuery.set('submission', submissionId);
    if (returnTo) choiceQuery.set('returnTo', returnTo);
    const choicePath = routes.academyLearnExercise(
      academySlug,
      materialId,
      Object.fromEntries(choiceQuery),
    );
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-5">
        <LearningClassChoice
          context={bootstrap.classContext}
          path={choicePath}
        />
      </main>
    );
  }

  // The monitoring indicator and the terminal's error explanations: neither is
  // on screen when the page loads, and both have to render without a fetch the
  // moment a teacher joins or a run raises.
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, exerciseNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={exerciseNamespaces}
      resources={resources}
    >
      <Workspace
        academyId={academyId}
        bootstrap={bootstrap}
        classId={bootstrap.classContext.classId}
        returnTo={returnTo}
        submissionRequested={Boolean(submissionId)}
      />
    </PageTranslationsProvider>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A malformed id is dropped rather than sent: the contract would reject it and
 * cost the student the whole workspace over a bad link.
 */
function isUuid(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
