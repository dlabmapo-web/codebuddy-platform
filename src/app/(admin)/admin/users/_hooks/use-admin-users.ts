import { useCallback, useEffect, useState } from 'react';
import type { EditUserForm, RoleFilter, StatusFilter, ToastMessage, UserRow, UserStats } from '../_lib/types';

const EMPTY_STATS: UserStats = { total: 0, studentCount: 0, teacherCount: 0, activeCount: 0 };

export function useAdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((message: string, type: ToastMessage['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const response = await fetch(`/api/admin/users?${params.toString()}`);
    const json = await response.json();
    setUsers(json.users ?? []);
    if (json.stats) setStats(json.stats);
    setLoading(false);
  }, [query, roleFilter, statusFilter]);

  useEffect(() => {
    // Filter changes intentionally trigger the existing client-side request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers]);

  const toggleActive = async (user: UserRow) => {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    if (response.ok) {
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, is_active: !item.is_active } : item));
      showToast(`${user.name} 계정을 ${!user.is_active ? '활성화' : '비활성화'}했습니다.`, 'ok');
    } else {
      showToast('변경 중 오류가 발생했습니다.', 'err');
    }
  };

  const saveUser = async (user: UserRow, form: EditUserForm) => {
    const body: Record<string, unknown> = { name: form.name, role: form.role, is_active: form.is_active };
    if (form.new_password) body.new_password = form.new_password;
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) return json.error?.message ?? '수정 중 오류가 발생했습니다.';
    const updated = { ...user, ...json.user, teachers: user.teachers, student_count: user.student_count } as UserRow;
    setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    setEditTarget(null);
    showToast(`${updated.name} 정보를 수정했습니다.`, 'ok');
    fetchUsers();
    return null;
  };

  return {
    editTarget, fetchUsers, loading, query, roleFilter, saveUser, setEditTarget,
    setQuery, setRoleFilter, setStatusFilter, stats, statusFilter, toast, toggleActive,
    users,
  };
}
