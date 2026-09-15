import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryMonitoringCommand } from './retry-command';
import type { MonitoringAckResult } from './types';

afterEach(() => vi.useRealTimers());

describe('monitoring command recovery', () => {
  it('recovers an unanswered sync without a socket reconnect and ignores its late ack', async () => {
    vi.useFakeTimers();
    const replies: ((ack: MonitoringAckResult<string>) => void)[] = [];
    const onResult = vi.fn();
    const onRetry = vi.fn();
    retryMonitoringCommand<string>({ send: (reply) => replies.push(reply), onResult, onRetry });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(replies).toHaveLength(2);
    replies[0]({ ok: true, eventId: 'old', data: 'stale' });
    expect(onResult).not.toHaveBeenCalled();
    replies[1]({ ok: true, eventId: 'new', data: 'current' });
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ ok: true, eventId: 'new', data: 'current' });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds outage retries and reports exhaustion for a manual retry', async () => {
    vi.useFakeTimers();
    const send = vi.fn((reply) => reply({ ok: false, eventId: 'x', code: 'MONITORING_REALTIME_UNAVAILABLE' }));
    const onResult = vi.fn();
    retryMonitoringCommand({ send, onResult, onRetry: vi.fn() });
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(4);
    expect(onResult).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['MONITORING_ACCESS_DENIED', 'MONITORING_REFRESH_REQUIRED', 'MONITORING_STUDENT_UNAVAILABLE'] as const)(
    'does not retry %s', async (code) => {
      vi.useFakeTimers();
      const send = vi.fn((reply) => reply({ ok: false, eventId: 'x', code }));
      const onResult = vi.fn();
      retryMonitoringCommand({ send, onResult, onRetry: vi.fn() });
      await vi.runAllTimersAsync();
      expect(send).toHaveBeenCalledOnce();
      expect(onResult).toHaveBeenCalledOnce();
    },
  );

  it('cancels retries and late callbacks on navigation or a newer watch', async () => {
    vi.useFakeTimers();
    let reply!: (ack: MonitoringAckResult<string>) => void;
    const onResult = vi.fn();
    const send = vi.fn((ack) => { reply = ack; });
    const cancel = retryMonitoringCommand<string>({ send, onResult, onRetry: vi.fn() });
    cancel();
    reply({ ok: true, eventId: 'late', data: 'old exercise' });
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledOnce();
    expect(onResult).not.toHaveBeenCalled();
  });
});
