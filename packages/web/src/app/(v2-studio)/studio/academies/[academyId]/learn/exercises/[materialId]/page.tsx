import type { LearnExerciseBootstrap } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { monitoringNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import { safeReturnTo } from '../../records/_lib/records-url';
import { Workspace } from './_components/workspace';

/**
 * Fullscreen: this page deliberately does not render `StudioShell`. The studio
 * route group has no `layout.tsx`, so opting out of the shell is all it takes.
 */
export default async function ExerciseWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ academyId: string; materialId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academyId, materialId } = await params;
  const search = await searchParams;
  const submissionId = single(search.submission);
  // Reduced to this academy's own records path before it reaches the client,
  // so a crafted `returnTo` cannot turn Back into an open redirect.
  const returnTo = search.returnTo
    ? safeReturnTo(academyId, single(search.returnTo))
    : null;

  // One authorized read for the exercise and the course it sits in: the
  // navigator opens with the curriculum already in hand rather than showing a
  // loading panel on every entry. A requested attempt is loaded alongside it.
  let bootstrap: LearnExerciseBootstrap | null = null;
  try {
    bootstrap = await createServerORPCClient().learn.getExerciseBootstrap({
      academyId,
      materialId,
      ...(isUuid(submissionId) ? { submissionId } : {}),
    });
  } catch {
    // Unpublished, missing, and out-of-academy are all just "not here" to a
    // student, and telling them apart would leak the existence of content they
    // cannot see.
    notFound();
  }
  if (!bootstrap) notFound();

  // Only the monitoring indicator needs this namespace, and only while a
  // teacher is present — but the copy has to be in hand before that happens.
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, monitoringNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={monitoringNamespaces}
      resources={resources}
    >
      <Workspace
        academyId={academyId}
        bootstrap={bootstrap}
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
