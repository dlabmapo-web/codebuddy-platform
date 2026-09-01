'use client';

import { useContentBasePath } from '@/components/studio/content-base-path-provider';

import type { ClassSummary } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

/**
 * Owns table, modal, and mutation state for the Classes list.
 *
 * Local state only ever moves on a successful server response — a failed
 * create keeps the typed name so the user can correct it rather than retype
 * it. The query key carries `academyId`, so switching academies cannot serve
 * another academy's cached rows.
 */
export function useClassesManager({
  academyId,
  initialClasses,
}: {
  academyId: string;
  initialClasses: ClassSummary[];
}) {
  const contentPaths = useContentBasePath();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ClassSummary | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryKey = ['academy', academyId, 'classes'];

  const classesQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyClasses.list({ academyId }),
    initialData: { classes: initialClasses },
    retry: false,
  });

  const closeForm = () => {
    setShowCreate(false);
    setEditing(null);
    setName('');
    setDescription('');
  };

  const createMutation = useMutation({
    mutationFn: () =>
      orpc.academyClasses.create({ academyId, name, description }),
    onSuccess: async (created) => {
      closeForm();
      await queryClient.invalidateQueries({ queryKey });
      // Creation stays small on purpose; the class page is where courses and
      // students are added, so go straight there.
      router.push(contentPaths.class(created.id));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      orpc.academyClasses.update({
        academyId,
        classId: editing!.id,
        name,
        description,
        expectedUpdatedAt: editing!.updatedAt,
      }),
    onSuccess: async () => {
      closeForm();
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { classId: string; status: 'ACTIVE' | 'ARCHIVED' }) =>
      orpc.academyClasses.setStatus({ academyId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  /**
   * Destroy a class outright.
   *
   * Archiving stays the ordinary end of a class and keeps its history; this is
   * for one created by mistake. The server refuses it once anybody has
   * submitted through the class, which is the guarantee that matters — this
   * hook only carries the name back for the confirmation.
   */
  const deleteMutation = useMutation({
    mutationFn: (input: { classId: string; confirmName: string }) =>
      orpc.academyClasses.delete({ academyId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    classes: classesQuery.data.classes,
    // A retryable refetch failure keeps the last good snapshot on screen; the
    // banner says so rather than blanking the table.
    loadError: classesQuery.isError ? classesQuery.error : null,
    editing,
    formOpen: showCreate || editing !== null,
    openCreate: () => {
      setEditing(null);
      setName('');
      setDescription('');
      setShowCreate(true);
    },
    openEdit: (record: ClassSummary) => {
      setShowCreate(false);
      setEditing(record);
      setName(record.name);
      setDescription(record.description);
    },
    closeForm,
    name,
    setName,
    description,
    setDescription,
    submit: () => (editing ? updateMutation.mutate() : createMutation.mutate()),
    submitPending: createMutation.isPending || updateMutation.isPending,
    submitError: createMutation.error ?? updateMutation.error,
    setStatus: (classId: string, status: 'ACTIVE' | 'ARCHIVED') =>
      statusMutation.mutate({ classId, status }),
    statusPendingId: statusMutation.isPending
      ? statusMutation.variables.classId
      : null,
    statusError: statusMutation.error,
    deleteClass: (classId: string, confirmName: string) =>
      deleteMutation.mutateAsync({ classId, confirmName }),
    deletePending: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}

export type ClassesManagerState = ReturnType<typeof useClassesManager>;
