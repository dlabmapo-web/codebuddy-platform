import {
  ArrowLeft,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PenLine,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { DIFF_COLOR, DIFF_LABEL, STATUS } from '../_lib/presentation';
import type { ChapterItem, CurriculumMeta } from '../_lib/types';

type StageProblemsProps = {
  subject: CurriculumMeta | null;
  stage: CurriculumMeta | null;
  solvedCount: number;
  totalProblemCount: number;
  query: string;
  normalizedQuery: string;
  chapters: ChapterItem[];
  expandedChapters: Set<string>;
  draftProblemIds: Set<string>;
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onToggleChapter: (chapterId: string) => void;
  onOpenProblem: (problemId: string) => void;
};

export function StageProblems({
  query,
  normalizedQuery,
  chapters,
  expandedChapters,
  draftProblemIds,
  onQueryChange,
  onToggleChapter,
  onOpenProblem,
}: StageProblemsProps) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#16181D' }}>챕터별 문제</h2>
          <p className="mt-1" style={{ fontSize: '13px', color: '#8A8F98' }}>챕터를 펼쳐 문제를 확인하고 학습을 이어가세요.</p>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-xl bg-white px-3 sm:w-72" style={{ border: '1px solid #E5E8EC' }}>
          <Search size={15} style={{ color: '#BCC0C7' }} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none"
            style={{ fontSize: '13px', color: '#16181D' }}
            placeholder="문제 제목 검색"
          />
          {query && (
            <button onClick={() => onQueryChange('')} className="text-[#BCC0C7]" aria-label="검색어 지우기">
              <X size={13} />
            </button>
          )}
        </label>
      </div>

      {chapters.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16" style={{ border: '1px solid #E5E8EC' }}>
          <Search size={32} style={{ color: '#D1D5DB' }} />
          <p className="mt-3" style={{ fontSize: '14px', color: '#8A8F98' }}>검색 결과가 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {chapters.map((chapter) => {
            const expanded = expandedChapters.has(chapter.id) || Boolean(normalizedQuery);
            const completed = chapter.problems.filter((problem) => problem.solve_status === 'solved').length;
            const progress = chapter.problems.length > 0
              ? Math.round((completed / chapter.problems.length) * 100)
              : 0;

            return (
              <section
                key={chapter.id}
                className="overflow-hidden rounded-2xl bg-white"
                style={{ border: expanded ? '1px solid #C7D9F7' : '1px solid #E5E8EC', boxShadow: expanded ? '0 5px 18px rgba(27,100,218,0.06)' : 'none' }}
              >
                <button
                  onClick={() => onToggleChapter(chapter.id)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[#FAFBFC] sm:px-5"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ color: expanded ? '#1B64DA' : '#5A6270', backgroundColor: expanded ? '#EAF1FD' : '#F6F7F9' }}
                  >
                    {completed === chapter.problems.length && chapter.problems.length > 0
                      ? <CheckCircle2 size={19} />
                      : <BookOpen size={19} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#1B64DA' }}>CHAPTER {chapter.order_no}</span>
                      {progress === 100 && (
                        <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5" style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>완료</span>
                      )}
                    </div>
                    <h3 className="mt-0.5 truncate" style={{ fontSize: '15px', fontWeight: 700, color: '#16181D' }}>{chapter.title}</h3>
                    {chapter.description && <p className="mt-0.5 truncate" style={{ fontSize: '12px', color: '#8A8F98' }}>{chapter.description}</p>}
                  </div>
                  <div className="hidden w-36 shrink-0 sm:block">
                    <div className="mb-1 flex justify-between" style={{ fontSize: '11px', color: '#8A8F98' }}>
                      <span>{completed}/{chapter.problems.length} 완료</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF0F3]">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <ChevronDown size={17} className={`shrink-0 text-[#8A8F98] transition-transform ${expanded ? 'rotate-180 text-primary' : ''}`} />
                </button>

                {expanded && (
                  <div className="border-t border-[#EEF0F3] bg-[#FAFBFC] p-2 sm:p-3">
                    {chapter.problems.length === 0 ? (
                      <div className="rounded-xl bg-white px-4 py-7 text-center" style={{ fontSize: '13px', color: '#8A8F98' }}>
                        이 챕터에는 아직 문제가 없습니다.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {chapter.problems.map((problem) => {
                          const status = STATUS[problem.solve_status];
                          const difficulty = DIFF_COLOR[problem.difficulty];
                          const hasDraft = draftProblemIds.has(problem.id);

                          return (
                            <button
                              key={problem.id}
                              onClick={() => onOpenProblem(problem.id)}
                              className="group flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left transition-all hover:border-[#9EBDEC] hover:shadow-sm sm:px-4"
                              style={{ border: hasDraft ? '1px solid #BFDBFE' : '1px solid #E5E8EC' }}
                            >
                              <span
                                className="flex h-8 min-w-12 shrink-0 items-center justify-center rounded-lg px-2"
                                style={{ fontSize: '12px', fontWeight: 800, color: '#5A6270', backgroundColor: '#F6F7F9', fontFamily: 'monospace' }}
                              >
                                {chapter.order_no}-{problem.order_no}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate transition-colors group-hover:text-primary" style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>{problem.title}</p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="rounded-md px-1.5 py-0.5" style={{ fontSize: '10px', fontWeight: 700, color: difficulty.color, backgroundColor: difficulty.bg }}>
                                    {DIFF_LABEL[problem.difficulty]}
                                  </span>
                                  {hasDraft && (
                                    <span className="flex items-center gap-1 rounded-md bg-[#EFF6FF] px-1.5 py-0.5" style={{ fontSize: '10px', fontWeight: 700, color: '#1B64DA' }}>
                                      <PenLine size={9} /> 이어 풀기
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span
                                className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:flex"
                                style={{ fontSize: '11px', fontWeight: 700, color: status.color, backgroundColor: status.bg }}
                              >
                                <status.Icon size={12} />
                                {status.label}
                              </span>
                              <ChevronRight size={17} className="shrink-0 text-[#BCC0C7] transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 py-2" style={{ fontSize: '12px', color: '#8A8F98' }}>
        <Sparkles size={13} style={{ color: '#D97706' }} />
        완료한 문제는 자동으로 학습 진행률에 반영됩니다.
      </div>
    </>
  );
}

export function StageHeader({
  subject,
  stage,
  solvedCount,
  totalProblemCount,
  onBack,
}: Pick<StageProblemsProps, 'subject' | 'stage' | 'solvedCount' | 'totalProblemCount' | 'onBack'>) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl px-5 py-6 sm:px-7"
      style={{ background: 'linear-gradient(135deg, #EFF5FF 0%, #F8FAFF 60%, #F0FDF4 100%)', border: '1px solid #DCE8FA' }}
    >
      <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#BFD3F5]/30" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={onBack}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sub shadow-sm transition-colors hover:text-primary"
            aria-label="전체 단계로 돌아가기"
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <div className="mb-2 flex items-center gap-2" style={{ fontSize: '12px', color: '#5A6270' }}>
              <span>{subject?.title}</span>
              <ChevronRight size={12} />
              <span>STEP {stage?.order_no}</span>
            </div>
            <h1 style={{ fontSize: '25px', fontWeight: 800, color: '#16181D', letterSpacing: '-0.02em' }}>{stage?.title}</h1>
            <p className="mt-1.5 max-w-2xl" style={{ fontSize: '14px', lineHeight: 1.65, color: '#5A6270' }}>
              {stage?.description || '챕터를 하나씩 펼쳐 문제를 풀며 학습을 완성해보세요.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 rounded-2xl bg-white/85 px-5 py-3 shadow-sm backdrop-blur">
          <div>
            <p style={{ fontSize: '11px', color: '#8A8F98' }}>학습 진행률</p>
            <p className="mt-0.5" style={{ fontSize: '18px', fontWeight: 800, color: '#1B64DA' }}>
              {solvedCount}<span style={{ fontSize: '12px', fontWeight: 500, color: '#8A8F98' }}> / {totalProblemCount}</span>
            </p>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
            <BookOpenCheck size={21} />
          </div>
        </div>
      </div>
    </section>
  );
}
