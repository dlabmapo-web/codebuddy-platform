import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOnline, mergeStudentSessions } from '../_lib/presence';
import type { StudentResponseRow, StudentRow, StudentSession } from '../_lib/types';

export function useStudentMonitor() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const initializedRef = useRef(false);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    const [usersResponse, sessionsResponse] = await Promise.all([
      fetch('/api/students'),
      fetch('/api/sessions'),
    ]);
    const usersJson = await usersResponse.json();
    const sessionsJson = await sessionsResponse.json();
    const rows = mergeStudentSessions(
      (usersJson.users ?? []) as StudentResponseRow[],
      (sessionsJson.sessions ?? []) as StudentSession[],
    );

    setStudents(rows);
    setLastUpdated(new Date());
    if (!initializedRef.current) {
      initializedRef.current = true;
      setLoading(false);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // The monitoring workflow intentionally starts its external synchronization on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => void load(false), 15000);
    return () => clearInterval(interval);
  }, [load]);

  const summary = useMemo(() => ({
    totalCount: students.length,
    onlineCount: students.filter((student) => isOnline(student.last_active_at)).length,
    solvingCount: students.filter((student) => student.activeSession && isOnline(student.last_active_at)).length,
  }), [students]);

  return { lastUpdated, load, loading, refreshing, students, summary };
}
