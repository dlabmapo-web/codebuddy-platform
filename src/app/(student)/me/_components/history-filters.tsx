import { Layers3 } from 'lucide-react';
import type { CurriculumOptions, SubmissionFilter } from '../_lib/types';

type HistoryFiltersProps = {
  filter: SubmissionFilter;
  resultCount: number;
  subjectId: string;
  stageId: string;
  chapterId: string;
  curriculumOptions: CurriculumOptions;
  onFilterChange: (filter: SubmissionFilter) => void;
  onSubjectChange: (subjectId: string) => void;
  onStageChange: (stageId: string) => void;
  onChapterChange: (chapterId: string) => void;
};

export function HistoryFilters({
  filter,
  resultCount,
  subjectId,
  stageId,
  chapterId,
  curriculumOptions,
  onFilterChange,
  onSubjectChange,
  onStageChange,
  onChapterChange,
}: HistoryFiltersProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        {(['all', 'pass', 'fail'] as const).map((filterOption) => {
          const label = filterOption === 'all' ? '전체 기록' : filterOption === 'pass' ? '정답만' : '오답만';
          return (
            <button
              key={filterOption}
              onClick={() => onFilterChange(filterOption)}
              className="rounded-2xl transition-colors px-5"
              style={{
                height: 44,
                fontSize: '14px',
                fontWeight: filter === filterOption ? 700 : 500,
                backgroundColor: filter === filterOption ? '#1B64DA' : '#FFFFFF',
                color: filter === filterOption ? '#FFFFFF' : '#5A6270',
                border: `1px solid ${filter === filterOption ? '#1B64DA' : '#E5E8EC'}`,
              }}
            >
              {label}
            </button>
          );
        })}
        {resultCount > 0 && (
          <span style={{ fontSize: '13px', color: '#BCC0C7', marginLeft: 4 }}>{resultCount}개</span>
        )}
      </div>

      <section className="rounded-2xl bg-white p-4" style={{ border: '1px solid #E5E8EC' }}>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Layers3 size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#16181D' }}>학습 경로 필터</h2>
            <p style={{ fontSize: '11px', color: '#8A8F98', marginTop: 1 }}>과목·단계·챕터별 풀이기록을 확인하세요.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={subjectId}
            onChange={(event) => onSubjectChange(event.target.value)}
            className="h-10 rounded-xl px-3 outline-none"
            style={{ border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D' }}
          >
            <option value="">전체 과목</option>
            {curriculumOptions.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.order_no}. {subject.title}</option>
            ))}
          </select>
          <select
            value={stageId}
            disabled={!subjectId}
            onChange={(event) => onStageChange(event.target.value)}
            className="h-10 rounded-xl px-3 outline-none disabled:opacity-50"
            style={{ border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D' }}
          >
            <option value="">전체 단계</option>
            {curriculumOptions.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.order_no}. {stage.title}</option>
            ))}
          </select>
          <select
            value={chapterId}
            disabled={!stageId}
            onChange={(event) => onChapterChange(event.target.value)}
            className="h-10 rounded-xl px-3 outline-none disabled:opacity-50"
            style={{ border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D' }}
          >
            <option value="">전체 챕터</option>
            {curriculumOptions.chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.order_no}. {chapter.title}</option>
            ))}
          </select>
        </div>
      </section>
    </>
  );
}
