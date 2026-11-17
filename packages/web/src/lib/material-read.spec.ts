import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api-errors';
import { isMaterialUnavailable, readMaterialResponse, settleMaterialRead } from './material-read';

describe('material read failures', () => {
  it.each(['EXERCISE_NOT_AVAILABLE', 'PDF_NOT_AVAILABLE', 'PERMISSION_DENIED', 'COURSE_NOT_FOUND'])(
    'recognizes an explicit %s without depending on transport text', code => {
      expect(isMaterialUnavailable(new ORPCError('NOT_FOUND', {status: 404, data: {code}}))).toBe(true);
    },
  );
  it('keeps schema, network and untyped gateway failures recoverable', () => {
    for (const error of [new Error('private SQL detail'), new ORPCError('INTERNAL_SERVER_ERROR', {status: 500}), new ApiError('proxy', 404)])
      expect(isMaterialUnavailable(error)).toBe(false);
  });
  it('preserves REST status and application code', async () => {
    await expect(readMaterialResponse(new Response(JSON.stringify({code: 'PDF_NOT_AVAILABLE'}), {status:404})))
      .rejects.toMatchObject({status:404, code:'PDF_NOT_AVAILABLE'});
    await expect(readMaterialResponse(new Response('<html>gateway</html>', {status:502})))
      .rejects.toMatchObject({status:502, code:null});
    await expect(readMaterialResponse(new Response('invalid JSON', {status:200})))
      .rejects.toMatchObject({status:502});
    await expect(readMaterialResponse(new Response('{"title":"PDF"}'))).resolves.toEqual({title:'PDF'});
  });
  it('settles unused parallel bootstrap rejections before a Turtle redirect', async () => {
    const error = new Error('Turtle uses another workspace');
    const unused = settleMaterialRead(Promise.reject(error));
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(unused).resolves.toEqual({ok:false, error});
    await expect(settleMaterialRead(Promise.resolve('ready'))).resolves.toEqual({ok:true, data:'ready'});
  });
});
