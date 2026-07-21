import { useState } from 'react';
import { X } from 'lucide-react';
import { canSavePattern, createEmptyPatternForm } from '../_lib/pattern-form';
import type { PatternForm } from '../_lib/types';

export function PatternModal({ initial, typeOptions, onSave, onClose, saving }: {
  initial: PatternForm | null;
  typeOptions: string[];
  onSave: (data: PatternForm) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PatternForm>(initial ?? createEmptyPatternForm());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full mx-4 flex flex-col" style={{ maxWidth: 560, maxHeight: '88vh', boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #E5E8EC' }}><h3 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>{initial ? 'AI 피드백 기준 수정' : '새 AI 피드백 기준'}</h3><button onClick={onClose} className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#F6F7F9]" style={{ width: 32, height: 32 }}><X size={16} style={{ color: '#5A6270' }} /></button></div>
        <div className="px-6 py-5 flex flex-col gap-4 overflow-auto">
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>유형 <span style={{ color: '#DC2626' }}>*</span></label><input className="w-full px-3 rounded-lg focus:outline-none" style={{ height: 42, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} placeholder="예) for, while, 조건문, 리스트, 함수" list="ai-feedback-pattern-types" value={form.pattern_type} onChange={(event) => setForm((current) => ({ ...current, pattern_type: event.target.value }))} /><datalist id="ai-feedback-pattern-types">{typeOptions.map((type) => <option key={type} value={type} />)}</datalist><p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 6 }}>기존 유형을 선택하거나 새로운 유형을 직접 입력할 수 있습니다.</p></div>
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>오류 분류 <span style={{ color: '#DC2626' }}>*</span></label><input className="w-full px-3 rounded-lg focus:outline-none" style={{ height: 42, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} placeholder="예) 논리오류(범위), 문법오류, 자료형오류" value={form.error_category} onChange={(event) => setForm((current) => ({ ...current, error_category: event.target.value }))} /></div>
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>판단 기준 <span style={{ color: '#DC2626' }}>*</span></label><textarea className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }} rows={3} placeholder="이 오류로 판단할 코드 패턴을 문제와 무관하게 서술하세요." value={form.criteria} onChange={(event) => setForm((current) => ({ ...current, criteria: event.target.value }))} /></div>
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>예시 코드 (선택)</label><textarea className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #2D2D2D', backgroundColor: '#1E1E1E', color: '#D4D4D4', fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.6 }} rows={5} placeholder="이 오류를 보여주는 예시 코드" value={form.example_code} onChange={(event) => setForm((current) => ({ ...current, example_code: event.target.value }))} /></div>
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>튜터 피드백 <span style={{ color: '#DC2626' }}>*</span></label><textarea className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }} rows={3} placeholder="이 오류에 해당할 때 학생에게 전달할 피드백 문구" value={form.tutor_feedback} onChange={(event) => setForm((current) => ({ ...current, tutor_feedback: event.target.value }))} /></div>
          <label className="flex items-center gap-2 cursor-pointer w-fit"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} className="w-4 h-4 accent-primary" /><span style={{ fontSize: '14px', color: '#16181D' }}>사용 중</span><span style={{ fontSize: '12px', color: '#8A8F98' }}>(끄면 AI 채점 시 이 기준을 사용하지 않습니다)</span></label>
        </div>
        <div className="flex gap-2 px-6 py-5 flex-shrink-0" style={{ borderTop: '1px solid #E5E8EC' }}><button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button><button onClick={() => onSave(form)} disabled={saving || !canSavePattern(form)} className="flex-1 rounded-xl text-white transition-colors disabled:opacity-50" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}>{saving ? '저장 중...' : initial ? '수정' : '추가'}</button></div>
      </div>
    </div>
  );
}
