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
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const archiveMutation = useMutation({
    mutationFn: (courseId: string) =>
      orpc.academyCourses.archive({ academyId, courseId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const restoreMutation = useMutation({
    mutationFn: (courseId: string) =>
      orpc.academyCourses.restore({ academyId, courseId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const closeForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setTitle('');
    setDescription('');
  };

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
    archive: (courseId: string) => archiveMutation.mutate(courseId),
    restore: (courseId: string) => restoreMutation.mutate(courseId),
    statusError: archiveMutation.error ?? restoreMutation.error,
  };
}

export type CoursesManagerState = ReturnType<typeof useCoursesManager>;
