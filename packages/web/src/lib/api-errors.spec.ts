import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import {
  extractAppErrorCode,
  extractIssues,
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
