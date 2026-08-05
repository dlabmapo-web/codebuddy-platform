import type { LearnExerciseWorkspace } from '@cove/shared';
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

  let workspace: LearnExerciseWorkspace | null = null;
  try {
    workspace = await createServerORPCClient().learn.getExerciseWorkspace({
      academyId,
      materialId,
    });
  } catch {
    // Unpublished, missing, and out-of-academy are all just "not here" to a
    // student, and telling them apart would leak the existence of content they
    // cannot see.
    notFound();
  }
  if (!workspace) notFound();

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
      <Workspace academyId={academyId} workspace={workspace} />
    </PageTranslationsProvider>
  );
}
