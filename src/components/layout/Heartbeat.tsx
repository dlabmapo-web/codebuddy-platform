'use client';

import { useEffect } from 'react';

export function Heartbeat() {
  useEffect(() => {
    const send = () => {
      void fetch('/api/auth/heartbeat', { method: 'POST' }).catch(() => {
        // Restarts, navigation, and brief network loss should not surface as
        // unhandled promise rejections. The next interval retries naturally.
      });
    };
    send();
    const interval = setInterval(send, 10 * 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
