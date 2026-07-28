'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, UserCheck, UserX, Users, GraduationCap, BookOpen, Pencil, X, Eye, EyeOff, ChevronDown } from 'lucide-react';
import type { UserRole } from '@/lib/types/db';
import { routeWithQuery } from '@/lib/navigation/queryState';

type UserRow = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
  teachers: string[];
  student_count: number;
};

type Stats = {
  total: number;
  studentCount: number;
  teacherCount: number;
  activeCount: number;
};

type EditForm = {
  name: string;
  role: 'student' | 'teacher';
  is_active: boolean;
  new_password: string;
};

const ROLE_LABEL: Record<string, string> = { student: '학생', teacher: '선생님', admin: '관리자' };
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  student: { bg: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
  teacher: { bg: '#F3E8FF', color: '#7C3AED' },
  admin: { bg: '#FEF3C7', color: '#B45309' },
};

function formatRelative(iso: string | null) {
  if (!iso) return '접속 기록 없음';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function isOnline(iso: string | null) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="bg-card rounded-2xl flex items-center gap-4 px-6 py-5" style={{ border: '1px solid var(--color-border)' }}>
      <div className="rounded-2xl flex items-center justify-center" style={{ width: 52, height: 52, backgroundColor: 'var(--color-surface)' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--color-sub)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '26px', fontWeight: 700, color: color ?? 'var(--color-ink)' }}>{value}</div>
      </div>
    </div>
  );
}

function Toast({ message, type }: { message: string; type: 'ok' | 'err' }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white z-50"
      style={{ backgroundColor: type === 'ok' ? '#16A34A' : '#DC2626', fontSize: '14px', fontWeight: 600, boxShadow: '0 4px 16px rgba(22,24,29,0.18)' }}
    >
      {message}
    </div>
  );
}

function EditModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: (updated: UserRow) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    name: user.name,
    role: user.role === 'admin' ? 'student' : (user.role as 'student' | 'teacher'),
    is_active: user.is_active,
    new_password: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) { setError('이름을 입력해주세요.'); return; }
    if (form.new_password && form.new_password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }

    setSaving(true);
    setError('');
    const body: Record<string, unknown> = { name: form.name, role: form.role, is_active: form.is_active };
    if (form.new_password) body.new_password = form.new_password;

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error?.message ?? '수정 중 오류가 발생했습니다.'); return; }
    onSaved({ ...user, ...json.user, teachers: user.teachers, student_count: user.student_count });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-card rounded-2xl w-full mx-4" style={{ maxWidth: 440, boxShadow: '0 8px 40px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>사용자 정보 수정</h2>
            <p style={{ fontSize: '13px', color: 'var(--color-sub)', marginTop: 2 }}>{user.username}</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center rounded-xl transition-colors hover:bg-[var(--color-surface)]" style={{ width: 36, height: 36 }}>
            <X size={18} style={{ color: 'var(--color-sub)' }} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: 6 }}>이름</label>
            <input
              className="w-full rounded-xl px-4 focus:outline-none"
              style={{ height: 44, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: 6 }}>역할</label>
            <div className="relative">
              <select
                className="w-full rounded-xl px-4 appearance-none focus:outline-none"
                style={{ height: 44, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)', backgroundColor: 'var(--color-card)' }}
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'student' | 'teacher' }))}
              >
                <option value="student">학생</option>
                <option value="teacher">선생님</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sub)' }} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl px-4" style={{ height: 52, border: '1px solid var(--color-border)', backgroundColor: form.is_active ? '#F0FDF4' : 'var(--tint-danger)' }}>
            <div className="flex items-center gap-2">
              {form.is_active ? <UserCheck size={18} style={{ color: '#16A34A' }} /> : <UserX size={18} style={{ color: '#DC2626' }} />}
              <span style={{ fontSize: '14px', fontWeight: 600, color: form.is_active ? '#16A34A' : '#DC2626' }}>
                {form.is_active ? '활성 계정' : '비활성 계정'}
              </span>
              {!form.is_active && <span style={{ fontSize: '12px', color: '#DC2626' }}>— 로그인 불가</span>}
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              className="relative rounded-full transition-colors"
              style={{
                width: 44,
                height: 24,
                backgroundColor: form.is_active ? '#16A34A' : 'var(--color-border)',
              }}
            >
              <span
                className="absolute top-0.5 rounded-full bg-card transition-all"
                style={{ width: 20, height: 20, left: form.is_active ? 22 : 2 }}
              />
            </button>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: 6 }}>
              새 비밀번호 <span style={{ fontSize: '12px', color: '#BCC0C7', fontWeight: 400 }}>(변경 시에만 입력)</span>
            </label>
            <div className="relative">
              <input
                className="w-full rounded-xl px-4 focus:outline-none pr-11"
                style={{ height: 44, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
                type={showPw ? 'text' : 'password'}
                placeholder="8자 이상"
                value={form.new_password}
                onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
              <button onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showPw ? <EyeOff size={16} style={{ color: '#BCC0C7' }} /> : <Eye size={16} style={{ color: '#BCC0C7' }} />}
              </button>
            </div>
          </div>

          {error && <p style={{ fontSize: '13px', color: '#DC2626' }}>{error}</p>}
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 48, border: '1px solid var(--color-border)', fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>취소</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl text-white transition-colors disabled:opacity-50"
            style={{ height: 48, backgroundColor: 'var(--color-primary)', fontSize: '15px', fontWeight: 600 }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const roleFilter = (['student', 'teacher'].includes(searchParams.get('role') ?? '')
    ? searchParams.get('role')
    : 'all') as 'all' | 'student' | 'teacher';
  const statusFilter = (['active', 'inactive'].includes(searchParams.get('status') ?? '')
    ? searchParams.get('status')
    : 'all') as 'all' | 'active' | 'inactive';
  const selectedUserId = searchParams.get('user');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, studentCount: 0, teacherCount: 0, activeCount: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(urlQuery);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (message: string, type: 'ok' | 'err') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const replaceQuery = useCallback((updates: Record<string, string | null>) => {
    router.replace(routeWithQuery(pathname, searchParams, updates), { scroll: false });
  }, [pathname, router, searchParams]);

  const closeEdit = useCallback(() => {
    setEditTarget(null);
    replaceQuery({ user: null });
  }, [replaceQuery]);

  const openEdit = (user: UserRow) => {
    setEditTarget(user);
    router.push(routeWithQuery(pathname, searchParams, { user: user.id }), { scroll: false });
  };

  useEffect(() => {
    setQ(urlQuery);
  }, [urlQuery]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  useEffect(() => {
    const rawRole = searchParams.get('role');
    const rawStatus = searchParams.get('status');
    if (rawRole && !['student', 'teacher'].includes(rawRole)) {
      replaceQuery({ role: null });
      return;
    }
    if (rawStatus && !['active', 'inactive'].includes(rawStatus)) {
      replaceQuery({ status: null });
    }
  }, [replaceQuery, searchParams]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (urlQuery) params.set('q', urlQuery);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const res = await fetch(`/api/admin/users?${params.toString()}`);
    const json = await res.json();
    setUsers(json.users ?? []);
    if (json.stats) setStats(json.stats);
    setLoading(false);
  }, [urlQuery, roleFilter, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setEditTarget(null);
      return;
    }
    const selected = users.find((user) => user.id === selectedUserId);
    if (selected) setEditTarget(selected);
    else if (!loading) replaceQuery({ user: null });
  }, [loading, replaceQuery, selectedUserId, users]);

  const handleToggleActive = async (user: UserRow) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
      showToast(`${user.name} 계정을 ${!user.is_active ? '활성화' : '비활성화'}했습니다.`, 'ok');
    } else {
      showToast('변경 중 오류가 발생했습니다.', 'err');
    }
  };

  const handleSaved = (updated: UserRow) => {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    closeEdit();
    showToast(`${updated.name} 정보를 수정했습니다.`, 'ok');
    fetchUsers();
  };

  const ROLE_TABS = [
    { key: 'all', label: '전체' },
    { key: 'student', label: '학생' },
    { key: 'teacher', label: '선생님' },
  ] as const;

  const STATUS_TABS = [
    { key: 'all', label: '전체' },
    { key: 'active', label: '활성' },
    { key: 'inactive', label: '비활성' },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)' }}>사용자 관리</h1>
        <p style={{ fontSize: '15px', color: 'var(--color-sub)', marginTop: 3 }}>전체 학생과 선생님 계정을 조회하고 관리하세요.</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Users size={24} style={{ color: 'var(--color-primary)' }} />} label="전체 회원" value={stats.total} />
        <StatCard icon={<GraduationCap size={24} style={{ color: 'var(--color-primary-hover)' }} />} label="학생" value={stats.studentCount} color="var(--color-primary-hover)" />
        <StatCard icon={<BookOpen size={24} style={{ color: '#7C3AED' }} />} label="선생님" value={stats.teacherCount} color="#7C3AED" />
        <StatCard icon={<UserCheck size={24} style={{ color: '#16A34A' }} />} label="활성 계정" value={stats.activeCount} color="#16A34A" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); fetchUsers(); }} className="flex-1" style={{ minWidth: 200, maxWidth: 320 }}>
          <div className="flex items-center gap-2 rounded-2xl px-4 bg-card" style={{ border: '1px solid var(--color-border)', height: 46 }}>
            <Search size={16} style={{ color: '#BCC0C7', flexShrink: 0 }} />
            <input
              className="flex-1 focus:outline-none"
              style={{ fontSize: '14px', color: 'var(--color-ink)' }}
              placeholder="이름 또는 아이디 검색"
              value={q}
              onChange={(e) => {
                const value = e.target.value;
                setQ(value);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => replaceQuery({ q: value || null, user: null }), 250);
              }}
            />
          </div>
        </form>

        <div className="flex items-center gap-1.5 rounded-2xl p-1 bg-card" style={{ border: '1px solid var(--color-border)' }}>
          {ROLE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => replaceQuery({ role: key === 'all' ? null : key, user: null })}
              className="rounded-xl px-4 transition-colors"
              style={{
                height: 36,
                fontSize: '13px',
                fontWeight: roleFilter === key ? 700 : 500,
                backgroundColor: roleFilter === key ? 'var(--color-ink)' : 'transparent',
                color: roleFilter === key ? 'var(--color-surface)' : 'var(--color-sub)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl p-1 bg-card" style={{ border: '1px solid var(--color-border)' }}>
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => replaceQuery({ status: key === 'all' ? null : key, user: null })}
              className="rounded-xl px-4 transition-colors"
              style={{
                height: 36,
                fontSize: '13px',
                fontWeight: statusFilter === key ? 700 : 500,
                backgroundColor: statusFilter === key
                  ? key === 'active' ? '#16A34A' : key === 'inactive' ? '#DC2626' : 'var(--color-ink)'
                  : 'transparent',
                color: statusFilter === key ? 'var(--color-surface)' : 'var(--color-sub)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl animate-pulse" style={{ height: 82, border: '1px solid var(--color-border)' }} />
          ))
        ) : users.length === 0 ? (
          <div className="bg-card rounded-2xl flex flex-col items-center justify-center py-20 gap-2" style={{ border: '1px solid var(--color-border)' }}>
            <Users size={40} style={{ color: 'var(--color-border)' }} />
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)' }}>
              {q ? '검색 결과가 없습니다' : '등록된 사용자가 없습니다'}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--color-sub)' }}>
              {q ? '다른 이름이나 아이디로 검색해보세요' : '학생이 회원가입하면 여기에 표시됩니다'}
            </p>
          </div>
        ) : (
          users.map((u) => {
            const online = isOnline(u.last_active_at);
            const rs = ROLE_STYLE[u.role] ?? ROLE_STYLE.student;
            return (
              <div
                key={u.id}
                className="bg-card rounded-2xl flex items-center gap-5"
                style={{ border: `1px solid ${u.is_active ? 'var(--color-border)' : 'var(--color-muted)'}`, padding: '16px 22px', opacity: u.is_active ? 1 : 0.65 }}
              >
                <div className="relative flex-shrink-0">
                  <div className="rounded-2xl flex items-center justify-center" style={{ width: 52, height: 52, backgroundColor: rs.bg }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: rs.color }}>
                      {u.name.charAt(0)}
                    </span>
                  </div>
                  <span
                    className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-card"
                    style={{ backgroundColor: online ? '#16A34A' : '#BCC0C7' }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>{u.name}</span>
                    <span style={{ fontSize: '12px', color: '#BCC0C7' }}>@{u.username}</span>
                    <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: rs.bg, color: rs.color }}>
                      {ROLE_LABEL[u.role]}
                    </span>
                    {!u.is_active && (
                      <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#FEE2E2', color: '#DC2626' }}>
                        비활성
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ fontSize: '12px', color: online ? '#16A34A' : '#BCC0C7' }}>
                      {online ? '● 접속 중' : `최근 접속 ${formatRelative(u.last_active_at)}`}
                    </span>
                    {u.role === 'student' && u.teachers.length > 0 && (
                      <>
                        <span style={{ fontSize: '12px', color: '#BCC0C7' }}>·</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>담당 선생님: {u.teachers.join(', ')}</span>
                      </>
                    )}
                    {u.role === 'teacher' && u.student_count > 0 && (
                      <>
                        <span style={{ fontSize: '12px', color: '#BCC0C7' }}>·</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>담당 학생 {u.student_count}명</span>
                      </>
                    )}
                    <span style={{ fontSize: '12px', color: '#BCC0C7' }}>·</span>
                    <span style={{ fontSize: '12px', color: '#BCC0C7' }}>
                      가입 {formatRelative(u.created_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(u)}
                    title={u.is_active ? '비활성화' : '활성화'}
                    className="flex items-center gap-1.5 rounded-xl px-3 transition-colors"
                    style={{
                      height: 38,
                      border: `1px solid ${u.is_active ? '#FCA5A5' : '#A7F3D0'}`,
                      backgroundColor: u.is_active ? 'var(--tint-danger)' : '#F0FDF4',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: u.is_active ? '#DC2626' : '#16A34A',
                    }}
                  >
                    {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                    {u.is_active ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => openEdit(u)}
                    title="정보 수정"
                    className="flex items-center gap-1.5 rounded-xl px-3 transition-colors hover:bg-[var(--color-surface)]"
                    style={{ height: 38, border: '1px solid var(--color-border)', fontSize: '12px', fontWeight: 600, color: 'var(--color-sub)' }}
                  >
                    <Pencil size={14} /> 수정
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editTarget && <EditModal user={editTarget} onClose={closeEdit} onSaved={handleSaved} />}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
