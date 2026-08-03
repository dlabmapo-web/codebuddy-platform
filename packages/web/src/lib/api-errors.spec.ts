import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import {
  extractAppErrorCode,
  extractIssues,
  isAccessDeniedError,
  toApiError,
} from './api-errors';

describe('API error normalization', () => {
  it('reads an application code from oRPC error data', () => {
    const error = new ORPCError('BAD_REQUEST', {
      status: 409,
      message: 'Internal transport text',
      data: { code: 'COURSE_TITLE_CONFLICT' },
    });

    expect(toApiError(error)).toMatchObject({
      code: 'COURSE_TITLE_CONFLICT',
      status: 409,
    });
  });

  it('accepts a known transport code and rejects unknown codes', () => {
    expect(extractAppErrorCode('PERMISSION_DENIED', undefined)).toBe(
      'PERMISSION_DENIED',
    );
    expect(extractAppErrorCode('BAD_REQUEST', {})).toBeNull();
  });

  it('treats access denial as denial and anything else as a real fault', () => {
    expect(
      isAccessDeniedError(
        new ORPCError('FORBIDDEN', {
          status: 403,
          data: { code: 'PERMISSION_DENIED' },
        }),
      ),
    ).toBe(true);
    expect(
      isAccessDeniedError(
        new ORPCError('NOT_FOUND', {
          status: 404,
          data: { code: 'COURSE_NOT_FOUND' },
        }),
      ),
    ).toBe(true);
  });

  it('does not disguise a server fault as a permissions problem', () => {
    // A missing column surfaces as an untyped 500 — the case that reported
    // "belongs to another academy" while the real cause was schema drift.
    expect(
      isAccessDeniedError(
        new Error('column course_modules.course_id does not exist'),
      ),
    ).toBe(false);
    expect(
      isAccessDeniedError(
        new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 }),
      ),
    ).toBe(false);
    expect(
      isAccessDeniedError(
        new ORPCError('CONFLICT', {
          status: 409,
          data: { code: 'CONTENT_EDIT_CONFLICT' },
        }),
      ),
    ).toBe(false);
  });

  it('keeps only well-formed validation issues', () => {
    expect(
      extractIssues({
        issues: [
          { path: 'title', message: 'Title is required.' },
          { path: 1, message: 'Invalid' },
        ],
      }),
    ).toEqual([{ path: 'title', message: 'Title is required.' }]);
  });
});
