export const COLLABORATION_SURFACE_ATTRIBUTE = 'data-collaboration-surface';

export const COLLABORATION_SURFACES = [
  'header',
  'curriculum',
  'statement',
  'editor',
  'terminal',
] as const;

export type CollaborationSurface = (typeof COLLABORATION_SURFACES)[number];

export type StudentPointerMovePayload = {
  senderId: string;
  sessionId: string;
  problemId: string;
  name: string;
  role: 'student';
  surface: CollaborationSurface;
  xPct: number;
  yPct: number;
  sentAt: number;
};

export type StudentPointerLeavePayload = Pick<
  StudentPointerMovePayload,
  'senderId' | 'sessionId' | 'problemId' | 'role'
>;

type PointerRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

type ExpectedStudentPointerScope = {
  studentId: string;
  sessionId: string;
  problemId: string;
};

const SURFACE_SET = new Set<string>(COLLABORATION_SURFACES);

export function isCollaborationSurface(
  value: unknown
): value is CollaborationSurface {
  return typeof value === 'string' && SURFACE_SET.has(value);
}

export function clampPointerPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizePointerPosition(
  clientX: number,
  clientY: number,
  rect: PointerRect
): { xPct: number; yPct: number } | null {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  return {
    xPct: clampPointerPercentage((clientX - rect.left) / rect.width),
    yPct: clampPointerPercentage((clientY - rect.top) / rect.height),
  };
}

export function collaborationSurfaceSelector(
  surface: CollaborationSurface
): string {
  return `[${COLLABORATION_SURFACE_ATTRIBUTE}="${surface}"]`;
}

export function resolvePointerSurface(
  target: EventTarget | null
): { element: HTMLElement; surface: CollaborationSurface } | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;

  const element = target.closest<HTMLElement>(
    `[${COLLABORATION_SURFACE_ATTRIBUTE}]`
  );
  const surface = element?.getAttribute(COLLABORATION_SURFACE_ATTRIBUTE);
  if (!element || !isCollaborationSurface(surface)) return null;

  return { element, surface };
}

export function parseStudentPointerMove(
  payload: unknown,
  expected: ExpectedStudentPointerScope
): StudentPointerMovePayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Partial<StudentPointerMovePayload>;
  if (
    candidate.senderId !== expected.studentId
    || candidate.sessionId !== expected.sessionId
    || candidate.problemId !== expected.problemId
    || candidate.role !== 'student'
    || !isCollaborationSurface(candidate.surface)
    || typeof candidate.name !== 'string'
    || !Number.isFinite(candidate.xPct)
    || !Number.isFinite(candidate.yPct)
    || !Number.isFinite(candidate.sentAt)
  ) {
    return null;
  }

  return {
    senderId: candidate.senderId,
    sessionId: candidate.sessionId,
    problemId: candidate.problemId,
    name: candidate.name,
    role: 'student',
    surface: candidate.surface,
    xPct: clampPointerPercentage(candidate.xPct as number),
    yPct: clampPointerPercentage(candidate.yPct as number),
    sentAt: candidate.sentAt as number,
  };
}

export function isStudentPointerLeave(
  payload: unknown,
  expected: ExpectedStudentPointerScope
): payload is StudentPointerLeavePayload {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<StudentPointerLeavePayload>;
  return candidate.senderId === expected.studentId
    && candidate.sessionId === expected.sessionId
    && candidate.problemId === expected.problemId
    && candidate.role === 'student';
}
