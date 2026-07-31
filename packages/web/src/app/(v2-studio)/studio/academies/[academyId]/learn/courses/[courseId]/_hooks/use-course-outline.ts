'use client';

import type { LearnCourseOutline } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { orpc } from '@/lib/orpc';

/**
 * Filtering runs over the outline already in memory. The whole published tree
 * arrives in one response, so searching is a local operation and must not cost
 * a request per keystroke.
 */
function filterModules(outline: LearnCourseOutline, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return outline.modules;

  return outline.modules
    .map((module) => ({
      ...module,
      lectures: module.lectures
        .map((lecture) => ({
          ...lecture,
          exercises: lecture.exercises.filter((exercise) =>
            exercise.title.toLocaleLowerCase().includes(needle),
          ),
        }))
        .filter((lecture) => lecture.exercises.length > 0),
    }))
    .filter((module) => module.lectures.length > 0);
}

export function useCourseOutline({
  academyId,
  courseId,
  initialOutline,
}: {
  academyId: string;
  courseId: string;
  initialOutline: LearnCourseOutline;
}) {
  const searchParams = useSearchParams();
  const requestedLectureId = searchParams.get('lecture');
  const [query, setQuery] = useState('');

  const outlineQuery = useQuery({
    queryKey: ['learn', academyId, 'outline', courseId],
    queryFn: () => orpc.learn.getCourseOutline({ academyId, courseId }),
    initialData: initialOutline,
    retry: false,
  });

  const outline = outlineQuery.data;

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    // A deep link to one lecture opens only its module; otherwise the first
    // module is open and the rest are collapsed, so a long course is scannable.
    const target = requestedLectureId
      ? outline.modules.find((module) =>
          module.lectures.some((lecture) => lecture.id === requestedLectureId),
        )
      : undefined;
    const openId = target?.id ?? outline.modules[0]?.id;
    return new Set(
      outline.modules
        .filter((module) => module.id !== openId)
        .map((module) => module.id),
    );
  });

  const modules = useMemo(
    () => filterModules(outline, query),
    [outline, query],
  );

  const searching = query.trim().length > 0;

  return {
    course: outline.course,
    version: outline.version,
    progress: outline.progress,
    modules,
    query,
    setQuery,
    searching,
    requestedLectureId,
    // A search result is useless behind a collapsed header, so filtering
    // overrides the collapsed set rather than fighting it.
    isExpanded: (moduleId: string) => searching || !collapsedIds.has(moduleId),
    toggleModule: (moduleId: string) =>
      setCollapsedIds((current) => {
        const next = new Set(current);
        if (next.has(moduleId)) next.delete(moduleId);
        else next.add(moduleId);
        return next;
      }),
  };
}

export type CourseOutlineState = ReturnType<typeof useCourseOutline>;
