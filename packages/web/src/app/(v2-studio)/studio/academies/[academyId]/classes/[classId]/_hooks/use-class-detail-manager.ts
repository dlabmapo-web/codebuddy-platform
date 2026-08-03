'use client';

import type {
  ClassDetail,
  CourseSummary,
  EnrolledStudentSummary,
} from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

/** What the confirmation dialog is currently asking about. */
export type PendingRemoval =
  | { kind: 'course'; id: string; title: string }
  | { kind: 'student'; id: string; name: string };

/**
 * Owns every mutation on the class page.
 *
 * Each mutation returns the whole class detail, so the query cache is seeded
 * from the server response rather than patched locally — the relationship
 * summary, both panels, and `updatedAt` can never drift apart. A failed
 * mutation leaves the dialog's selection untouched so the user can retry it.
 */
export function useClassDetailManager({
  academyId,
  classId,
  initialDetail,
  canAssignCourses,
  canEnroll,
}: {
  academyId: string;
  classId: string;
  initialDetail: ClassDetail;
  canAssignCourses: boolean;
  canEnroll: boolean;
}) {
  const queryClient = useQueryClient();
  const detailKey = ['academy', academyId, 'class', classId];
  const listKey = ['academy', academyId, 'classes'];
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(initialDetail.name);
  const [description, setDescription] = useState(initialDetail.description);
  const [assignOpen, setAssignOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [removing, setRemoving] = useState<PendingRemoval | null>(null);
  // The dialogs' draft selections live here rather than inside them: opening
  // seeds the draft, and a failed save deliberately leaves it untouched so the
  // user can retry without rebuilding it.
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedMembershipIds, setSelectedMembershipIds] = useState<string[]>(
    [],
  );

  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => orpc.academyClasses.get({ academyId, classId }),
    initialData: initialDetail,
    retry: false,
  });
  const detail = detailQuery.data;

  /** Only fetched while a dialog needs it, and only for who may open it. */
  const coursesQuery = useQuery({
    queryKey: ['academy', academyId, 'courses'],
    queryFn: () => orpc.academyCourses.list({ academyId }),
    enabled: canAssignCourses && assignOpen,
  });

  const eligibleQuery = useQuery({
    queryKey: ['academy', academyId, 'class', classId, 'eligible-students'],
    queryFn: () => orpc.academyClasses.listEligibleStudents({ academyId, classId }),
    enabled: canEnroll && enrollOpen,
  });

  const applyDetail = async (next: ClassDetail) => {
    queryClient.setQueryData(detailKey, next);
    await queryClient.invalidateQueries({ queryKey: listKey });
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      orpc.academyClasses.update({
        academyId,
        classId,
        name,
        description,
        expectedUpdatedAt: detail.updatedAt,
      }),
    onSuccess: async (next) => {
      setEditOpen(false);
      await applyDetail(next);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'ARCHIVED') =>
      orpc.academyClasses.setStatus({ academyId, classId, status }),
    onSuccess: async (next) => {
      setArchiveOpen(false);
      await applyDetail(next);
    },
  });

  const coursesMutation = useMutation({
    mutationFn: (courseIds: string[]) =>
      orpc.academyClasses.setCourses({
        academyId,
        classId,
        courseIds,
        expectedUpdatedAt: detail.updatedAt,
      }),
    onSuccess: async (next) => {
      setAssignOpen(false);
      setRemoving(null);
      await applyDetail(next);
    },
  });

  const addStudentsMutation = useMutation({
    mutationFn: (membershipIds: string[]) =>
      orpc.academyClasses.addStudents({ academyId, classId, membershipIds }),
    onSuccess: async (next) => {
      setEnrollOpen(false);
      await applyDetail(next);
      await queryClient.invalidateQueries({
        queryKey: ['academy', academyId, 'class', classId, 'eligible-students'],
      });
    },
  });

  const removeStudentMutation = useMutation({
    mutationFn: (membershipId: string) =>
      orpc.academyClasses.removeStudent({ academyId, classId, membershipId }),
    onSuccess: async (next) => {
      setRemoving(null);
      await applyDetail(next);
      await queryClient.invalidateQueries({
        queryKey: ['academy', academyId, 'class', classId, 'eligible-students'],
      });
    },
  });

  return {
    detail,
    loadError: detailQuery.isError ? detailQuery.error : null,

    editOpen,
    openEdit: () => {
      setName(detail.name);
      setDescription(detail.description);
      setEditOpen(true);
    },
    closeEdit: () => setEditOpen(false),
    name,
    setName,
    description,
    setDescription,
    saveDetails: () => updateMutation.mutate(),
    savePending: updateMutation.isPending,
    saveError: updateMutation.error,

    archiveOpen,
    openArchive: () => setArchiveOpen(true),
    closeArchive: () => setArchiveOpen(false),
    restore: () => statusMutation.mutate('ACTIVE'),
    archive: () => statusMutation.mutate('ARCHIVED'),
    statusPending: statusMutation.isPending,
    statusError: statusMutation.error,

    assignOpen,
    openAssign: () => {
      setSelectedCourseIds(detail.courses.map((course) => course.id));
      setAssignOpen(true);
    },
    closeAssign: () => setAssignOpen(false),
    academyCourses: (coursesQuery.data?.courses ?? []) as CourseSummary[],
    coursesLoading: coursesQuery.isLoading,
    selectedCourseIds,
    setSelectedCourseIds,
    saveCourses: () => coursesMutation.mutate(selectedCourseIds),
    coursesPending: coursesMutation.isPending,
    coursesError: coursesMutation.error,

    enrollOpen,
    openEnroll: () => {
      setSelectedMembershipIds([]);
      setEnrollOpen(true);
    },
    closeEnroll: () => setEnrollOpen(false),
    eligibleStudents: eligibleQuery.data?.students ?? [],
    eligibleLoading: eligibleQuery.isLoading,
    selectedMembershipIds,
    setSelectedMembershipIds,
    addStudents: () => addStudentsMutation.mutate(selectedMembershipIds),
    addPending: addStudentsMutation.isPending,
    addError: addStudentsMutation.error,

    removing,
    askRemoveCourse: (course: { id: string; title: string }) =>
      setRemoving({ kind: 'course', id: course.id, title: course.title }),
    askRemoveStudent: (student: EnrolledStudentSummary, name: string) =>
      setRemoving({ kind: 'student', id: student.membershipId, name }),
    cancelRemoval: () => setRemoving(null),
    confirmRemoval: () => {
      if (!removing) return;
      if (removing.kind === 'course') {
        coursesMutation.mutate(
          detail.courses
            .filter((course) => course.id !== removing.id)
            .map((course) => course.id),
        );
        return;
      }
      removeStudentMutation.mutate(removing.id);
    },
    removalPending:
      removeStudentMutation.isPending ||
      (coursesMutation.isPending && removing?.kind === 'course'),
    removalError: removeStudentMutation.error ?? coursesMutation.error,
  };
}

export type ClassDetailManagerState = ReturnType<typeof useClassDetailManager>;
