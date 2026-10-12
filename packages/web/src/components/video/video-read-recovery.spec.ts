import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { retryVideoRead, videoReadRetryDelay } from './video-read-recovery';

describe('video read recovery', () => {
  it.each([401, 403, 404, 400, 409, 422])('does not retry HTTP %i', (status) => {
    expect(retryVideoRead(0, { status })).toBe(false);
  });
  it.each([429, 500, 502, 503, 504])('bounds retries for HTTP %i', (status) => {
    expect(retryVideoRead(0, { status })).toBe(true);
    expect(retryVideoRead(1, { status })).toBe(true);
    expect(retryVideoRead(2, { status })).toBe(false);
  });
  it('recovers network and malformed gateway responses without retrying arbitrary failures', () => {
    expect(retryVideoRead(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retryVideoRead(0, new SyntaxError('Invalid JSON'))).toBe(true);
    expect(retryVideoRead(0, new Error('Sign in to continue'))).toBe(false);
    expect(videoReadRetryDelay(20)).toBe(2000);
  });
  it('loads the lesson after a transient failure without requiring page reload', async () => {
    const client = new QueryClient();
    let reads = 0;
    try {
      const lesson = await client.fetchQuery({
        queryKey: ['qa-video-recovery'],
        queryFn: async () => {
          if (++reads === 1) throw new TypeError('Failed to fetch');
          return { title: 'QA lesson', materialId: 'same-material' };
        },
        retry: retryVideoRead,
        retryDelay: 0,
      });
      expect(reads).toBe(2);
      expect(lesson.materialId).toBe('same-material');
    } finally {
      client.clear();
    }
  });
  it('stops after three failed reads and permits an explicit refetch', async () => {
    const client = new QueryClient();
    let reads = 0;
    let recovered = false;
    const options = {
      queryKey: ['qa-video-exhausted'],
      queryFn: async () => {
        reads++;
        if (!recovered) throw Object.assign(new Error('Gateway unavailable'), { status: 503 });
        return 'lesson';
      },
      retry: retryVideoRead,
      retryDelay: 0,
    };
    try {
      await expect(client.fetchQuery(options)).rejects.toThrow('Gateway unavailable');
      expect(reads).toBe(3);
      recovered = true;
      expect(await client.fetchQuery(options)).toBe('lesson');
      expect(reads).toBe(4);
    } finally {
      client.clear();
    }
  });
});
