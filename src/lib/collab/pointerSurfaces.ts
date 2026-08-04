export const COLLABORATION_SURFACE_ATTRIBUTE = 'data-collaboration-surface';

export const COLLABORATION_SURFACES = [
  'header',
  'curriculum',
  'statement',
  'editor',
  'terminal',
] as const;

export type CollaborationSurface = (typeof COLLABORATION_SURFACES)[number];

// 포인터는 양방향이다 — 학생은 선생님에게, 선생님은 학생에게 같은 형식으로 보낸다.
export const COLLABORATION_POINTER_ROLES = ['student', 'teacher'] as const;

export type CollaborationPointerRole = (typeof COLLABORATION_POINTER_ROLES)[number];

export type PointerMovePayload<
  Role extends CollaborationPointerRole = CollaborationPointerRole
> = {
  senderId: string;
  sessionId: string;
  problemId: string;
  name: string;
  role: Role;
  surface: CollaborationSurface;
  xPct: number;
  yPct: number;
  sentAt: number;
};

export type PointerLeavePayload<
  Role extends CollaborationPointerRole = CollaborationPointerRole
> = Pick<
  PointerMovePayload<Role>,
  'senderId' | 'sessionId' | 'problemId' | 'role'
>;

export type StudentPointerMovePayload = PointerMovePayload<'student'>;
export type StudentPointerLeavePayload = PointerLeavePayload<'student'>;
export type TeacherPointerMovePayload = PointerMovePayload<'teacher'>;
export type TeacherPointerLeavePayload = PointerLeavePayload<'teacher'>;

type PointerRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

type ExpectedPointerScope = {
  sessionId: string;
  problemId: string;
};

type ExpectedStudentPointerScope = ExpectedPointerScope & {
  studentId: string;
};

// 학생은 선생님의 id를 미리 알 수 없으므로, 같은 세션/문제의 teacher 역할이면 받아들이고
// 자기 자신의 브로드캐스트만 걸러낸다.
type ExpectedTeacherPointerScope = ExpectedPointerScope & {
  viewerId: string;
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

function parsePointerMove<Role extends CollaborationPointerRole>(
  payload: unknown,
  role: Role,
  expected: ExpectedPointerScope,
  isExpectedSender: (senderId: string) => boolean
): PointerMovePayload<Role> | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Partial<PointerMovePayload<Role>>;
  if (
    typeof candidate.senderId !== 'string'
    || !isExpectedSender(candidate.senderId)
    || candidate.sessionId !== expected.sessionId
    || candidate.problemId !== expected.problemId
    || candidate.role !== role
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
    role,
    surface: candidate.surface,
    xPct: clampPointerPercentage(candidate.xPct as number),
    yPct: clampPointerPercentage(candidate.yPct as number),
    sentAt: candidate.sentAt as number,
  };
}

function isPointerLeave<Role extends CollaborationPointerRole>(
  payload: unknown,
  role: Role,
  expected: ExpectedPointerScope,
  isExpectedSender: (senderId: string) => boolean
): payload is PointerLeavePayload<Role> {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<PointerLeavePayload<Role>>;
  return typeof candidate.senderId === 'string'
    && isExpectedSender(candidate.senderId)
    && candidate.sessionId === expected.sessionId
    && candidate.problemId === expected.problemId
    && candidate.role === role;
}

export function parseStudentPointerMove(
  payload: unknown,
  expected: ExpectedStudentPointerScope
): StudentPointerMovePayload | null {
  return parsePointerMove(
    payload,
    'student',
    expected,
    (senderId) => senderId === expected.studentId
  );
}

export function isStudentPointerLeave(
  payload: unknown,
  expected: ExpectedStudentPointerScope
): payload is StudentPointerLeavePayload {
  return isPointerLeave(
    payload,
    'student',
    expected,
    (senderId) => senderId === expected.studentId
  );
}

export function parseTeacherPointerMove(
  payload: unknown,
  expected: ExpectedTeacherPointerScope
): TeacherPointerMovePayload | null {
  return parsePointerMove(
    payload,
    'teacher',
    expected,
    (senderId) => senderId.length > 0 && senderId !== expected.viewerId
  );
}

export function isTeacherPointerLeave(
  payload: unknown,
  expected: ExpectedTeacherPointerScope
): payload is TeacherPointerLeavePayload {
  return isPointerLeave(
    payload,
    'teacher',
    expected,
    (senderId) => senderId.length > 0 && senderId !== expected.viewerId
  );
}
