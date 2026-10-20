import type { MonitoringLiveState } from '@cove/shared';
export type TutoringFilter = 'all' | 'online' | 'submitted' | 'not-submitted';
export function matchesTutoringStudent(row: {
  displayName: string | null; username: string | null; email: string | null;
  state: MonitoringLiveState; materialId: string | null; attempts: number | null;
}, filter: TutoringFilter, search: string, materialId: string): boolean {
  if (![row.displayName, row.username, row.email].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
  if (filter === 'online') return row.state === 'SOLVING' && row.materialId === materialId;
  if (filter === 'submitted') return row.attempts !== null && row.attempts > 0;
  if (filter === 'not-submitted') return row.attempts === 0;
  return true;
}
