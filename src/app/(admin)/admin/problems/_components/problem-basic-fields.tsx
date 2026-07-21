import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { HelpCircle } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';
import type { ProblemForm } from '../_lib/types';

const RichEditor = dynamic(() => import('@/components/editor/RichEditor').then((module) => ({ default: module.RichEditor })), {
  ssr: false,
  loading: () => <div className="rounded-xl animate-pulse" style={{ height: 200, backgroundColor: '#F3F4F6', border: '1px solid #E5E8EC' }} />,
});

export function Tooltip({ text, direction = 'right' }: { text: string; direction?: 'right' | 'left' }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      <HelpCircle size={14} style={{ color: '#BCC0C7', cursor: 'pointer' }} />
      {visible && <span className="absolute z-50 top-0 rounded-lg px-3 py-2 text-white" style={{ backgroundColor: '#2D3140', fontSize: '12px', lineHeight: 1.6, whiteSpace: 'pre-line', width: 220, boxShadow: '0 4px 12px rgba(22,24,29,0.2)', pointerEvents: 'none', ...(direction === 'right' ? { left: '1.5rem' } : { right: '1.5rem' }) }}>{text}</span>}
    </span>
  );
}

function FormField({ label, required, tooltip, children }: { label: string; required?: boolean; tooltip?: string; children: ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>{label}{required && <span style={{ color: '#DC2626' }}>*</span>}{tooltip && <Tooltip text={tooltip} />}</label>
      {children}
    </div>
  );
}

export function ProblemBasicFields({ form, curriculumPath, onChange }: {
  form: ProblemForm;
  curriculumPath: string;
  onChange: <Key extends keyof ProblemForm>(key: Key, value: ProblemForm[Key]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormField label="챕터" required tooltip="현재 선택된 챕터에 문제가 등록됩니다."><div className="px-3 rounded-lg flex items-center" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', backgroundColor: '#F6F7F9' }}>{curriculumPath}</div></FormField>
      <FormField label="문제 제목" required><input className="w-full px-3 rounded-lg focus:outline-none" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} placeholder="예) 두 수의 합, 피보나치 수열" value={form.title} onChange={(event) => onChange('title', event.target.value)} /></FormField>
      <FormField label="난이도" required><select className="w-full px-3 rounded-lg focus:outline-none" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} value={form.difficulty} onChange={(event) => onChange('difficulty', event.target.value as ProblemDifficulty)}><option value="easy">쉬움</option><option value="medium">보통</option><option value="hard">어려움</option></select></FormField>
      <FormField label="문제 내용" required><RichEditor value={form.description} onChange={(html) => onChange('description', html)} placeholder="학생에게 보여줄 문제 내용을 입력하세요." /></FormField>
      <FormField label="조건 및 제약 (선택)" tooltip="풀이에서 주의해야 할 범위나 규칙을 입력하세요."><textarea className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }} rows={3} value={form.constraint_text} onChange={(event) => onChange('constraint_text', event.target.value)} /></FormField>
      <label className="flex items-center gap-2 cursor-pointer w-fit"><input type="checkbox" checked={form.is_published} onChange={(event) => onChange('is_published', event.target.checked)} className="w-4 h-4 accent-primary" /><span style={{ fontSize: '14px', color: '#16181D' }}>즉시 공개</span></label>
      <label className="flex items-center gap-2 cursor-pointer w-fit"><input type="checkbox" checked={form.use_ai_feedback} onChange={(event) => onChange('use_ai_feedback', event.target.checked)} className="w-4 h-4 accent-primary" /><span style={{ fontSize: '14px', color: '#16181D' }}>AI 피드백 사용</span></label>
    </div>
  );
}
