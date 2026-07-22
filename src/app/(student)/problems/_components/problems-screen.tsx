'use client';

import { BookOpen } from 'lucide-react';
import { CurriculumCatalog, CurriculumCatalogHeader } from './curriculum-catalog';
import { DraftsPanel } from './drafts-panel';
import { StageHeader, StageProblems } from './stage-problems';
import { useProblemsCatalog } from '../_hooks/use-problems-catalog';

function PageSkeleton({ cards = true }: { cards?: boolean }) {
  return (
    <div className={cards ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'flex flex-col gap-3'}>
      {Array.from({ length: cards ? 6 : 5 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl bg-white"
          style={{ height: cards ? 258 : 74, border: '1px solid #E5E8EC' }}
        />
      ))}
    </div>
  );
}

export function ProblemsScreen() {
  const catalog = useProblemsCatalog();

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6">
      {catalog.stageId ? (
        <StageHeader
          subject={catalog.subject}
          stage={catalog.stage}
          solvedCount={catalog.solvedCount}
          totalProblemCount={catalog.totalProblemCount}
          onBack={catalog.goToCatalog}
        />
      ) : (
        <CurriculumCatalogHeader />
      )}

      <DraftsPanel
        drafts={catalog.drafts}
        open={catalog.draftsOpen}
        onOpenChange={catalog.setDraftsOpen}
        onOpenProblem={catalog.openProblem}
        onDeleteDraft={catalog.deleteDraft}
      />

      {catalog.error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16" style={{ border: '1px solid #E5E8EC' }}>
          <BookOpen size={36} style={{ color: '#D1D5DB' }} />
          <p className="mt-3" style={{ fontSize: '14px', color: '#5A6270' }}>{catalog.error}</p>
        </div>
      ) : catalog.loading ? (
        <PageSkeleton cards={!catalog.stageId} />
      ) : catalog.stageId ? (
        <StageProblems
          subject={catalog.subject}
          stage={catalog.stage}
          solvedCount={catalog.solvedCount}
          totalProblemCount={catalog.totalProblemCount}
          query={catalog.query}
          normalizedQuery={catalog.normalizedQuery}
          chapters={catalog.visibleChapters}
          expandedChapters={catalog.expandedChapters}
          draftProblemIds={catalog.draftProblemIds}
          onBack={catalog.goToCatalog}
          onQueryChange={catalog.setQuery}
          onToggleChapter={catalog.toggleChapter}
          onOpenProblem={catalog.openProblem}
        />
      ) : (
        <CurriculumCatalog subjects={catalog.subjects} onOpenStage={catalog.openStage} />
      )}
    </div>
  );
}
