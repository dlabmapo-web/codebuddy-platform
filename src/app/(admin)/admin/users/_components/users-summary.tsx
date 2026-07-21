import { BookOpen, GraduationCap, UserCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UserStats } from '../_lib/types';

function StatCard({ icon, label, value, color }: { icon: ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-2xl flex items-center gap-4 px-6 py-5" style={{ border: '1px solid #E5E8EC' }}>
      <div className="rounded-2xl flex items-center justify-center" style={{ width: 52, height: 52, backgroundColor: '#F6F7F9' }}>{icon}</div>
      <div><div style={{ fontSize: '13px', color: '#5A6270', marginBottom: 2 }}>{label}</div><div style={{ fontSize: '26px', fontWeight: 700, color: color ?? '#16181D' }}>{value}</div></div>
    </div>
  );
}

export function UsersSummary({ stats }: { stats: UserStats }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard icon={<Users size={24} style={{ color: '#1B64DA' }} />} label="전체 회원" value={stats.total} />
      <StatCard icon={<GraduationCap size={24} style={{ color: '#1450B5' }} />} label="학생" value={stats.studentCount} color="#1450B5" />
      <StatCard icon={<BookOpen size={24} style={{ color: '#7C3AED' }} />} label="선생님" value={stats.teacherCount} color="#7C3AED" />
      <StatCard icon={<UserCheck size={24} style={{ color: '#16A34A' }} />} label="활성 계정" value={stats.activeCount} color="#16A34A" />
    </div>
  );
}
