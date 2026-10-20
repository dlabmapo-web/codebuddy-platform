import { describe, expect, it } from 'vitest';
import { redisConnection } from './judge.queue.js';
describe('Redis queue connection', () => {
  it('keeps the configured port, database and escaped credentials', () => {
    expect(redisConnection('redis://worker:p%40ss@127.0.0.1:6380/2')).toEqual({
      host: '127.0.0.1', port: 6380, username: 'worker', password: 'p@ss', db: 2, maxRetriesPerRequest: null,
    });
  });
  it('retains TLS and uses Redis defaults when omitted', () => {
    expect(redisConnection('rediss://redis.example')).toMatchObject({ host: 'redis.example', port: 6379, db: 0, tls: {} });
    expect(() => redisConnection('https://example.com')).toThrow();
  });
});
