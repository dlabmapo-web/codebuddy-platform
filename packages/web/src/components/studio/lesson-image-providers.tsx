'use client';

import * as React from 'react';

import { PrivateImageContext } from '@/components/editor/private-image-context';
import { cachedImageResolver } from '@/lib/lesson-images';
import { manualApi } from '@/lib/manual-api';
import { orpc } from '@/lib/orpc';

/**
 * Lets every statement below show a programming problem's private pictures.
 *
 * `staff` readers (history, live monitoring) may be looking at a problem that
 * is no longer reachable for learners; they fall back to a reviewer preview,
 * which the server refuses to anyone without review permission.
 */
export function ExerciseImageProvider({ academyId, materialId, preview = false, staff = false, local, children }: {
  academyId: string;
  /** Absent for a problem not saved yet: only this session's uploads can show. */
  materialId?: string;
  preview?: boolean;
  staff?: boolean;
  /** Pictures uploaded in this editing session, shown before the problem is saved. */
  local?: ReadonlyMap<string, string>;
  children: React.ReactNode;
}) {
  const server = React.useMemo(() => cachedImageResolver(async (assetId) => {
    if (!materialId) throw new Error('Unsaved problem');
    const read = (asPreview: boolean) => orpc.learn.getExerciseImage({ academyId, materialId, assetId, ...(asPreview ? { preview: true } : {}) });
    return (await (preview ? read(true) : staff ? read(false).catch(() => read(true)) : read(false))).url;
  }), [academyId, materialId, preview, staff]);
  const resolve = React.useCallback((src: string) => local?.get(src) ? Promise.resolve(local.get(src)!) : server(src), [local, server]);
  return <PrivateImageContext.Provider value={resolve}>{children}</PrivateImageContext.Provider>;
}

/** The same for a quiz, written-answer, Turtle or short-answer material, through its own scope. */
export function ManualImageProvider({ scope, children }: {
  scope: { academyId: string; materialId: string; classId?: string; submissionId?: string; preview?: boolean };
  children: React.ReactNode;
}) {
  const { academyId, materialId, classId, submissionId, preview } = scope;
  const resolve = React.useMemo(() => cachedImageResolver(async (assetId) =>
    (await manualApi.choiceImage({ academyId, materialId, assetId, classId, submissionId, preview })).url,
  ), [academyId, materialId, classId, submissionId, preview]);
  return <PrivateImageContext.Provider value={resolve}>{children}</PrivateImageContext.Provider>;
}
