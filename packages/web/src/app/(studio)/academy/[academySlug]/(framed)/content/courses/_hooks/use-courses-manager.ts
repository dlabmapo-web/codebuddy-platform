'use client';

import { useContentBasePath } from '@/components/studio/content-base-path-provider';

import type { CourseSummary } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { orpc } from '@/lib/orpc';

import { academyCoursesQueryKey } from '../_lib/courses-query';

export function useCoursesManager({
  academyId,
  initialCourses,
}: {
  academyId: string;
  initialCourses: CourseSummary[];
}) {
  const contentPaths = useContentBasePath();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const queryKey = academyCoursesQueryKey(academyId);

  const coursesQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.list({ academyId }),
    initialData: { courses: initialCourses },
    retry: false,
  });

  const openCourse = useCallback(
    (course: CourseSummary) => {
      router.push(contentPaths.course(course.id));
    },
    [contentPaths, router],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      orpc.academyCourses.create({ academyId, title, description }),
    onSuccess: async (course) => {
      setTitle('');
      setDescription('');
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey });
      openCourse(course);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      orpc.academyCourses.update({
        academyId,
        courseId: editingId!,
        title,
        description,
      }),
    onSuccess: async () => {
      setEditingId(null);
      setTitle('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ courseId, isVisible }: { courseId: string; isVisible: boolean }) =>
      orpc.academyCourses.setVisibility({ academyId, courseId, isVisible }),
    // Flipped in the list at once and reconciled by the refetch: the eye is one
    // bit the page already knows, and waiting on the round trip read as lag.
    onMutate: async ({ courseId, isVisible }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ courses: CourseSummary[] }>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, {
          ...previous,
          courses: previous.courses.map((course) =>
            course.id === courseId ? { ...course, isVisible } : course,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const closeForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setTitle('');
    setDescription('');
  };

  /**
   * Destroy a course and everything under it.
   *
   * Hiding stays the reversible answer for a course that should stop being
   * taught. The server refuses this one outright once a student has submitted
   * through it, so what is lost here is only ever curriculum nobody has
   * answered yet.
   */
  const deleteMutation = useMutation({
    mutationFn: (input: { courseId: string; confirmTitle: string }) =>
      orpc.academyCourses.delete({ academyId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    courses: coursesQuery.data.courses,
    showCreate,
    editingId,
    formOpen: showCreate || editingId !== null,
    openCreate: () => {
      setEditingId(null);
      setTitle('');
      setDescription('');
      setShowCreate(true);
    },
    openEdit: (course: CourseSummary) => {
      setShowCreate(false);
      setEditingId(course.id);
      setTitle(course.title);
      setDescription(course.description);
    },
    closeForm,
    title,
    setTitle,
    description,
    setDescription,
    submit: () =>
      editingId ? updateMutation.mutate() : createMutation.mutate(),
    submitPending: createMutation.isPending || updateMutation.isPending,
    submitError: createMutation.error ?? updateMutation.error,
    setVisible: (courseId: string, isVisible: boolean) =>
      visibilityMutation.mutate({ courseId, isVisible }),
    visibilityError: visibilityMutation.error,
    /** The course whose toggle is mid-request, so only that one spins. */
    visibilityPendingId: visibilityMutation.isPending
      ? visibilityMutation.variables.courseId
      : null,
    deleteCourse: (courseId: string, confirmTitle: string) =>
      deleteMutation.mutateAsync({ courseId, confirmTitle }),
    deletePending: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}

export type CoursesManagerState = ReturnType<typeof useCoursesManager>;
