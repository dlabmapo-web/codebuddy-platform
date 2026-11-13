'use client';
import { createContext } from 'react';
import type { Socket } from 'socket.io-client';
import type { PresenceEntry } from '@cove/shared';
import type { MonitoringConnectionState } from './connection';
import type { ClassTransportPool } from './class-transport-pool';

export const ClassTransportContext = createContext<{ classId: string; pool: ClassTransportPool | null } | null>(null);
export interface ClassPresenceValue {
  refresh: () => void;
  snapshotReady: boolean;
  entries: PresenceEntry[];
  version: number;
  state: MonitoringConnectionState;
  denied: string | null;
  socket: Socket | null;
}
export const ClassPresenceContext = createContext<{ academyId: string; classId: string; presence: ClassPresenceValue } | null>(null);
