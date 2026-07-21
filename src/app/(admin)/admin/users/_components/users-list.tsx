import { Pencil, UserCheck, Users, UserX } from 'lucide-react';
import { formatRelative, isOnline, ROLE_LABEL, ROLE_STYLE } from '../_lib/presentation';
import type { UserRow } from '../_lib/types';

export function UsersList({ users, loading, query, onToggleActive, onEdit }: {
  users: UserRow[];
  loading: boolean;
  query: string;
  onToggleActive: (user: UserRow) => void;
  onEdit: (user: UserRow) => void;
}) {
  if (loading) return <div className="flex flex-col gap-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="bg-white rounded-2xl animate-pulse" style={{ height: 82, border: '1px solid #E5E8EC' }} />)}</div>;
  if (users.length === 0) {
    return <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-20 gap-2" style={{ border: '1px solid #E5E8EC' }}><Users size={40} style={{ color: '#E5E8EC' }} /><p style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }}>{query ? '검색 결과가 없습니다' : '등록된 사용자가 없습니다'}</p><p style={{ fontSize: '14px', color: '#5A6270' }}>{query ? '다른 이름이나 아이디로 검색해보세요' : '학생이 회원가입하면 여기에 표시됩니다'}</p></div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {users.map((user) => {
        const online = isOnline(user.last_active_at);
        const roleStyle = ROLE_STYLE[user.role] ?? ROLE_STYLE.student;
        return (
          <div key={user.id} className="bg-white rounded-2xl flex items-center gap-5" style={{ border: `1px solid ${user.is_active ? '#E5E8EC' : '#F0F1F3'}`, padding: '16px 22px', opacity: user.is_active ? 1 : 0.65 }}>
            <div className="relative flex-shrink-0"><div className="rounded-2xl flex items-center justify-center" style={{ width: 52, height: 52, backgroundColor: roleStyle.bg }}><span style={{ fontSize: '20px', fontWeight: 700, color: roleStyle.color }}>{user.name.charAt(0)}</span></div><span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: online ? '#16A34A' : '#BCC0C7' }} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1"><span style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>{user.name}</span><span style={{ fontSize: '12px', color: '#BCC0C7' }}>@{user.username}</span><span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: roleStyle.bg, color: roleStyle.color }}>{ROLE_LABEL[user.role]}</span>{!user.is_active && <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#FEE2E2', color: '#DC2626' }}>비활성</span>}</div>
              <div className="flex items-center gap-3 flex-wrap"><span style={{ fontSize: '12px', color: online ? '#16A34A' : '#BCC0C7' }}>{online ? '● 접속 중' : `최근 접속 ${formatRelative(user.last_active_at)}`}</span>{user.role === 'student' && user.teachers.length > 0 && <><span style={{ fontSize: '12px', color: '#BCC0C7' }}>·</span><span style={{ fontSize: '12px', color: '#5A6270' }}>담당 선생님: {user.teachers.join(', ')}</span></>}{user.role === 'teacher' && user.student_count > 0 && <><span style={{ fontSize: '12px', color: '#BCC0C7' }}>·</span><span style={{ fontSize: '12px', color: '#5A6270' }}>담당 학생 {user.student_count}명</span></>}<span style={{ fontSize: '12px', color: '#BCC0C7' }}>·</span><span style={{ fontSize: '12px', color: '#BCC0C7' }}>가입 {formatRelative(user.created_at)}</span></div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0"><button onClick={() => onToggleActive(user)} title={user.is_active ? '비활성화' : '활성화'} className="flex items-center gap-1.5 rounded-xl px-3 transition-colors" style={{ height: 38, border: `1px solid ${user.is_active ? '#FCA5A5' : '#A7F3D0'}`, backgroundColor: user.is_active ? '#FFF5F5' : '#F0FDF4', fontSize: '12px', fontWeight: 600, color: user.is_active ? '#DC2626' : '#16A34A' }}>{user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}{user.is_active ? '비활성화' : '활성화'}</button><button onClick={() => onEdit(user)} title="정보 수정" className="flex items-center gap-1.5 rounded-xl px-3 transition-colors hover:bg-[#F6F7F9]" style={{ height: 38, border: '1px solid #E5E8EC', fontSize: '12px', fontWeight: 600, color: '#5A6270' }}><Pencil size={14} /> 수정</button></div>
          </div>
        );
      })}
    </div>
  );
}
