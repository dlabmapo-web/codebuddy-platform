import { describe, expect, it } from 'vitest';
import {
  clampPointerPercentage,
  collaborationSurfaceSelector,
  isCollaborationSurface,
  isStudentPointerLeave,
  normalizePointerPosition,
  parseStudentPointerMove,
} from './pointerSurfaces';

const expectedScope = {
  studentId: 'student-1',
  sessionId: 'session-1',
  problemId: 'problem-1',
};

function pointerPayload(overrides: Record<string, unknown> = {}) {
  return {
    senderId: 'student-1',
    sessionId: 'session-1',
    problemId: 'problem-1',
    name: 'Student',
    role: 'student',
    surface: 'statement',
    xPct: 0.25,
    yPct: 0.75,
    sentAt: 100,
    ...overrides,
  };
}

describe('collaboration pointer surfaces', () => {
  it('recognizes only registered workspace surfaces', () => {
    expect(isCollaborationSurface('header')).toBe(true);
    expect(isCollaborationSurface('terminal')).toBe(true);
    expect(isCollaborationSurface('browser')).toBe(false);
    expect(collaborationSurfaceSelector('editor')).toBe(
      '[data-collaboration-surface="editor"]'
    );
  });

  it('normalizes and clamps pointer coordinates', () => {
    expect(normalizePointerPosition(150, 75, {
      left: 100,
      top: 50,
      width: 200,
      height: 100,
    })).toEqual({ xPct: 0.25, yPct: 0.25 });

    expect(normalizePointerPosition(-100, 999, {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    })).toEqual({ xPct: 0, yPct: 1 });
    expect(normalizePointerPosition(1, 1, {
      left: 0,
      top: 0,
      width: 0,
      height: 100,
    })).toBeNull();
    expect(clampPointerPercentage(Number.NaN)).toBe(0);
  });

  it('accepts and clamps a pointer from the expected student session', () => {
    expect(parseStudentPointerMove(
      pointerPayload({ xPct: -1, yPct: 2 }),
      expectedScope
    )).toMatchObject({
      senderId: 'student-1',
      surface: 'statement',
      xPct: 0,
      yPct: 1,
    });
  });

  it('rejects another sender, session, problem, role, or surface', () => {
    expect(parseStudentPointerMove(
      pointerPayload({ senderId: 'student-2' }),
      expectedScope
    )).toBeNull();
    expect(parseStudentPointerMove(
      pointerPayload({ sessionId: 'session-2' }),
      expectedScope
    )).toBeNull();
    expect(parseStudentPointerMove(
      pointerPayload({ problemId: 'problem-2' }),
      expectedScope
    )).toBeNull();
    expect(parseStudentPointerMove(
      pointerPayload({ role: 'teacher' }),
      expectedScope
    )).toBeNull();
    expect(parseStudentPointerMove(
      pointerPayload({ surface: 'browser' }),
      expectedScope
    )).toBeNull();
  });

  it('validates leave events against the same authorized scope', () => {
    const leave = {
      senderId: 'student-1',
      sessionId: 'session-1',
      problemId: 'problem-1',
      role: 'student',
    };

    expect(isStudentPointerLeave(leave, expectedScope)).toBe(true);
    expect(isStudentPointerLeave(
      { ...leave, sessionId: 'session-2' },
      expectedScope
    )).toBe(false);
  });
});
