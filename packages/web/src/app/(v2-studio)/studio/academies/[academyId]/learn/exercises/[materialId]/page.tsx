import type { LearnExerciseBootstrap } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { monitoringNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import { Workspace } from './_components/workspace';

/**
 * Fullscreen: this page deliberately does not render `StudioShell`. The studio
 * route group has no `layout.tsx`, so opting out of the shell is all it takes.
 */
export default async function ExerciseWorkspacePage({
  params,
}: {
  params: Promise<{ academyId: string; materialId: string }>;
}) {
  const { academyId, materialId } = await params;

  // One authorized read for the exercise and the course it sits in: the
  // navigator opens with the curriculum already in hand rather than showing a
  // loading panel on every entry.
  let bootstrap: LearnExerciseBootstrap | null = null;
  try {
    bootstrap = await createServerORPCClient().learn.getExerciseBootstrap({
      academyId,
      materialId,
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
      <Workspace academyId={academyId} bootstrap={bootstrap} />
    </PageTranslationsProvider>
  );
}
