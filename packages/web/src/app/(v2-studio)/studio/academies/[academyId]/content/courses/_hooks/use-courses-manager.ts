'use client';

import type { CourseSummary } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { orpc } from '@/lib/orpc';

export function useCoursesManager({
  academyId,
  initialCourses,
}: {
  academyId: string;
  initialCourses: CourseSummary[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(initialCourses.length === 0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const queryKey = ['academy', academyId, 'courses'];

  const coursesQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.list({ academyId }),
    initialData: { courses: initialCourses },
    retry: false,
  });

  const openDraft = useCallback(
    (course: CourseSummary) => {
      if (!course.draftVersion) return;
      router.push(
        `/studio/academies/${academyId}/content/courses/${course.id}/versions/${course.draftVersion.id}`,
      );
    },
    [academyId, router],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      orpc.academyCourses.create({ academyId, title, description }),
    onSuccess: async (course) => {
      setTitle('');
      setDescription('');
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey });
      openDraft(course);
    },
  });

  const startDraftMutation = useMutation({
    mutationFn: (courseId: string) =>
      orpc.academyCourses.createDraft({ academyId, courseId }),
    onSuccess: async (course) => {
      await queryClient.invalidateQueries({ queryKey });
      openDraft(course);
    },
  });

  return {
    courses: coursesQuery.data.courses,
    showCreate,
    toggleCreate: () => setShowCreate((value) => !value),
    title,
    setTitle,
    description,
    setDescription,
    create: () => createMutation.mutate(),
    createPending: createMutation.isPending,
    createError: createMutation.error,
    startDraft: (courseId: string) => startDraftMutation.mutate(courseId),
    startingCourseId: startDraftMutation.isPending
      ? startDraftMutation.variables
      : undefined,
    startDraftError: startDraftMutation.error,
  };
}

export type CoursesManagerState = ReturnType<typeof useCoursesManager>;
