import type { LearnExerciseWorkspace } from '@cove/shared';
import { notFound } from 'next/navigation';

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

  return <Workspace academyId={academyId} workspace={workspace} />;
}
