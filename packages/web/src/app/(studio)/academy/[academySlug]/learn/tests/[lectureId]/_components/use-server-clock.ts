'use client';

import * as React from 'react';

import { orpc } from '@/lib/orpc';
import { displayTimeZone } from '@cove/i18n/settings';

/**
 * The server's clock as seen from here: one round trip, the server instant
 * taken at its midpoint. `driftMs` is PC minus server — positive when this
 * computer runs fast. Used to correct the countdown and shown in the wizard.
 */
export function useServerClock({ initialServerNow }: { initialServerNow?: Date | string } = {}) {
  const [offsetMs, setOffsetMs] = React.useState<number | null>(() =>
    initialServerNow ? new Date(initialServerNow).getTime() - Date.now() : null);
  const [syncing, setSyncing] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  const measure = React.useCallback(async () => {
    try {
      const sent = Date.now();
      const { now: server } = await orpc.exam.serverTime();
      const received = Date.now();
      setOffsetMs(new Date(server).getTime() - (sent + received) / 2);
    } catch {
      // Keep the previous estimate; the deadline is enforced by the server anyway.
    }
  }, []);
  const resync = React.useCallback(async () => {
    setSyncing(true);
    await measure();
    setSyncing(false);
  }, [measure]);

  React.useEffect(() => {
    let active = true;
    const sent = Date.now();
    orpc.exam.serverTime().then(({ now: server }) => {
      if (active) setOffsetMs(new Date(server).getTime() - (sent + Date.now()) / 2);
    }, () => undefined);
    return () => { active = false; };
  }, []);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { timeZone: displayTimeZone, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return {
    syncing,
    resync: () => void resync(),
    offsetMs,
    driftMs: offsetMs == null ? null : -offsetMs,
    /** Now on the server's clock, in ms. */
    serverNow: () => Date.now() + (offsetMs ?? 0),
    serverText: offsetMs == null ? '--:--:--' : time(now + offsetMs),
    pcText: time(now),
  };
}
