import { ChevronDown, ChevronRight } from 'lucide-react';
import { DIFF_COLOR, DIFF_LABEL } from '../../_lib/problem-difficulty';
import type { useProblemProgress } from '../_hooks/use-problem-progress';
import { formatElapsed } from '../_lib/presentation';
import { ProgressFilters } from './progress-filters';

export function ProblemProgressPanel({ progress }: { progress: ReturnType<typeof useProblemProgress> }) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-end gap-3">
        <ProgressFilters
          subjectId={progress.subjectId}
          stageId={progress.stageId}
          chapterId={progress.chapterId}
          subjects={progress.subjectsForFilter}
          stages={progress.stagesForFilter}
          chapters={progress.chaptersForFilter}
          onSubjectChange={progress.selectSubject}
          onStageChange={progress.selectStage}
          onChapterChange={progress.selectChapter}
        />
        <span style={{ fontSize: '12px', color: '#8A8F98', paddingBottom: 8 }}>{progress.filteredProblems.length}개 문제</span>
      </div>

      {progress.groupedChapters.length === 0 ? (
        <div className="bg-white rounded-xl flex flex-col items-center justify-center py-16" style={{ border: '1px solid #E5E8EC' }}>
          <p style={{ fontSize: '14px', color: '#BCC0C7' }}>표시할 문제가 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 min-w-0">
          {progress.groupedChapters.map((group) => {
            const collapsed = progress.collapsedChapters.has(group.chapterId);
            return (
              <div key={group.chapterId} className="bg-white rounded-xl overflow-hidden min-w-0" style={{ border: '1px solid #E5E8EC' }}>
                <button
                  onClick={() => progress.toggleChapter(group.chapterId)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ backgroundColor: '#F0F7FF', borderBottom: collapsed ? 'none' : '1px solid #E5E8EC' }}
                >
                  {collapsed ? <ChevronRight size={15} style={{ color: '#5A6270', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: '#5A6270', flexShrink: 0 }} />}
                  <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 26, height: 26, backgroundColor: '#1B64DA', color: '#fff', fontSize: '12px', fontWeight: 700 }}>{group.chapterOrder}</span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>{group.chapterTitle}</div>
                    <div className="truncate" style={{ fontSize: '11px', color: '#8A8F98', marginTop: 1 }}>{group.subjectTitle} / {group.stageTitle} · {group.problems.length}문제</div>
                  </div>
                </button>

                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 720, tableLayout: 'fixed' }}>
                      <colgroup><col style={{ width: 72 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 88 }} /><col style={{ width: 80 }} /><col style={{ width: 140 }} /><col style={{ width: 110 }} /></colgroup>
                      <thead>
                        <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E8EC' }}>
                          {['번호', '문제', '난이도', '응시 학생', '제출 수', '정답률', '평균 소요'].map((column) => (
                            <th key={column} className="px-3 py-2.5 text-left whitespace-nowrap" style={{ fontSize: '11px', fontWeight: 600, color: '#8A8F98' }}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.problems.map((problem, index) => (
                          <tr key={problem.id} style={{ borderBottom: index < group.problems.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '12px', fontWeight: 700, color: '#8A8F98', fontFamily: 'monospace' }}>{problem.chapter_order_no}-{problem.order_no}</td>
                            <td className="px-3 py-3 min-w-0"><span className="block truncate" style={{ fontSize: '13px', fontWeight: 500, color: '#16181D' }} title={problem.title}>{problem.title}</span></td>
                            <td className="px-3 py-3 whitespace-nowrap"><span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_COLOR[problem.difficulty].bg, color: DIFF_COLOR[problem.difficulty].color }}>{DIFF_LABEL[problem.difficulty]}</span></td>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '13px', color: '#16181D' }}>{problem.student_count}명</td>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '13px', color: '#16181D' }}>{problem.submission_count}회</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="rounded-full overflow-hidden shrink-0" style={{ width: 56, height: 5, backgroundColor: '#E5E8EC' }}>
                                  <div className="h-full rounded-full" style={{ width: `${problem.pass_rate}%`, backgroundColor: problem.pass_rate >= 70 ? '#16A34A' : problem.pass_rate >= 40 ? '#1B64DA' : '#DC2626' }} />
                                </div>
                                <span className="whitespace-nowrap" style={{ fontSize: '12px', fontWeight: 600, color: '#16181D' }}>{problem.pass_rate}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '12px', color: '#8A8F98' }}>{formatElapsed(problem.avg_elapsed_sec)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
