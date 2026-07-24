'use client';

import type { CourseDraftTree, ContentValidationIssue } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';
import { VersionChip } from '../../../../../_components/version-marks';

type Tree = CourseDraftTree;
type Module = Tree['modules'][number];
type Lecture = Module['lectures'][number];

export function CourseBuilder({
  academyId,
  courseId,
  versionId,
  initialTree,
}: {
  academyId: string;
  courseId: string;
  versionId: string;
  initialTree: Tree;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = ['academy', academyId, 'course-version', versionId];
  const target = { academyId, courseId, versionId };

  const [moduleTitle, setModuleTitle] = useState('');
  const [lectureModuleId, setLectureModuleId] = useState<string | null>(null);
  const [lectureTitle, setLectureTitle] = useState('');
  const [issues, setIssues] = useState<ContentValidationIssue[] | null>(null);

  const tree = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.getDraftTree(target),
    initialData: initialTree,
    retry: false,
  });
  const data = tree.data;
  const editable = data.version.status === 'DRAFT';

  /** Every structural mutation returns the whole tree, so writes replace the cache. */
  const applyTree = (next: Tree) => {
    queryClient.setQueryData(queryKey, next);
    setIssues(null);
  };

  const createModule = useMutation({
    mutationFn: () =>
      orpc.academyCourses.createModule({ ...target, title: moduleTitle, description: '' }),
    onSuccess: (next) => {
      applyTree(next);
      setModuleTitle('');
    },
  });
  const updateModule = useMutation({
    mutationFn: (input: { moduleId: string; title: string }) =>
      orpc.academyCourses.updateModule({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const deleteModule = useMutation({
    mutationFn: (moduleId: string) =>
      orpc.academyCourses.deleteModule({ ...target, moduleId }),
    onSuccess: applyTree,
  });
  const reorderModules = useMutation({
    mutationFn: (orderedModuleIds: string[]) =>
      orpc.academyCourses.reorderModules({ ...target, orderedModuleIds }),
    onSuccess: applyTree,
  });
  const createLecture = useMutation({
    mutationFn: () =>
      orpc.academyCourses.createLecture({
        ...target,
        moduleId: lectureModuleId!,
        title: lectureTitle,
        description: '',
      }),
    onSuccess: (next) => {
      applyTree(next);
      setLectureModuleId(null);
      setLectureTitle('');
    },
  });
  const updateLecture = useMutation({
    mutationFn: (input: { lectureId: string; title: string }) =>
      orpc.academyCourses.updateLecture({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const deleteLecture = useMutation({
    mutationFn: (lectureId: string) =>
      orpc.academyCourses.deleteLecture({ ...target, lectureId }),
    onSuccess: applyTree,
  });
  const reorderLectures = useMutation({
    mutationFn: (input: { moduleId: string; orderedLectureIds: string[] }) =>
      orpc.academyCourses.reorderLectures({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const validate = useMutation({
    mutationFn: () => orpc.academyCourses.validateVersion(target),
    onSuccess: (result) => setIssues(result.issues),
  });
  const publish = useMutation({
    mutationFn: () => orpc.academyCourses.publishVersion(target),
    onSuccess: () => {
      router.push(`/studio/academies/${academyId}/content/courses`);
      router.refresh();
    },
  });
  const startNextDraft = useMutation({
    mutationFn: () => orpc.academyCourses.createDraft({ academyId, courseId }),
    onSuccess: (course) => {
      if (course.draftVersion) {
        router.push(
          `/studio/academies/${academyId}/content/courses/${courseId}/versions/${course.draftVersion.id}`,
        );
      }
    },
  });

  const structuralError =
    createModule.isError ||
    updateModule.isError ||
    deleteModule.isError ||
    reorderModules.isError ||
    createLecture.isError ||
    updateLecture.isError ||
    deleteLecture.isError ||
    reorderLectures.isError;

  const moduleIds = data.modules.map((item) => item.id);
  const lectureCount = data.modules.reduce(
    (total, item) => total + item.lectures.length,
    0,
  );
  const issuesByModule = new Map<string, number>();
  for (const issue of issues ?? []) {
    if (!issue.moduleId) continue;
    issuesByModule.set(issue.moduleId, (issuesByModule.get(issue.moduleId) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-sub transition-colors hover:text-ink"
        href={`/studio/academies/${academyId}/content/courses`}
      >
        <ArrowLeft className="size-3.5" />
        All courses
      </Link>

      {editable ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/25 bg-brand-soft px-5 py-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <h2 className="text-[14px] font-bold text-brand">
                Version {data.version.versionNumber} is published and read-only
              </h2>
              <p className="mt-1 text-[13.5px] leading-[1.55] text-brand-deep/80">
                Classes rely on this exact content. To change it, start the next
                draft — it opens as a copy of this version.
              </p>
            </div>
          </div>
          <button
            className="h-10 shrink-0 rounded-lg bg-brand px-4 text-[14px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={startNextDraft.isPending}
            onClick={() => startNextDraft.mutate()}
            type="button"
          >
            {startNextDraft.isPending ? 'Starting…' : 'Start next draft'}
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-3">
          {data.modules.length === 0 ? (
            <div className="rounded-card border border-dashed border-border bg-white px-6 py-12 text-center">
              <h3 className="text-[15.5px] font-bold">Start with a module</h3>
              <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-[1.55] text-sub">
                A module is a chunk of the course — “Loops”, “Functions”. Lectures
                live inside it, and exercises live inside lectures.
              </p>
            </div>
          ) : (
            data.modules.map((courseModule, index) => (
              <ModuleCard
                addingLecture={lectureModuleId === courseModule.id}
                courseModule={courseModule}
                editable={editable}
                index={index}
                issueCount={issuesByModule.get(courseModule.id) ?? 0}
                key={courseModule.id}
                lectureTitle={lectureTitle}
                moduleCount={data.modules.length}
                onAddLecture={() => createLecture.mutate()}
                onCancelLecture={() => setLectureModuleId(null)}
                onDelete={() => deleteModule.mutate(courseModule.id)}
                onDeleteLecture={(lectureId) => deleteLecture.mutate(lectureId)}
                onLectureTitleChange={setLectureTitle}
                onMove={(direction) =>
                  reorderModules.mutate(swap(moduleIds, index, index + direction))
                }
                onMoveLecture={(lectureIndex, direction) =>
                  reorderLectures.mutate({
                    moduleId: courseModule.id,
                    orderedLectureIds: swap(
                      courseModule.lectures.map((item) => item.id),
                      lectureIndex,
                      lectureIndex + direction,
                    ),
                  })
                }
                onRename={(title) =>
                  updateModule.mutate({ moduleId: courseModule.id, title })
                }
                onRenameLecture={(lectureId, title) =>
                  updateLecture.mutate({ lectureId, title })
                }
                onStartLecture={() => {
                  setLectureModuleId(courseModule.id);
                  setLectureTitle('');
                }}
                savingLecture={createLecture.isPending}
              />
            ))
          )}

          {editable ? (
            <form
              className="flex flex-wrap gap-2 rounded-card border border-dashed border-border bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                createModule.mutate();
              }}
            >
              <input
                className="h-10 min-w-48 flex-1 rounded-lg border border-border bg-white px-3 text-[14px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => setModuleTitle(event.target.value)}
                placeholder="New module title — e.g. Conditionals"
                value={moduleTitle}
              />
              <button
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
                disabled={createModule.isPending || !moduleTitle.trim()}
                type="submit"
              >
                <Plus className="size-4" />
                {createModule.isPending ? 'Adding…' : 'Add module'}
              </button>
            </form>
          ) : null}

          {structuralError ? (
            <p className="text-[13px] font-semibold text-danger">
              That change did not save. Reload the page to see the current draft.
            </p>
          ) : null}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-card border border-border bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-sub">
                This version
              </h2>
              <VersionChip
                state={
                  data.version.status === 'DRAFT'
                    ? 'draft'
                    : data.version.status === 'PUBLISHED'
                      ? 'published'
                      : 'retired'
                }
                versionNumber={data.version.versionNumber}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Modules" value={data.modules.length} />
              <Stat label="Lectures" value={lectureCount} />
            </dl>

            {editable ? (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <button
                  className="h-10 w-full rounded-lg border border-border bg-white text-[14px] font-bold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                  disabled={validate.isPending}
                  onClick={() => validate.mutate()}
                  type="button"
                >
                  {validate.isPending ? 'Checking…' : 'Check before publishing'}
                </button>
                <button
                  className="h-10 w-full rounded-lg bg-brand text-[14px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
                  disabled={publish.isPending || issues === null || issues.length > 0}
                  onClick={() => publish.mutate()}
                  type="button"
                >
                  {publish.isPending
                    ? 'Publishing…'
                    : `Publish v${data.version.versionNumber}`}
                </button>
                <p className="text-[12.5px] leading-[1.55] text-sub">
                  {issues === null
                    ? 'Run the check to unlock publishing.'
                    : issues.length === 0
                      ? 'Publishing freezes this version and makes it the one classes use.'
                      : 'Fix the items below, then check again.'}
                </p>
                {publish.isError ? (
                  <p className="text-[12px] font-semibold text-danger">
                    Publishing was refused. Run the check again for the current
                    blockers.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {issues !== null ? (
            <div
              className={`rounded-card border p-5 ${
                issues.length === 0
                  ? 'border-success/30 bg-success/5'
                  : 'border-draft/30 bg-draft-soft'
              }`}
            >
              {issues.length === 0 ? (
                <p className="flex items-center gap-2 text-[14px] font-bold text-success">
                  <Check className="size-4" />
                  Ready to publish
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-[14px] font-bold text-draft">
                    <TriangleAlert className="size-4" />
                    {issues.length} item{issues.length === 1 ? '' : 's'} to fix
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {issues.map((issue) => (
                      <li
                        className="text-[13.5px] leading-[1.55] text-draft"
                        key={`${issue.path}-${issue.code}`}
                      >
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}

          <p className="px-1 text-[12.5px] leading-[1.55] text-sub">
            Programming exercises, test cases, and Excel import arrive in the next
            release. Modules and lectures you write now carry over.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ModuleCard({
  addingLecture,
  courseModule,
  editable,
  index,
  issueCount,
  lectureTitle,
  moduleCount,
  onAddLecture,
  onCancelLecture,
  onDelete,
  onDeleteLecture,
  onLectureTitleChange,
  onMove,
  onMoveLecture,
  onRename,
  onRenameLecture,
  onStartLecture,
  savingLecture,
}: {
  addingLecture: boolean;
  courseModule: Module;
  editable: boolean;
  index: number;
  issueCount: number;
  lectureTitle: string;
  moduleCount: number;
  onAddLecture: () => void;
  onCancelLecture: () => void;
  onDelete: () => void;
  onDeleteLecture: (lectureId: string) => void;
  onLectureTitleChange: (value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onMoveLecture: (lectureIndex: number, direction: -1 | 1) => void;
  onRename: (title: string) => void;
  onRenameLecture: (lectureId: string, title: string) => void;
  onStartLecture: () => void;
  savingLecture: boolean;
}) {
  return (
    <article
      className={`overflow-hidden rounded-card border bg-white ${
        issueCount > 0 ? 'border-draft/50' : 'border-border'
      }`}
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft font-mono text-[13px] font-bold tabular-nums text-brand">
          {courseModule.position}
        </span>
        <div className="min-w-0 flex-1">
          <EditableTitle
            className="text-[15px] font-bold tracking-[-0.01em]"
            editable={editable}
            onSave={onRename}
            value={courseModule.title}
          />
          <p className="text-[12px] text-sub">
            {courseModule.lectures.length} lecture
            {courseModule.lectures.length === 1 ? '' : 's'}
            {issueCount > 0 ? (
              <span className="ml-2 font-semibold text-draft">
                · {issueCount} to fix
              </span>
            ) : null}
          </p>
        </div>
        {editable ? (
          <div className="flex items-center gap-0.5">
            <MoveButtons
              canMoveDown={index < moduleCount - 1}
              canMoveUp={index > 0}
              label="module"
              onMove={onMove}
            />
            <DeleteButton
              label={`module “${courseModule.title}” and its lectures`}
              onDelete={onDelete}
            />
          </div>
        ) : null}
      </header>

      <ul className="divide-y divide-border">
        {courseModule.lectures.map((lecture, lectureIndex) => (
          <LectureRow
            editable={editable}
            index={lectureIndex}
            key={lecture.id}
            lecture={lecture}
            lectureCount={courseModule.lectures.length}
            onDelete={() => onDeleteLecture(lecture.id)}
            onMove={(direction) => onMoveLecture(lectureIndex, direction)}
            onRename={(title) => onRenameLecture(lecture.id, title)}
          />
        ))}
      </ul>

      {editable ? (
        addingLecture ? (
          <form
            className="flex flex-wrap gap-2 border-t border-border bg-canvas p-3"
            onSubmit={(event) => {
              event.preventDefault();
              onAddLecture();
            }}
          >
            <input
              autoFocus
              className="h-9 min-w-40 flex-1 rounded-lg border border-border bg-white px-3 text-[14px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
              maxLength={200}
              onChange={(event) => onLectureTitleChange(event.target.value)}
              placeholder="Lecture title"
              value={lectureTitle}
            />
            <button
              className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={savingLecture || !lectureTitle.trim()}
              type="submit"
            >
              Add lecture
            </button>
            <button
              className="h-9 px-2 text-[13.5px] font-semibold text-sub transition-colors hover:text-ink"
              onClick={onCancelLecture}
              type="button"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-[13px] font-bold text-brand transition-colors hover:bg-brand-soft/50"
            onClick={onStartLecture}
            type="button"
          >
            <Plus className="size-3.5" />
            Add lecture
          </button>
        )
      ) : null}
    </article>
  );
}

function LectureRow({
  editable,
  index,
  lecture,
  lectureCount,
  onDelete,
  onMove,
  onRename,
}: {
  editable: boolean;
  index: number;
  lecture: Lecture;
  lectureCount: number;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onRename: (title: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-6 shrink-0 font-mono text-[12px] tabular-nums text-sub">
        {lecture.position.toString().padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <EditableTitle
          className="text-[14px] font-semibold"
          editable={editable}
          onSave={onRename}
          value={lecture.title}
        />
      </div>
      <span className="shrink-0 text-[12px] text-sub">
        {lecture.materials.length === 0
          ? 'No exercises'
          : `${lecture.materials.length} exercise${lecture.materials.length === 1 ? '' : 's'}`}
      </span>
      {editable ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <MoveButtons
            canMoveDown={index < lectureCount - 1}
            canMoveUp={index > 0}
            label="lecture"
            onMove={onMove}
          />
          <DeleteButton label={`lecture “${lecture.title}”`} onDelete={onDelete} />
        </div>
      ) : null}
    </li>
  );
}

/** Click the title to rename in place; Escape abandons the edit. */
function EditableTitle({
  className,
  editable,
  onSave,
  value,
}: {
  className: string;
  editable: boolean;
  onSave: (title: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable || draft === null) {
    return editable ? (
      <button
        className={`${className} block max-w-full truncate rounded text-left transition-colors hover:text-brand`}
        onClick={() => setDraft(value)}
        title="Rename"
        type="button"
      >
        {value}
      </button>
    ) : (
      <p className={`${className} truncate`}>{value}</p>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setDraft(null);
  };

  return (
    <input
      autoFocus
      className={`${className} w-full rounded border border-brand bg-white px-1.5 py-0.5 outline-none ring-2 ring-brand/20`}
      maxLength={200}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
      value={draft}
    />
  );
}

function MoveButtons({
  canMoveDown,
  canMoveUp,
  label,
  onMove,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  label: string;
  onMove: (direction: -1 | 1) => void;
}) {
  const buttonClass =
    'grid size-7 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent';
  return (
    <>
      <button
        aria-label={`Move ${label} up`}
        className={buttonClass}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
        type="button"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        aria-label={`Move ${label} down`}
        className={buttonClass}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
        type="button"
      >
        <ChevronDown className="size-4" />
      </button>
    </>
  );
}

/** Two-step delete: the second click confirms, so nothing vanishes by accident. */
function DeleteButton({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="flex items-center gap-1">
        <button
          className="h-7 rounded-md bg-danger px-2 text-[12px] font-bold text-white"
          onClick={() => {
            setArmed(false);
            onDelete();
          }}
          type="button"
        >
          Delete
        </button>
        <button
          className="h-7 px-1.5 text-[12px] font-semibold text-sub"
          onClick={() => setArmed(false)}
          type="button"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      aria-label={`Delete ${label}`}
      className="grid size-7 place-items-center rounded-md text-sub transition-colors hover:bg-danger/10 hover:text-danger"
      onClick={() => setArmed(true)}
      type="button"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-canvas px-3 py-2.5">
      <dt className="text-[12px] font-semibold text-sub">{label}</dt>
      <dd className="font-mono text-[18px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function swap(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
