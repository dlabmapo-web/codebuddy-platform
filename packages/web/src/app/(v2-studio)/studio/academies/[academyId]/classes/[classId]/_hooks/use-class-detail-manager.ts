'use client';

import type {
  ClassDetail,
  ClassScheduleSlotInput,
  CourseSummary,
  EnrolledStudentSummary,
} from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

/** What the confirmation dialog is currently asking about. */
export type PendingRemoval =
  | { kind: 'course'; id: string; title: string }
  | { kind: 'student'; id: string; name: string }
  | { kind: 'teacher'; id: string; name: string };

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
  canAssignTeacher,
}: {
  academyId: string;
  classId: string;
  initialDetail: ClassDetail;
  canAssignCourses: boolean;
  canEnroll: boolean;
  canAssignTeacher: boolean;
}) {
  const queryClient = useQueryClient();
  const detailKey = ['academy', academyId, 'class', classId];
  const listKey = ['academy', academyId, 'classes'];
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(initialDetail.name);
  const [description, setDescription] = useState(initialDetail.description);
  const [assignOpen, setAssignOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [removing, setRemoving] = useState<PendingRemoval | null>(null);
  // The dialogs' draft selections live here rather than inside them: opening
  // seeds the draft, and a failed save deliberately leaves it untouched so the
  // user can retry without rebuilding it.
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedMembershipIds, setSelectedMembershipIds] = useState<string[]>(
    [],
  );
  // One id, never an array: a class has one teacher, and a draft that could
  // hold two would let the UI offer a state the API has no way to store.
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    null,
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

  const eligibleTeachersQuery = useQuery({
    queryKey: ['academy', academyId, 'class', classId, 'eligible-teachers'],
    queryFn: () => orpc.academyClasses.listEligibleTeachers({ academyId, classId }),
    enabled: canAssignTeacher && teacherOpen,
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

  /**
   * The whole timetable at once, against the class revision the page loaded.
   *
   * Like every other mutation here it returns the full detail, so the panel is
   * seeded from the server's ordering rather than from the order the manager
   * happened to type the rows in.
   */
  const scheduleMutation = useMutation({
    mutationFn: (slots: ClassScheduleSlotInput[]) =>
      orpc.academyClasses.setSchedule({
        academyId,
        classId,
        slots,
        expectedUpdatedAt: detail.updatedAt,
      }),
    onSuccess: async (next) => {
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

  /**
   * Assign, replace, and remove are the same call with a different argument,
   * so they share one mutation — and one place where a stale revision is
   * reported rather than silently retried against the newer class.
   */
  const teacherMutation = useMutation({
    mutationFn: (teacherMembershipId: string | null) =>
      orpc.academyClasses.setTeacher({
        academyId,
        classId,
        teacherMembershipId,
        expectedUpdatedAt: detail.updatedAt,
      }),
    onSuccess: async (next) => {
      setTeacherOpen(false);
      setRemoving(null);
      await applyDetail(next);
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

    teacherOpen,
    openTeacher: () => {
      teacherMutation.reset();
      // The current teacher opens selected when they are still eligible, so
      // replacing starts from the truth rather than from an empty control.
      setSelectedTeacherId(detail.assignedTeacher?.membershipId ?? null);
      setTeacherOpen(true);
    },
    closeTeacher: () => setTeacherOpen(false),
    eligibleTeachers: eligibleTeachersQuery.data?.teachers ?? [],
    eligibleTeachersLoading: eligibleTeachersQuery.isLoading,
    eligibleTeachersError: eligibleTeachersQuery.error,
    retryEligibleTeachers: () => eligibleTeachersQuery.refetch(),
    selectedTeacherId,
    setSelectedTeacherId,
    saveTeacher: () => teacherMutation.mutate(selectedTeacherId),
    teacherPending: teacherMutation.isPending,
    teacherError: teacherMutation.error,

    saveSchedule: (slots: ClassScheduleSlotInput[]) =>
      scheduleMutation.mutate(slots),
    resetSchedule: () => scheduleMutation.reset(),
    schedulePending: scheduleMutation.isPending,
    scheduleError: scheduleMutation.error,
    scheduleSaved: scheduleMutation.isSuccess,

    removing,
    askRemoveCourse: (course: { id: string; title: string }) => {
      coursesMutation.reset();
      setRemoving({ kind: 'course', id: course.id, title: course.title });
    },
    askRemoveStudent: (student: EnrolledStudentSummary, name: string) => {
      removeStudentMutation.reset();
      setRemoving({ kind: 'student', id: student.membershipId, name });
    },
    askRemoveTeacher: (teacher: { membershipId: string }, name: string) => {
      teacherMutation.reset();
      setRemoving({ kind: 'teacher', id: teacher.membershipId, name });
    },
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
      if (removing.kind === 'teacher') {
        teacherMutation.mutate(null);
        return;
      }
      removeStudentMutation.mutate(removing.id);
    },
    removalPending:
      removeStudentMutation.isPending ||
      (coursesMutation.isPending && removing?.kind === 'course') ||
      (teacherMutation.isPending && removing?.kind === 'teacher'),
    removalError:
      removing?.kind === 'student'
        ? removeStudentMutation.error
        : removing?.kind === 'course'
          ? coursesMutation.error
          : removing?.kind === 'teacher'
            ? teacherMutation.error
            : null,
  };
}

export type ClassDetailManagerState = ReturnType<typeof useClassDetailManager>;
