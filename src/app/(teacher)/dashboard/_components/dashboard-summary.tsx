import { CheckCircle2, FileText, Target, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TeacherDashboardSummary } from '@/lib/types/teacherDashboard';

function StatCard(props: { label: string; value: number; unit: string; description: string; icon: ReactNode; color: string; background: string }) {
  return (
    <div className="bg-white rounded-xl p-4 flex items-start gap-3 min-w-0" style={{ border: '1px solid #E5E8EC' }}>
      <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 38, height: 38, color: props.color, backgroundColor: props.background }}>{props.icon}</div>
      <div className="min-w-0">
        <p style={{ fontSize: '12px', color: '#8A8F98', marginBottom: 3 }}>{props.label}</p>
        <div className="flex items-baseline gap-1"><strong style={{ fontSize: '22px', lineHeight: 1.1, color: '#16181D' }}>{props.value.toLocaleString('ko-KR')}</strong><span style={{ fontSize: '12px', color: '#5A6270' }}>{props.unit}</span></div>
        <p className="truncate mt-1" style={{ fontSize: '11px', color: '#BCC0C7' }}>{props.description}</p>
      </div>
    </div>
  );
}

export function DashboardSummary({ summary }: { summary: TeacherDashboardSummary }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <StatCard label="총 제출 수" value={summary.totalSubmissions} unit="회" description={`학생 ${summary.totalStudents}명 기준`} icon={<FileText size={18} />} color="#1B64DA" background="#EAF1FD" />
      <StatCard label="총 오답 수" value={summary.totalWrongAnswers} unit="회" description="채점 결과가 오답인 제출" icon={<XCircle size={18} />} color="#DC2626" background="#FFF1F2" />
      <StatCard label="해결한 문제" value={summary.solvedProblemPairs} unit="건" description="학생별 중복을 제외한 해결 수" icon={<CheckCircle2 size={18} />} color="#16A34A" background="#F0FDF4" />
      <StatCard label="학생 해결률" value={summary.solveRate} unit="%" description="시도한 학생·문제 중 해결 비율" icon={<Target size={18} />} color="#7C3AED" background="#F3E8FF" />
    </div>
  );
}
