// @vitest-environment happy-dom
import React, { act, useContext, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { HistoryPresentationContext } from '@/lib/monitoring/history-presentation';
import { MonitorHistoryHost, MonitoringHistoryActions } from './monitor-history';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/studio/academy-route-provider', () => ({ useAcademySlug: () => 'academy' }));

it('opens class history without a fabricated student and respects the teaching save guard', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('React', React);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  let settle!: (allowed: boolean) => void;
  const prepare = vi.fn(() => new Promise<boolean>(resolve => { settle = resolve; }));
  function Actions() {
    const history = useContext(HistoryPresentationContext);
    const setMaterial = history?.setMaterial, setLeaveGuard = history?.setLeaveGuard;
    useEffect(() => {
      setMaterial?.('problem', 'course', 'PROGRAMMING_EXERCISE', 'Addition');
      setLeaveGuard?.(prepare);
      return () => setLeaveGuard?.(null);
    }, [setMaterial, setLeaveGuard]);
    return <MonitoringHistoryActions />;
  }
  try {
    await act(async () => root.render(<MonitorHistoryHost academyId="academy-id" classId="class" name="Teaching view"><Actions /></MonitorHistoryHost>));
    const history = host.querySelector('button')!;
    await act(async () => history.click());
    expect(push).not.toHaveBeenCalled();
    await act(async () => settle(false));
    expect(push).not.toHaveBeenCalled();
    await act(async () => history.click());
    await act(async () => settle(true));
    expect(push).toHaveBeenCalledExactlyOnceWith('/academy/academy/teach/classes/class/progress?view=students&course=course');
  } finally {
    await act(async () => root.unmount()); host.remove(); push.mockReset(); vi.unstubAllGlobals();
  }
});
