import { BookOpen, Target, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';

type HistorySummaryProps = {
  totalAttempts: number;
  solvedProblems: number;
  correctRate: number;
};

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl flex items-center gap-4 px-6 py-5" style={{ border: '1px solid #E5E8EC' }}>
      <div className="rounded-2xl flex items-center justify-center shrink-0" style={{ width: 52, height: 52, backgroundColor: '#F6F7F9' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: '#5A6270', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: color ?? '#16181D' }}>{value}</div>
      </div>
    </div>
  );
}

export function HistorySummary({ totalAttempts, solvedProblems, correctRate }: HistorySummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard icon={<BookOpen size={24} style={{ color: '#1B64DA' }} />} label="총 제출 횟수" value={`${totalAttempts}회`} />
      <StatCard icon={<Trophy size={24} style={{ color: '#15803D' }} />} label="해결한 문제" value={`${solvedProblems}개`} color="#15803D" />
      <StatCard icon={<Target size={24} style={{ color: '#D97706' }} />} label="정답률" value={`${correctRate}%`} />
    </div>
  );
}
