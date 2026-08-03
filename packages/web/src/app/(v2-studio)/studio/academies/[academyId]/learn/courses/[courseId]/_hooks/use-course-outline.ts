'use client';

import type { LearnCourseOutline } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { orpc } from '@/lib/orpc';

import {
  filterCourseModules,
  isOutlineItemExpanded,
  toggleCollapsedId,
} from '../_lib/course-outline';

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
  const [collapsedLectureIds, setCollapsedLectureIds] = useState<Set<string>>(
    () => new Set(),
  );

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
    // The whole visible tree is already in memory, so searching must not cost
    // a request per keystroke.
    () => filterCourseModules(outline, query),
    [outline, query],
  );

  const searching = query.trim().length > 0;

  return {
    course: outline.course,
    progress: outline.progress,
    modules,
    query,
    setQuery,
    searching,
    requestedLectureId,
    // A search result is useless behind a collapsed header, so filtering
    // overrides the collapsed set rather than fighting it.
    isExpanded: (moduleId: string) =>
      isOutlineItemExpanded({
        collapsedIds,
        forceExpanded: searching,
        id: moduleId,
      }),
    toggleModule: (moduleId: string) =>
      setCollapsedIds((current) => toggleCollapsedId(current, moduleId)),
    isLectureExpanded: (lectureId: string) =>
      isOutlineItemExpanded({
        collapsedIds: collapsedLectureIds,
        forceExpanded: searching || lectureId === requestedLectureId,
        id: lectureId,
      }),
    toggleLecture: (lectureId: string) =>
      setCollapsedLectureIds((current) =>
        toggleCollapsedId(current, lectureId),
      ),
  };
}

export type CourseOutlineState = ReturnType<typeof useCourseOutline>;
