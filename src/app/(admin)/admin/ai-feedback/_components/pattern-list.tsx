import { Pencil, Sparkles, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import type { DbAiFeedbackPattern } from '@/lib/types/db';
import { getTypeStyle } from '../_lib/presentation';

export function PatternList({ patterns, loading, onToggleActive, onEdit, onDelete }: {
  patterns: DbAiFeedbackPattern[];
  loading: boolean;
  onToggleActive: (pattern: DbAiFeedbackPattern) => void;
  onEdit: (pattern: DbAiFeedbackPattern) => void;
  onDelete: (pattern: DbAiFeedbackPattern) => void;
}) {
  if (loading) return <div className="flex flex-col gap-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="bg-white rounded-2xl animate-pulse" style={{ height: 100, border: '1px solid #E5E8EC' }} />)}</div>;
  if (patterns.length === 0) return <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-20 gap-2" style={{ border: '1px solid #E5E8EC' }}><Sparkles size={40} style={{ color: '#E5E8EC' }} /><p style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }}>등록된 기준이 없습니다</p><p style={{ fontSize: '14px', color: '#5A6270' }}>새 패턴을 추가해 AI 피드백 기준을 만들어보세요</p></div>;
  return (
    <div className="flex flex-col gap-3">
      {patterns.map((pattern) => {
        const typeStyle = getTypeStyle(pattern.pattern_type);
        return (
          <div key={pattern.id} className="bg-white rounded-2xl p-5 flex flex-col gap-3" style={{ border: '1px solid #E5E8EC', opacity: pattern.is_active ? 1 : 0.6 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap"><span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: typeStyle.bg, color: typeStyle.color }}>{pattern.pattern_type}</span><span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>{pattern.error_category}</span>{!pattern.is_active && <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#F0F1F3', color: '#8A8F98' }}>미사용</span>}</div>
              <div className="flex items-center gap-1 flex-shrink-0"><button onClick={() => onToggleActive(pattern)} title={pattern.is_active ? '사용 중지' : '사용 시작'} className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-[#F0F1F3]">{pattern.is_active ? <ToggleRight size={18} style={{ color: '#16A34A' }} /> : <ToggleLeft size={18} style={{ color: '#BCC0C7' }} />}</button><button onClick={() => onEdit(pattern)} className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-[#EAF1FD]" title="수정"><Pencil size={14} style={{ color: '#1B64DA' }} /></button><button onClick={() => onDelete(pattern)} className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-[#FEE2E2]" title="삭제"><Trash2 size={14} style={{ color: '#DC2626' }} /></button></div>
            </div>
            <p style={{ fontSize: '13px', color: '#5A6270', lineHeight: 1.6 }}>{pattern.criteria}</p>
            {pattern.example_code && <pre className="rounded-xl p-3 overflow-x-auto" style={{ backgroundColor: '#1E1E1E', color: '#D4D4D4', fontSize: '12px', fontFamily: 'monospace', lineHeight: 1.6 }}>{pattern.example_code}</pre>}
            <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#F6F7F9' }}><p style={{ fontSize: '13px', color: '#16181D', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{pattern.tutor_feedback}</p></div>
          </div>
        );
      })}
    </div>
  );
}
