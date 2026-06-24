'use client';

import { useEffect } from 'react';

export function Heartbeat() {
  useEffect(() => {
    const send = () => fetch('/api/auth/heartbeat', { method: 'POST' });
    send();
    const interval = setInterval(send, 10 * 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
