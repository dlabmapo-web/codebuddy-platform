import { ChevronDown, ChevronRight, Clock, FileCode2 } from 'lucide-react';
import { DIFF_COLOR, DIFF_LABEL } from '../../_lib/problem-difficulty';
import type { useStudentProgress } from '../_hooks/use-student-progress';
import { formatDate, formatElapsed, STATUS_CONFIG } from '../_lib/presentation';
import type { ProblemStat } from '../_lib/types';

export function StudentProgressPanel({
  progress,
  problemStats,
}: {
  progress: ReturnType<typeof useStudentProgress>;
  problemStats: ProblemStat[];
}) {
  return (
    <div className="flex gap-4 min-w-0" style={{ minHeight: 480 }}>
      <div className="bg-white rounded-xl overflow-hidden shrink-0" style={{ width: 176, border: '1px solid #E5E8EC' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#8A8F98' }}>학생 목록</span>
        </div>
        {progress.students.length === 0 ? (
          <p className="px-4 py-6 text-center" style={{ fontSize: '12px', color: '#BCC0C7' }}>학생 없음</p>
        ) : progress.students.map((student) => (
          <button
            key={student.id}
            onClick={() => progress.selectStudent(student)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
            style={{
              borderLeft: progress.selectedStudent?.id === student.id ? '3px solid #1B64DA' : '3px solid transparent',
              backgroundColor: progress.selectedStudent?.id === student.id ? '#EFF6FF' : 'transparent',
              fontSize: '13px',
              fontWeight: progress.selectedStudent?.id === student.id ? 600 : 400,
              color: progress.selectedStudent?.id === student.id ? '#1B64DA' : '#16181D',
            }}
          >
            <div
              className="rounded-full flex items-center justify-center shrink-0 font-semibold"
              style={{ width: 26, height: 26, fontSize: '11px', backgroundColor: progress.selectedStudent?.id === student.id ? '#DBEAFE' : '#F3F4F6', color: '#1B64DA' }}
            >
              {student.name.charAt(0)}
            </div>
            {student.name}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
            {progress.selectedStudent ? `${progress.selectedStudent.name}님의 제출 기록` : '학생을 선택하세요'}
          </span>
          {progress.selectedStudent && (
            <span style={{ fontSize: '12px', color: '#8A8F98' }}>
              총 {progress.submissions.length}회 제출 · 정답 {progress.submissions.filter((submission) => submission.status === 'pass').length}회
            </span>
          )}
        </div>

        {!progress.loading && progress.problems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <FileCode2 size={32} style={{ color: '#E5E8EC' }} />
            <p style={{ fontSize: '14px', color: '#BCC0C7' }}>제출 기록이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F3F4F6', opacity: progress.loading ? 0.4 : 1, transition: 'opacity 0.15s' }}>
            {progress.problems.map(([problemId, problem]) => {
              const submissions = [...(progress.groupedSubmissions[problemId] ?? [])].sort(
                (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
              );
              const best = submissions.find((submission) => submission.status === 'pass') ?? submissions[0];
              const expanded = progress.expandedProblems.has(problemId);
              const difficulty = problem?.difficulty;
              const status = best ? STATUS_CONFIG[best.status] : null;
              const meta = problemStats.find((problemStat) => problemStat.id === problemId);

              return (
                <div key={problemId}>
                  <button
                    onClick={() => progress.toggleProblem(problemId)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    {expanded ? <ChevronDown size={15} style={{ color: '#8A8F98', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: '#8A8F98', flexShrink: 0 }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
                          {meta
                            ? `${meta.chapter_order_no}-${meta.order_no}. ${problem?.title}`
                            : `${problem?.problem_no}. ${problem?.title}`}
                        </span>
                        {difficulty && (
                          <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: DIFF_COLOR[difficulty].bg, color: DIFF_COLOR[difficulty].color }}>
                            {DIFF_LABEL[difficulty]}
                          </span>
                        )}
                      </div>
                      {meta && (
                        <p className="truncate mt-0.5" style={{ fontSize: '11px', color: '#8A8F98' }}>
                          {meta.subject_title} / {meta.stage_title} / {meta.chapter_title}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span style={{ fontSize: '12px', color: '#8A8F98' }}>{submissions.length}회 제출</span>
                      {status && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: status.bg }}>
                          <status.Icon size={13} style={{ color: status.color }} />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: status.color }}>{status.label}</span>
                        </div>
                      )}
                      {best?.elapsed_sec && <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#8A8F98' }}><Clock size={12} /> {formatElapsed(best.elapsed_sec)}</span>}
                    </div>
                  </button>

                  {expanded && (
                    <div style={{ backgroundColor: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
                      {submissions.map((submission, index) => {
                        const submissionStatus = STATUS_CONFIG[submission.status];
                        return (
                          <div
                            key={submission.id}
                            className="flex items-center gap-4 px-10 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                            style={{ borderBottom: index < submissions.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                            onClick={() => progress.openCodeModal(submission)}
                          >
                            <submissionStatus.Icon size={14} style={{ color: submissionStatus.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: submissionStatus.color, width: 72 }}>{submissionStatus.label}</span>
                            <span style={{ fontSize: '12px', color: '#8A8F98' }}>{submission.passed_count}/{submission.total_count} 케이스</span>
                            {submission.elapsed_sec && <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#8A8F98' }}><Clock size={11} /> {formatElapsed(submission.elapsed_sec)}</span>}
                            <span style={{ fontSize: '12px', color: '#BCC0C7', marginLeft: 'auto' }}>{formatDate(submission.submitted_at)}</span>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ fontSize: '11px', color: '#1B64DA', backgroundColor: '#EFF6FF', fontWeight: 600 }}><FileCode2 size={11} /> 코드 보기</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
