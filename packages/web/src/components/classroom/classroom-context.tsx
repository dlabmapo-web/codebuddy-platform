"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ClipboardCheck, Maximize2 } from 'lucide-react';
import { classroomMaterials, type Classroom, type MonitoringPublicExercise } from '@cove/shared';
import { routes } from '@/lib/routes';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { StudentSwitcher } from '@/components/monitoring/student-switcher';
import { LiveHelpQueue } from '@/components/monitoring/help-queue';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { MonitorHistoryHost, MonitoringLiveContent, MonitoringTutorOutlet } from '@/components/student-history/monitor-history';
import { HistoryPresentationContext } from '@/lib/monitoring/history-presentation';
import { useReviewTranslation } from '@/components/programming-review/use-review-translation';
import { LiveHeader } from '@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-header';
import { useClassLive } from './class-live-provider';
import { ClassroomOutline } from './classroom-outline';
import styles from './classroom-frame.module.css';

export type ClassroomLabels = Record<'teaching' | 'notice' | 'lessons' | 'exit' | 'fullscreen' | 'previous' | 'next' | 'empty' | 'saveFailed' | 'closeOutline', string>;
type NavigationGuard = () => boolean | Promise<boolean>;
interface ClassroomContextValue {
  classroom: Classroom;
  academyId: string;
  outlineOpen: boolean;
  setOutlineOpen: (open: boolean) => void;
  prepareNavigation: () => Promise<boolean>;
  materials: ReturnType<typeof classroomMaterials>;
  materialId?: string;
  labels: ClassroomLabels;
  exitHref: string;
  materialHref: (id: string) => string;
  navigate: (href: string) => Promise<void>;
  registerGuard: (guard: NavigationGuard) => () => void;
  pending: boolean;
  error: boolean;
  toolbarOutlet: HTMLDivElement | null;
  setHeaderExercise: (exercise: MonitoringPublicExercise | null) => void;
  headerExercise: MonitoringPublicExercise | null;
}
const ClassroomContext = createContext<ClassroomContextValue | null>(null);
export const useClassroom = () => useContext(ClassroomContext);

export function ClassroomProvider({ classroom, academyId, academySlug, materialId, labels, children }: {
  classroom: Classroom; academyId: string; academySlug: string; materialId?: string; labels: ClassroomLabels; children: ReactNode;
}) {
  return <MonitorHistoryHost academyId={academyId} classId={classroom.class.id} name={labels.teaching}>
    <ClassroomFrame classroom={classroom} academyId={academyId} academySlug={academySlug} materialId={materialId} labels={labels}>{children}</ClassroomFrame>
  </MonitorHistoryHost>;
}

