import { ChevronDown, Code2, PenLine, X } from 'lucide-react';
import type { DraftSession } from '../_lib/types';

type DraftsPanelProps = {
  drafts: DraftSession[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProblem: (problemId: string) => void;
  onDeleteDraft: (sessionId: string) => Promise<void>;
};

export function DraftsPanel({
  drafts,
  open,
  onOpenChange,
  onOpenProblem,
  onDeleteDraft,
}: DraftsPanelProps) {
  if (drafts.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-white" style={{ border: '1px solid #BFDBFE' }}>
      <button
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        style={{ backgroundColor: '#F5F9FF' }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE] text-primary">
          <PenLine size={15} />
        </div>
        <div className="flex-1">
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#16181D' }}>이어서 풀기</span>
          <span className="ml-2" style={{ fontSize: '12px', color: '#8A8F98' }}>저장된 코드 {drafts.length}개</span>
        </div>
        <ChevronDown size={16} className={`text-[#8A8F98] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenProblem(draft.problem_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpenProblem(draft.problem_id);
              }}
              className="flex items-center gap-3 bg-white px-4 py-3 text-left transition-colors hover:bg-[#FAFBFC]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-sub">
                <Code2 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{draft.problems?.title}</p>
                <p style={{ fontSize: '11px', color: '#8A8F98' }}>코드 {draft.final_code.trim().split('\n').length}줄 저장됨</p>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeleteDraft(draft.id);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#BCC0C7] hover:bg-[#FEE2E2] hover:text-danger"
                aria-label="저장된 코드 삭제"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
