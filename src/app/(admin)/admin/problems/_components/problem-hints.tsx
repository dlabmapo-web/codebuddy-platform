import { Plus, X } from 'lucide-react';
import type { HintForm } from '../_lib/types';

export function ProblemHints({ hints, onUpdate, onAdd, onRemove }: {
  hints: HintForm[];
  onUpdate: (index: number, hintText: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {hints.map((hint, index) => (
        <div key={index} className="rounded-xl p-4" style={{ border: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}>
          <div className="flex items-center justify-between mb-3"><span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>힌트 {index + 1}</span><button onClick={() => onRemove(index)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#FEE2E2]"><X size={12} style={{ color: '#DC2626' }} /></button></div>
          <textarea className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D', lineHeight: 1.6 }} rows={3} value={hint.hint_text} onChange={(event) => onUpdate(index, event.target.value)} />
        </div>
      ))}
      <button onClick={onAdd} className="flex items-center gap-2 px-3 rounded-lg" style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: '#5A6270', width: '100%', justifyContent: 'center' }}><Plus size={14} /> 힌트 추가</button>
    </div>
  );
}
