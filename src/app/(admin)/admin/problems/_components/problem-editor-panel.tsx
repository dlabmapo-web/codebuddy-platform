import dynamic from 'next/dynamic';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import type { useProblemEditor } from '../_hooks/use-problem-editor';
import { ProblemBasicFields, Tooltip } from './problem-basic-fields';
import { ProblemHints } from './problem-hints';
import { ProblemTestCases } from './problem-test-cases';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center" style={{ height: 200, backgroundColor: '#1E1E1E', borderRadius: 8 }}><span style={{ fontSize: '12px', color: '#5A6270' }}>에디터 로딩 중...</span></div>,
});

type Editor = ReturnType<typeof useProblemEditor>;

function Section({ label, expanded, onToggle, tooltip, children }: { label: string; expanded: boolean; onToggle: () => void; tooltip?: string; children: ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid #E5E8EC' }}>
      <button onClick={onToggle} className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface transition-colors"><span className="flex items-center gap-2" style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>{label}{tooltip && <Tooltip text={tooltip} />}</span>{expanded ? <ChevronUp size={16} style={{ color: '#5A6270' }} /> : <ChevronDown size={16} style={{ color: '#5A6270' }} />}</button>
      {expanded && <div className="px-5 pb-5 pt-2">{children}</div>}
    </div>
  );
}

export function ProblemEditorPanel({ editor, curriculumPath }: { editor: Editor; curriculumPath: string }) {
  if (editor.panelMode === 'closed') return null;
  return (
    <div className="bg-white rounded-2xl flex flex-col min-w-0 overflow-hidden" style={{ flex: '1', border: '1px solid #E5E8EC', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 80px)' }}>
      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #E5E8EC' }}><h2 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D' }}>{editor.panelMode === 'create' ? '문제 등록' : '문제 수정'}</h2><button onClick={editor.close} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface transition-colors"><X size={16} style={{ color: '#5A6270' }} /></button></div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <Section label="기본 정보" expanded={editor.expandedSection === 'basic'} onToggle={() => editor.setExpandedSection(editor.expandedSection === 'basic' ? 'starter' : 'basic')}><ProblemBasicFields form={editor.form} curriculumPath={curriculumPath} onChange={editor.updateField} /></Section>
        <Section label="초기 코드 (에디터 기본값)" expanded={editor.expandedSection === 'starter'} onToggle={() => editor.setExpandedSection(editor.expandedSection === 'starter' ? 'basic' : 'starter')}>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2D2D2D' }}><div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: '#2D2D2D' }}><span style={{ fontSize: '12px', color: '#8C8C8C', fontFamily: 'monospace' }}>Python 3</span></div><MonacoEditor height={220} language="python" theme="paircode-dark" beforeMount={registerPaircodeTheme} value={editor.form.starter_code} onChange={(value) => editor.updateField('starter_code', value ?? '')} options={{ fontSize: 13, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', padding: { top: 10, bottom: 10 }, automaticLayout: true, tabSize: 4, wordWrap: 'off' }} /></div>
        </Section>
        <Section label={`정답 (${editor.form.test_cases.length}개)`} expanded={editor.expandedSection === 'testcases'} onToggle={() => editor.setExpandedSection(editor.expandedSection === 'testcases' ? 'starter' : 'testcases')}><ProblemTestCases testCases={editor.form.test_cases} onUpdate={editor.updateTestCase} onAdd={editor.addTestCase} onRemove={editor.removeTestCase} /></Section>
        <Section label={`힌트 (${editor.form.hints.length}개)`} expanded={editor.expandedSection === 'hints'} onToggle={() => editor.setExpandedSection(editor.expandedSection === 'hints' ? 'starter' : 'hints')}><ProblemHints hints={editor.form.hints} onUpdate={editor.updateHint} onAdd={editor.addHint} onRemove={editor.removeHint} /></Section>
      </div>
      <div className="flex items-center gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid #E5E8EC' }}><button onClick={editor.close} className="flex-1 rounded-xl" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button><button onClick={editor.save} disabled={editor.saving} className="flex-1 rounded-xl text-white disabled:opacity-60" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}>{editor.saving ? '저장 중...' : editor.panelMode === 'edit' ? '수정 완료' : '등록'}</button></div>
    </div>
  );
}