function ClassroomFrame({ classroom, academyId, academySlug, materialId, labels, children }: {
  classroom: Classroom; academyId: string; academySlug: string; materialId?: string; labels: ClassroomLabels; children: ReactNode;
}) {
  const router = useRouter();
  const history = useContext(HistoryPresentationContext);
  const prepareMaterialChange = history?.prepareMaterialChange;
  const [toolbarOutlet, setToolbarOutlet] = useState<HTMLDivElement | null>(null);
  const [headerExercise, setHeaderExercise] = useState<MonitoringPublicExercise | null>(null);
  const panel = useNavigatorPanel('classroom-curriculum');
  const outlineOpen = panel.open;
  const setOutlineOpen = (open: boolean) => { if (!open) panel.close(); else if (!panel.open) panel.toggle(); };
  const guard = useRef<NavigationGuard | null>(null);
  const navigating = useRef(false);
  const [pending, setPending] = useState(false);
  const [routePending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const materials = useMemo(() => classroomMaterials(classroom), [classroom]);
  const registerGuard = useCallback((next: NavigationGuard) => {
    guard.current = next;
    return () => { if (guard.current === next) guard.current = null; };
  }, []);
  const prepareNavigation = useCallback(async () => {
    if (navigating.current) return false;
    navigating.current = true;
    setPending(true);
    setError(false);
    try {
      if (guard.current && !(await guard.current())) return false;
      return prepareMaterialChange?.() !== false;
    }
    catch { setError(true); return false; }
    finally { navigating.current = false; setPending(false); }
  }, [prepareMaterialChange]);
  const setLeaveGuard = history?.setLeaveGuard;
  const setMaterial = history?.setMaterial;
  const selected = materials.find(material => material.id === materialId);
  useEffect(() => {
    setLeaveGuard?.(prepareNavigation);
    return () => setLeaveGuard?.(null);
  }, [prepareNavigation, setLeaveGuard]);
  useEffect(() => {
    setMaterial?.(selected?.id ?? null, selected?.courseId, selected?.type, selected?.title);
  }, [setMaterial, selected?.id, selected?.courseId, selected?.type, selected?.title]);
  async function navigate(href: string) {
    if (await prepareNavigation()) startTransition(() => router.push(href));
  }

  return <ClassroomContext value={{ classroom, academyId, outlineOpen, setOutlineOpen, prepareNavigation, materials, materialId, labels,
    exitHref: routes.academyTeachClass(academySlug, classroom.class.id),
    materialHref: id => routes.academyClassroomMaterial(academySlug, classroom.class.id, id),
    navigate, registerGuard, pending: pending || routePending, error, toolbarOutlet, headerExercise, setHeaderExercise }}>
    <div className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink" data-testid="classroom-workspace">
      <ClassroomLessonHeader triggerRef={panel.triggerRef} setToolbarOutlet={setToolbarOutlet} />
      <div className="relative flex min-h-0 flex-1"><MonitoringLiveContent><ClassroomOutline /><div className={`${styles.lesson} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>{children}</div></MonitoringLiveContent><MonitoringTutorOutlet /></div>
    </div>
  </ClassroomContext>;
}

/** Keep the real workspace's permission-gated actions alive in the shared toolbar. */
export function ClassroomWorkspaceActions({ exercise = null, children }: { exercise?: MonitoringPublicExercise | null; children: ReactNode }) {
  const classroom = useClassroom();
  const setHeaderExercise = classroom?.setHeaderExercise;
  useEffect(() => {
    setHeaderExercise?.(exercise);
    return () => setHeaderExercise?.(null);
  }, [exercise, setHeaderExercise]);
  return classroom?.toolbarOutlet ? createPortal(children, classroom.toolbarOutlet) : null;
}

/** Each workspace keeps its own save/confirmation/runtime semantics. */
export function useClassroomNavigationGuard(guard: NavigationGuard) {
  const classroom = useClassroom();
  const register = classroom?.registerGuard;
  useEffect(() => register?.(guard), [register, guard]);
}

const buttonBase = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40';
const button = `${buttonBase} border-border bg-card text-ink hover:bg-brand-soft`;
const primaryButton = `${buttonBase} border-transparent bg-brand text-on-brand hover:bg-brand-deep`;

export function ClassroomLessonHeader({ triggerRef, setToolbarOutlet }: { triggerRef?: ReturnType<typeof useNavigatorPanel>['triggerRef']; setToolbarOutlet?: (element: HTMLDivElement | null) => void }) {
  const context = useClassroom();
  const history = useContext(HistoryPresentationContext);
  const reviewT = useReviewTranslation();
  const live = useClassLive(context?.academyId, context?.classroom.class.id);
  if (!context) return null;
  const { classroom, academyId, materials, materialId, labels, pending, navigate } = context;
  const selected = materials.find(material => material.id === materialId);
  const course = classroom.courses.find(course => course.id === selected?.courseId);
  const courseModule = course?.modules.find(module => module.lectures.some(lecture => lecture.materials.some(material => material.id === materialId)));
  const lecture = courseModule?.lectures.find(lecture => lecture.materials.some(material => material.id === materialId));
  const path = selected && course && courseModule && lecture ? { course: { id: course.id, title: course.title }, module: { id: courseModule.id, title: courseModule.title }, lecture: { id: lecture.id, title: lecture.title }, exercise: { materialId: selected.id, title: selected.title } } : null;
  return <>
    <LiveHeader classId={classroom.class.id} onLeave={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault(); void navigate(context.exitHref);
    }} connection={live?.presence.state ?? 'connecting'} exercise={context.headerExercise} unsaved={false}
      saveStatusHint={labels.notice}
      materialTitle={selected?.title ?? labels.teaching} liveStatus={[selected?.courseTitle, selected?.lectureTitle].filter(Boolean).join(' / ')} saveStatus={labels.teaching}
      curriculum={<CurriculumTrigger ref={triggerRef} open={context.outlineOpen} panelId="classroom-curriculum" onToggle={() => context.setOutlineOpen(!context.outlineOpen)} path={path} />}
      studentSwitcher={<StudentSwitcher classroom academyId={academyId} classId={classroom.class.id} membershipId="" name={labels.teaching} className={classroom.class.name} prepare={context.prepareNavigation} />}
      helpQueue={live ? <LiveHelpQueue academyId={academyId} classId={classroom.class.id} prepare={context.prepareNavigation} /> : undefined}
      gradingAction={selected && ['PROGRAMMING_EXERCISE', 'WRITTEN_RESPONSE', 'TURTLE_EXERCISE', 'MULTIPLE_CHOICE'].includes(selected.type) ? <button type="button" disabled={pending} className={`${buttonBase} border-brand/25 bg-brand-soft text-brand hover:bg-brand/10`} onClick={() => history?.open('material')}><ClipboardCheck aria-hidden className="size-4" />{reviewT('grade_submission')}</button> : undefined}
      answer={<div ref={setToolbarOutlet} className="contents" />} />
    {context.error ? <p role="alert" className="border-b border-border bg-card px-4 py-2 text-sm text-danger">{labels.saveFailed}</p> : null}
  </>;
}

export function ClassroomLessonFooter({ disabled = false }: { disabled?: boolean }) {
  const context = useClassroom();
  if (!context) return null;
  const { materials, materialId, labels, pending, navigate, materialHref } = context;
  const index = materials.findIndex(material => material.id === materialId);
  return <footer className="relative flex min-h-14 shrink-0 items-center justify-center gap-4 border-t border-border bg-card px-4 py-2 pr-12">
    <button type="button" className={button} disabled={disabled || pending || index <= 0} onClick={() => void navigate(materialHref(materials[index - 1].id))}><ChevronLeft aria-hidden className="size-4" />{labels.previous}</button>
    <span className="text-xs font-semibold tabular-nums text-sub" aria-live="polite">{index + 1} / {materials.length}</span>
    <button type="button" className={primaryButton} disabled={disabled || pending || index < 0 || index + 1 >= materials.length} onClick={() => void navigate(materialHref(materials[index + 1].id))}>{labels.next}<ChevronRight aria-hidden className="size-4" /></button>
    <button type="button" className="absolute right-3 grid size-9 place-items-center rounded-lg text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand" aria-label={labels.fullscreen} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen?.(); else void document.documentElement.requestFullscreen?.().catch(() => undefined); }}><Maximize2 aria-hidden className="size-4" /></button>
  </footer>;
}

export function EmptyClassroom() {
  const context = useClassroom();
  return <main className="flex h-dvh flex-col bg-canvas text-ink"><p className="grid flex-1 place-items-center p-8 text-center text-sub">{context?.labels.empty}</p></main>;
}
