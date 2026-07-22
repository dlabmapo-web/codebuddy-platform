import { Plus, X } from 'lucide-react';
import type { TestCaseForm } from '../_lib/types';

export function ProblemTestCases({ testCases, onUpdate, onAdd, onRemove }: {
  testCases: TestCaseForm[];
  onUpdate: (index: number, field: keyof TestCaseForm, value: unknown) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {testCases.map((testCase, index) => (
        <div key={index} className="rounded-xl p-4" style={{ border: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}>
          <div className="flex items-center justify-between mb-2"><span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>정답 {index + 1}</span>{testCases.length > 1 && <button onClick={() => onRemove(index)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#FEE2E2]"><X size={12} style={{ color: '#DC2626' }} /></button>}</div>
          <div className="mb-3"><div style={{ fontSize: '11px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>입력값 (input)</div><textarea className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #E5E8EC', fontFamily: 'monospace', fontSize: '13px', backgroundColor: '#FFFFFF' }} rows={2} value={testCase.input} onChange={(event) => onUpdate(index, 'input', event.target.value)} /></div>
          <div><div style={{ fontSize: '11px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>정답 출력값</div><textarea className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #2D2D2D', fontFamily: 'monospace', fontSize: '13px', backgroundColor: '#1E1E1E', color: '#D4D4D4' }} rows={3} value={testCase.expected_output} onChange={(event) => onUpdate(index, 'expected_output', event.target.value)} /></div>
        </div>
      ))}
      <button onClick={onAdd} className="flex items-center gap-2 px-3 rounded-lg" style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: '#5A6270', width: '100%', justifyContent: 'center' }}><Plus size={14} /> 정답 추가</button>
    </div>
  );
}
