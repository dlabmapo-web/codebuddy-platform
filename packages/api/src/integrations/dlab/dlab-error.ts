import { HttpException } from '@nestjs/common';

export class DlabError extends HttpException {
  constructor(readonly reason: string, status = 400, readonly field?: string) {
    super({ code: status === 401 ? 'unauthorized' : status === 409 ? 'conflict' : status === 503 ? 'internal_error' : status === 403 ? 'forbidden' : 'invalid_field', message: reason, ...(field ? { field } : {}) }, status);
  }
}
