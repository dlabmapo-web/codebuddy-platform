import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { DIFFICULTY_LABEL, DIFFICULTY_STYLE } from '../_lib/presentation';
import type { ProblemRow } from '../_lib/types';

export function ProblemList({
  problems,
  chapterOrder,
  onCreate,
  onEdit,
  onMove,
  onTogglePublish,
  onDelete,
}: {
  problems: ProblemRow[];
  chapterOrder?: number;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onMove: (problem: ProblemRow, direction: -1 | 1) => void;
  onTogglePublish: (problem: ProblemRow) => void;
  onDelete: (problem: ProblemRow) => void;
}) {
  if (problems.length === 0) {
    return (
      <div className="px-4 py-10 text-center" style={{ fontSize: '13px', color: '#BCC0C7' }}>
        아직 문제가 없습니다.
        <button onClick={onCreate} className="block mx-auto mt-3 text-primary" style={{ fontSize: '13px', fontWeight: 600 }}>+ 문제 추가</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {problems.map((problem, index) => (
        <div key={problem.id} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: index < problems.length - 1 ? '1px solid #F0F1F3' : 'none', backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#FAFBFC' }}>
          <span className="shrink-0 text-center" style={{ width: 40, fontSize: '12px', fontWeight: 700, color: '#8A8F98', fontFamily: 'monospace' }}>{chapterOrder}-{index + 1}</span>
          <button onClick={() => onEdit(problem.id)} className="flex-1 min-w-0 text-left truncate" style={{ fontSize: '14px', fontWeight: 500, color: problem.is_published ? '#16181D' : '#8A8F98' }}>{problem.title}</button>
          {problem.use_ai_feedback && <span className="px-2 py-0.5 rounded shrink-0 flex items-center gap-1" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#EEF2FF', color: '#4F46E5' }}><Sparkles size={11} /> AI</span>}
          <span className="px-2 py-0.5 rounded shrink-0" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFFICULTY_STYLE[problem.difficulty].bg, color: DIFFICULTY_STYLE[problem.difficulty].color }}>{DIFFICULTY_LABEL[problem.difficulty]}</span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onMove(problem, -1)} disabled={index === 0} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#F0F1F3] disabled:opacity-30"><ArrowUp size={13} style={{ color: '#5A6270' }} /></button>
            <button onClick={() => onMove(problem, 1)} disabled={index === problems.length - 1} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#F0F1F3] disabled:opacity-30"><ArrowDown size={13} style={{ color: '#5A6270' }} /></button>
            <button onClick={() => onTogglePublish(problem)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#F0F1F3]">{problem.is_published ? <Eye size={14} style={{ color: '#1B64DA' }} /> : <EyeOff size={14} style={{ color: '#BCC0C7' }} />}</button>
            <button onClick={() => onEdit(problem.id)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-primary-light"><Pencil size={13} style={{ color: '#1B64DA' }} /></button>
            <button onClick={() => onDelete(problem)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#FEE2E2]"><Trash2 size={13} style={{ color: '#DC2626' }} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
