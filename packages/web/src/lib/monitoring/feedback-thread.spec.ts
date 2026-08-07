import type { MonitoringFeedback } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  markThreadRead,
  mergeFeedback,
  mergeFeedbackPage,
  revisionOf,
  unreadIds,
} from './feedback-thread';

/**
 * Reconciliation, which is where this thread can actually go wrong.
 *
 * The panel opens itself on a new message, so a fold that reports an arrival
 * it has already seen does not merely duplicate a row — it reopens a panel the
 * student deliberately closed. Identity is checked here for that reason.
 */

function message(
  id: string,
  overrides?: Partial<MonitoringFeedback>,
): MonitoringFeedback {
  const at = `2026-08-07T09:0${id}:00.000Z`;
  return {
    id,
    classId: 'class-1',
    teacherMembershipRef: 'teacher-1',
    teacherName: 'Kim',
    studentMembershipRef: 'student-1',
    materialId: 'material-1',
    body: `note ${id}`,
    createdAt: at,
    updatedAt: at,
    readAt: null,
    ...overrides,
  };
}

describe('mergeFeedback', () => {
  it('puts a new arrival at the front', () => {
    const result = mergeFeedback([message('1')], message('2'));
    expect(result.map((m) => m.id)).toEqual(['2', '1']);
  });

  it('ignores a row already in the thread', () => {
    const current = [message('2'), message('1')];
    const result = mergeFeedback(current, message('2'));
    expect(result.map((m) => m.id)).toEqual(['2', '1']);
  });

  /**
   * Identity, not just contents: the caller decides whether to open the panel
   * by comparing the returned array with the one it passed in.
   */
  it('returns the same array when nothing changed', () => {
    const current = [message('1')];
    expect(mergeFeedback(current, message('1'))).toBe(current);
  });

  /**
   * A teacher gets one note per exercise and rewrites it in place, so a
   * correction arrives under the id it already had. Treating that as a
   * duplicate would leave the student reading advice that was withdrawn.
   */
  it('replaces a note the teacher rewrote', () => {
    const current = [message('1')];
    const revised = message('1', {
      body: 'read both numbers first',
      updatedAt: '2026-08-07T10:00:00.000Z',
    });
    const result = mergeFeedback(current, revised);
    expect(result).toHaveLength(1);
    expect(result[0]!.body).toBe('read both numbers first');
  });

  it('keeps a rewrite in place rather than moving it to the front', () => {
    const current = [message('2'), message('1')];
    const revised = message('1', {
      body: 'revised',
      updatedAt: '2026-08-07T10:00:00.000Z',
    });
    expect(mergeFeedback(current, revised).map((m) => m.id)).toEqual(['2', '1']);
  });
});

describe('revisionOf', () => {
  it('distinguishes a rewrite from the note it replaced', () => {
    const before = message('1');
    const after = message('1', { updatedAt: '2026-08-07T10:00:00.000Z' });
    expect(revisionOf(before)).not.toBe(revisionOf(after));
  });

  it('is stable for the same note delivered twice', () => {
    expect(revisionOf(message('1'))).toBe(revisionOf(message('1')));
  });
});

describe('mergeFeedbackPage', () => {
  it('keeps a live arrival that raced the history request', () => {
    // The socket delivered 3 while the page request was still in flight.
    const live = [message('3')];
    const page = [message('2'), message('1')];
    const result = mergeFeedbackPage(live, page);
    expect(result.map((m) => m.id)).toEqual(['3', '2', '1']);
  });

  it('does not duplicate a row present in both', () => {
    const live = [message('2')];
    const page = [message('2'), message('1')];
    const result = mergeFeedbackPage(live, page);
    expect(result.map((m) => m.id)).toEqual(['2', '1']);
  });

  it("prefers the server's copy of a row it also holds", () => {
    const live = [message('2', { readAt: null })];
    const page = [message('2', { readAt: '2026-08-07T10:00:00.000Z' })];
    const result = mergeFeedbackPage(live, page);
    expect(result[0]!.readAt).toBe('2026-08-07T10:00:00.000Z');
  });

  it('orders newest first regardless of arrival order', () => {
    const result = mergeFeedbackPage(
      [message('1')],
      [message('3'), message('2')],
    );
    expect(result.map((m) => m.id)).toEqual(['3', '2', '1']);
  });
});

describe('unreadIds', () => {
  it('reports only rows the student has not opened', () => {
    const thread = [
      message('3'),
      message('2', { readAt: '2026-08-07T10:00:00.000Z' }),
      message('1'),
    ];
    expect(unreadIds(thread)).toEqual(['3', '1']);
  });

  it('reports nothing for a fully read thread', () => {
    const thread = [message('1', { readAt: '2026-08-07T10:00:00.000Z' })];
    expect(unreadIds(thread)).toEqual([]);
  });
});

describe('markThreadRead', () => {
  it('stamps every unread row and leaves read ones alone', () => {
    const alreadyRead = '2026-08-07T10:00:00.000Z';
    const thread = [message('2'), message('1', { readAt: alreadyRead })];
    const result = markThreadRead(thread, '2026-08-07T11:00:00.000Z');
    expect(result[0]!.readAt).toBe('2026-08-07T11:00:00.000Z');
    expect(result[1]!.readAt).toBe(alreadyRead);
  });

  it('returns the same array when everything is already read', () => {
    const thread = [message('1', { readAt: '2026-08-07T10:00:00.000Z' })];
    expect(markThreadRead(thread, '2026-08-07T11:00:00.000Z')).toBe(thread);
  });
});
