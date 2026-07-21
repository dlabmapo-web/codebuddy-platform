import { AlertTriangle } from 'lucide-react';
import type { StudentNeedingHelp } from '@/lib/types/teacherDashboard';

export function StudentsNeedingHelp({ students }: { students: StudentNeedingHelp[] }) {
  return (
    <section className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
        <AlertTriangle size={15} style={{ color: '#D97706' }} />
        <div><h3 style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>지원이 필요한 학생</h3><p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 1 }}>오답이 2회 이상이고 해결률이 60% 미만인 학생입니다.</p></div>
      </div>
      {students.length === 0 ? (
        <div className="px-5 py-8 text-center" style={{ fontSize: '13px', color: '#8A8F98' }}>현재 기준에 해당하는 학생이 없습니다.</div>
      ) : (
        <div className="divide-y divide-[#F3F4F6]">
          {students.map((student) => (
            <div key={student.studentId} className="flex items-center gap-4 px-5 py-3">
              <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 34, height: 34, backgroundColor: '#FFF7ED', color: '#D97706', fontSize: '13px', fontWeight: 700 }}>{student.name.charAt(0)}</div>
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{student.name}</span><span style={{ fontSize: '11px', color: '#BCC0C7' }}>@{student.username}</span></div><p style={{ fontSize: '11px', color: '#8A8F98', marginTop: 2 }}>제출 {student.submissionCount}회 · 해결 {student.solvedCount}건</p></div>
              <div className="text-right shrink-0"><strong style={{ fontSize: '14px', color: '#DC2626' }}>오답 {student.wrongAnswerCount}회</strong><p style={{ fontSize: '11px', color: '#8A8F98', marginTop: 2 }}>해결률 {student.solveRate}%</p></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
