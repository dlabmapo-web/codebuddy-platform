import { BookOpen, ChevronRight, Layers3 } from 'lucide-react';
import { stageVisual } from '../_lib/presentation';
import type { StageItem, SubjectItem } from '../_lib/types';

type CurriculumCatalogProps = {
  subjects: SubjectItem[];
  onOpenStage: (subjectId: string, stageId: string) => void;
};

function StageCard({ stage, onClick }: { stage: StageItem; onClick: () => void }) {
  const visual = stageVisual(stage.order_no);
  const progress = stage.problem_count > 0
    ? Math.round((stage.solved_count / stage.problem_count) * 100)
    : 0;

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-2xl bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
      style={{ border: '1px solid #E5E8EC', boxShadow: '0 2px 8px rgba(22,24,29,0.04)' }}
    >
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${visual.background} 0%, #FFFFFF 100%)` }}
      >
        <div className="absolute -right-7 -top-8 rounded-full opacity-40" style={{ width: 96, height: 96, backgroundColor: visual.accent }} />
        <div className="absolute -bottom-10 -left-4 rounded-full opacity-30" style={{ width: 80, height: 80, backgroundColor: visual.accent }} />
        <div
          className="relative flex items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
          style={{ width: 58, height: 58, color: visual.color, backgroundColor: '#FFFFFF', boxShadow: '0 8px 24px rgba(22,24,29,0.10)' }}
        >
          <visual.Icon size={28} strokeWidth={1.8} />
        </div>
        <span
          className="absolute left-3 top-3 rounded-full px-2.5 py-1"
          style={{ fontSize: '11px', fontWeight: 700, color: visual.color, backgroundColor: '#FFFFFFCC' }}
        >
          STEP {stage.order_no}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate" style={{ fontSize: '15px', fontWeight: 700, color: '#16181D' }}>{stage.title}</h3>
            <p className="mt-1 line-clamp-2" style={{ minHeight: 38, fontSize: '12px', lineHeight: 1.55, color: '#8A8F98' }}>
              {stage.description || '이 단계의 핵심 개념을 문제로 익혀보세요.'}
            </p>
          </div>
          <ChevronRight size={17} className="mt-0.5 shrink-0 text-[#BCC0C7] transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span style={{ fontSize: '11px', color: '#8A8F98' }}>챕터 {stage.chapter_count} · 문제 {stage.problem_count}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: progress === 100 ? '#15803D' : '#1B64DA' }}>
              {stage.solved_count}/{stage.problem_count}
            </span>
          </div>
          <div className="overflow-hidden rounded-full" style={{ height: 5, backgroundColor: '#EEF0F3' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#16A34A' : visual.color }} />
          </div>
        </div>
      </div>
    </button>
  );
}

export function CurriculumCatalog({ subjects, onOpenStage }: CurriculumCatalogProps) {
  return (
    <>
      {subjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20" style={{ border: '1px solid #E5E8EC' }}>
          <BookOpen size={38} style={{ color: '#D1D5DB' }} />
          <p className="mt-3" style={{ fontSize: '15px', fontWeight: 700, color: '#16181D' }}>공개된 커리큘럼이 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {subjects.map((subject) => (
            <section key={subject.id}>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 min-w-7 items-center justify-center rounded-lg px-2"
                      style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF', backgroundColor: '#1B64DA' }}
                    >
                      {subject.order_no}
                    </span>
                    <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#16181D' }}>{subject.title}</h2>
                  </div>
                  {subject.description && <p className="mt-1.5" style={{ fontSize: '13px', color: '#8A8F98' }}>{subject.description}</p>}
                </div>
                <span className="shrink-0" style={{ fontSize: '12px', color: '#8A8F98' }}>{subject.stages.length}개 단계</span>
              </div>
              {subject.stages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D7DAE0] px-5 py-8 text-center" style={{ fontSize: '13px', color: '#8A8F98' }}>
                  준비 중인 과목입니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {subject.stages.map((stage) => (
                    <StageCard key={stage.id} stage={stage} onClick={() => onOpenStage(subject.id, stage.id)} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export function CurriculumCatalogHeader() {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light text-primary">
          <Layers3 size={19} />
        </div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1B64DA' }}>LEARNING PATH</span>
      </div>
      <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#16181D', letterSpacing: '-0.025em' }}>어떤 단계부터 시작할까요?</h1>
      <p style={{ fontSize: '14px', color: '#5A6270' }}>과목별 학습 단계를 살펴보고, 원하는 카드에서 바로 시작하세요.</p>
    </header>
  );
}
