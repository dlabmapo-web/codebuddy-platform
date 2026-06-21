'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, X, Check, HelpCircle } from 'lucide-react';
import type { DbProblem, DbTestCase, DbProblemHint, ProblemDifficulty } from '@/lib/types/db';
import { registerPaircodeTheme } from '@/lib/monaco/theme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ height: 200, backgroundColor: '#1E1E1E', borderRadius: 8 }}>
      <span style={{ fontSize: '12px', color: '#5A6270' }}>에디터 로딩 중...</span>
    </div>
  ),
});

type ProblemRow = Pick<DbProblem, 'id' | 'problem_no' | 'title' | 'difficulty' | 'is_published' | 'created_at'>;

type TestCaseForm = {
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
};

type HintForm = {
  hint_text: string;
  trigger_pattern: string;
  order_no: number;
};

type ProblemForm = {
  title: string;
  difficulty: ProblemDifficulty;
  description: string;
  input_format: string;
  output_format: string;
  constraint_text: string;
  starter_code: string;
  is_published: boolean;
  test_cases: TestCaseForm[];
  hints: HintForm[];
};

const EMPTY_FORM: ProblemForm = {
  title: '',
  difficulty: 'easy',
  description: '',
  input_format: '',
  output_format: '',
  constraint_text: '',
  starter_code: '',
  is_published: false,
  test_cases: [{ input: '', expected_output: '', is_sample: true, is_hidden: false, order_no: 1 }],
  hints: [],
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

function Tooltip({ text, direction = 'right' }: { text: string; direction?: 'right' | 'left' }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      <HelpCircle size={14} style={{ color: '#BCC0C7', cursor: 'pointer' }} />
      {visible && (
        <span
          className="absolute z-50 top-0 rounded-lg px-3 py-2 text-white"
          style={{
            backgroundColor: '#2D3140',
            fontSize: '12px',
            lineHeight: 1.6,
            whiteSpace: 'pre-line',
            width: 220,
            boxShadow: '0 4px 12px rgba(22,24,29,0.2)',
            pointerEvents: 'none',
            ...(direction === 'right' ? { left: '1.5rem' } : { right: '1.5rem' }),
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function DeleteConfirmModal({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 w-full max-w-xs mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D', marginBottom: 8 }}>문제 삭제</h3>
        <p style={{ fontSize: '14px', color: '#5A6270', marginBottom: 20 }}>
          <span style={{ fontWeight: 600, color: '#16181D' }}>{title}</span> 문제를 삭제하시겠습니까?<br />
          테스트케이스와 힌트도 함께 삭제됩니다.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg transition-colors" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg text-white transition-colors"
            style={{ height: 40, backgroundColor: '#DC2626', fontSize: '14px', fontWeight: 600 }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B91C1C')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminProblemsPage() {
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelMode, setPanelMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProblemRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'err' } | null>(null);
  const [expandedSection, setExpandedSection] = useState<'basic' | 'starter' | 'testcases' | 'hints'>('basic');

  const showToast = (message: string, type: 'ok' | 'err') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/problems');
    const json = await res.json();
    setProblems(json.problems ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProblems(); }, [fetchProblems]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setPanelMode('create');
    setExpandedSection('basic');
  };

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/admin/problems/${id}`);
    const json = await res.json();
    if (!json.problem) { showToast('문제를 불러올 수 없습니다.', 'err'); return; }
    const { problem, test_cases, hints } = json as { problem: DbProblem; test_cases: DbTestCase[]; hints: DbProblemHint[] };
    setForm({
      title: problem.title,
      difficulty: problem.difficulty,
      description: problem.description,
      input_format: problem.input_format ?? '',
      output_format: problem.output_format ?? '',
      constraint_text: problem.constraint_text ?? '',
      starter_code: problem.starter_code ?? '',
      is_published: problem.is_published,
      test_cases: test_cases.length > 0
        ? test_cases.map((tc) => ({ input: tc.input, expected_output: tc.expected_output, is_sample: tc.is_sample, is_hidden: tc.is_hidden, order_no: tc.order_no }))
        : [{ input: '', expected_output: '', is_sample: true, is_hidden: false, order_no: 1 }],
      hints: hints.map((h) => ({ hint_text: h.hint_text, trigger_pattern: h.trigger_pattern ?? '', order_no: h.order_no })),
    });
    setEditId(id);
    setPanelMode('edit');
    setExpandedSection('basic');
  };

  const closePanel = () => { setPanelMode('closed'); setEditId(null); };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('문제 제목을 입력해주세요.', 'err'); return; }
    if (!form.description.trim()) { showToast('문제 내용을 입력해주세요.', 'err'); return; }

    setSaving(true);
    const validTc = form.test_cases.filter((tc) => tc.expected_output.trim());
    const body = {
      title: form.title,
      difficulty: form.difficulty,
      description: form.description,
      input_format: form.input_format,
      output_format: form.output_format,
      constraint_text: form.constraint_text,
      starter_code: form.starter_code,
      time_limit_ms: 3000,
      memory_limit_mb: 256,
      is_published: form.is_published,
      test_cases: validTc,
      hints: form.hints.filter((h) => h.hint_text.trim()),
    };

    const url = panelMode === 'edit' && editId ? `/api/admin/problems/${editId}` : '/api/admin/problems';
    const method = panelMode === 'edit' ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { showToast(json.error?.message ?? '저장 중 오류가 발생했습니다.', 'err'); return; }
    showToast(panelMode === 'edit' ? '문제가 수정되었습니다.' : '문제가 등록되었습니다.', 'ok');
    closePanel();
    fetchProblems();
  };

  const handleDelete = async (problem: ProblemRow) => {
    const res = await fetch(`/api/admin/problems/${problem.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (!res.ok) { showToast('삭제 중 오류가 발생했습니다.', 'err'); return; }
    showToast('문제가 삭제되었습니다.', 'ok');
    fetchProblems();
  };

  const togglePublish = async (problem: ProblemRow) => {
    await fetch(`/api/admin/problems/${problem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !problem.is_published }),
    });
    fetchProblems();
  };

  const updateTc = (i: number, field: keyof TestCaseForm, value: unknown) => {
    setForm((f) => {
      const tcs = [...f.test_cases];
      tcs[i] = { ...tcs[i], [field]: value };
      return { ...f, test_cases: tcs };
    });
  };

  const addTc = () => setForm((f) => ({
    ...f,
    test_cases: [...f.test_cases, { input: '', expected_output: '', is_sample: false, is_hidden: false, order_no: f.test_cases.length + 1 }],
  }));

  const removeTc = (i: number) => setForm((f) => ({
    ...f,
    test_cases: f.test_cases.filter((_, idx) => idx !== i).map((tc, idx) => ({ ...tc, order_no: idx + 1 })),
  }));

  const addHint = () => setForm((f) => ({
    ...f,
    hints: [...f.hints, { hint_text: '', trigger_pattern: '', order_no: f.hints.length + 1 }],
  }));

  const removeHint = (i: number) => setForm((f) => ({
    ...f,
    hints: f.hints.filter((_, idx) => idx !== i).map((h, idx) => ({ ...h, order_no: idx + 1 })),
  }));

  return (
    <div className="h-full flex flex-col">
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-white"
          style={{ backgroundColor: toast.type === 'ok' ? '#16A34A' : '#DC2626', boxShadow: '0 4px 16px rgba(22,24,29,0.16)', fontSize: '14px', fontWeight: 600 }}
        >
          {toast.type === 'ok' ? <Check size={16} /> : <X size={16} />}
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>문제 관리</h1>
          <p style={{ fontSize: '14px', color: '#5A6270', marginTop: 2 }}>문제를 등록하고 관리하세요.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 rounded-xl text-white transition-colors"
          style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
        >
          <Plus size={16} />
          문제 등록
        </button>
      </div>

      <div className="flex gap-5 flex-1 overflow-hidden min-h-0">
        <div
          className="flex flex-col bg-white rounded-2xl overflow-hidden"
          style={{
            flex: panelMode !== 'closed' ? '0 0 auto' : '1',
            width: panelMode !== 'closed' ? '460px' : undefined,
            border: '1px solid #E5E8EC',
          }}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: '#5A6270', fontSize: '14px' }}>불러오는 중...</div>
          ) : problems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>등록된 문제가 없습니다</p>
              <p style={{ fontSize: '13px', color: '#5A6270' }}>문제 등록 버튼을 눌러 첫 번째 문제를 추가하세요.</p>
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}>
                    {['번호', '제목', '난이도', '공개', '관리'].map((h) => (
                      <th key={h} className="text-left px-4 py-3" style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F0F1F3' }} className="hover:bg-[#F6F7F9] transition-colors">
                      <td className="px-4 py-3" style={{ fontSize: '13px', color: '#5A6270', width: 60 }}>{p.problem_no}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(p.id)} className="text-left" style={{ fontSize: '14px', fontWeight: 500, color: '#16181D' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#1B64DA')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#16181D')}
                        >
                          {p.title}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_STYLE[p.difficulty].bg, color: DIFF_STYLE[p.difficulty].color }}>
                          {DIFF_LABEL[p.difficulty]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => togglePublish(p)} title={p.is_published ? '비공개로 전환' : '공개로 전환'} className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[#F0F1F3]">
                          {p.is_published ? <Eye size={15} style={{ color: '#1B64DA' }} /> : <EyeOff size={15} style={{ color: '#BCC0C7' }} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p.id)} className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[#EAF1FD]" title="수정">
                            <Pencil size={14} style={{ color: '#1B64DA' }} />
                          </button>
                          <button onClick={() => setDeleteTarget(p)} className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[#FEE2E2]" title="삭제">
                            <Trash2 size={14} style={{ color: '#DC2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {panelMode !== 'closed' && (
          <div className="bg-white rounded-2xl flex flex-col flex-1 overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #E5E8EC' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D' }}>
                {panelMode === 'create' ? '문제 등록' : '문제 수정'}
              </h2>
              <button onClick={closePanel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] transition-colors">
                <X size={16} style={{ color: '#5A6270' }} />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <Section
                label="기본 정보"
                expanded={expandedSection === 'basic'}
                onToggle={() => setExpandedSection(expandedSection === 'basic' ? 'starter' : 'basic')}
              >
                <div className="flex flex-col gap-4">
                  <FormField label="문제 제목" required>
                    <input
                      className="w-full px-3 rounded-lg focus:outline-none"
                      style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
                      placeholder="예) 두 수의 합, 피보나치 수열"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </FormField>

                  <FormField label="난이도" required>
                      <select
                        className="w-full px-3 rounded-lg focus:outline-none"
                        style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
                        value={form.difficulty}
                        onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as ProblemDifficulty }))}
                      >
                        <option value="easy">쉬움</option>
                        <option value="medium">보통</option>
                        <option value="hard">어려움</option>
                      </select>
                    </FormField>

                  <FormField label="문제 내용" required>
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                      style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.7 }}
                      rows={5}
                      placeholder="학생에게 보여줄 문제 설명을 입력하세요.&#10;예) 두 정수 A와 B가 주어졌을 때, A+B를 출력하는 프로그램을 작성하시오."
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </FormField>

                  <FormField
                    label="입력 설명"
                    tooltip={'학생의 코드가 어떤 형태로 입력을 받아야 하는지 설명하세요.\n예) 첫째 줄에 정수 A와 B가 공백으로 구분되어 주어진다. (1 ≤ A, B ≤ 10)'}
                  >
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                      style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }}
                      rows={2}
                      placeholder="예) 첫째 줄에 정수 A와 B가 공백으로 구분되어 주어진다."
                      value={form.input_format}
                      onChange={(e) => setForm((f) => ({ ...f, input_format: e.target.value }))}
                    />
                  </FormField>

                  <FormField
                    label="출력 설명"
                    tooltip={'학생의 코드가 어떤 값을 출력해야 하는지 설명하세요.\n예) A+B를 출력한다.'}
                  >
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                      style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }}
                      rows={2}
                      placeholder="예) A+B를 출력한다."
                      value={form.output_format}
                      onChange={(e) => setForm((f) => ({ ...f, output_format: e.target.value }))}
                    />
                  </FormField>

                  <FormField
                    label="조건 및 제약 (선택)"
                    tooltip={'풀이에서 주의해야 할 범위나 규칙을 입력하세요.\n예) • 1 ≤ A, B ≤ 1,000\n• A와 B는 항상 양의 정수이다.'}
                  >
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                      style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }}
                      rows={3}
                      placeholder="예) • 1 ≤ A, B ≤ 1,000&#10;• 입력은 항상 양의 정수이다."
                      value={form.constraint_text}
                      onChange={(e) => setForm((f) => ({ ...f, constraint_text: e.target.value }))}
                    />
                  </FormField>

                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      checked={form.is_published}
                      onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span style={{ fontSize: '14px', color: '#16181D' }}>즉시 공개</span>
                    <span style={{ fontSize: '12px', color: '#5A6270' }}>(체크하면 학생 화면에 바로 표시됩니다)</span>
                  </label>
                </div>
              </Section>

              <Section
                label="초기 코드 (에디터 기본값)"
                expanded={expandedSection === 'starter'}
                onToggle={() => setExpandedSection(expandedSection === 'starter' ? 'basic' : 'starter')}
                tooltip={'학생이 문제 풀이 화면에 들어왔을 때 에디터에 미리 입력되어 있는 코드입니다.\n코드 구조나 함수 시그니처를 미리 제공하면 학생이 방향을 잡는 데 도움이 됩니다.'}
              >
                <div>
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid #2D2D2D' }}
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2"
                      style={{ backgroundColor: '#2D2D2D' }}
                    >
                      <span style={{ fontSize: '12px', color: '#8C8C8C', fontFamily: 'monospace' }}>Python 3</span>
                      {form.starter_code && (
                        <button
                          onClick={() => setForm((f) => ({ ...f, starter_code: '' }))}
                          className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors hover:bg-[#3D3D3D]"
                          style={{ fontSize: '11px', color: '#8C8C8C' }}
                        >
                          <X size={10} /> 초기화
                        </button>
                      )}
                    </div>
                    <MonacoEditor
                      height={220}
                      language="python"
                      theme="paircode-dark"
                      beforeMount={registerPaircodeTheme}
                      value={form.starter_code}
                      onChange={(v) => setForm((f) => ({ ...f, starter_code: v ?? '' }))}
                      options={{
                        fontSize: 13,
                        fontFamily: "'Fira Code', Consolas, monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        padding: { top: 10, bottom: 10 },
                        automaticLayout: true,
                        tabSize: 4,
                        wordWrap: 'off',
                      }}
                    />
                  </div>
                  <p className="mt-2" style={{ fontSize: '12px', color: '#5A6270' }}>
                    비워두면 학생 에디터가 빈 상태로 시작합니다.
                  </p>
                </div>
              </Section>

              <Section
                label={`채점 케이스 (${form.test_cases.length}개)`}                expanded={expandedSection === 'testcases'}
                onToggle={() => setExpandedSection(expandedSection === 'testcases' ? 'starter' : 'testcases')}
                tooltip={'모든 케이스를 통과해야 정답으로 처리됩니다.\n\n• 예제 공개: 학생 화면에 보이는 케이스\n• 숨김 채점용: 학생에게 보이지 않지만 채점에 포함\n\n입력이 없는 문제(Hello World 등)는\n입력값을 비워두면 됩니다.\n\n하나라도 실패하면 오답 처리됩니다.'}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#EAF1FD', border: '1px solid #C7D9F7' }}>
                    <span style={{ fontSize: '12px', color: '#1450B5', lineHeight: 1.6 }}>
                      <strong>모든 케이스를 통과해야 정답</strong>으로 처리됩니다. 하나라도 실패하면 오답입니다.<br />
                      입력이 없는 문제(예: &quot;Hello, World!&quot; 출력)는 <strong>입력값을 비워두면</strong> 됩니다.
                    </span>
                  </div>
                  {form.test_cases.map((tc, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>케이스 {i + 1}</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={tc.is_sample} onChange={(e) => updateTc(i, 'is_sample', e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
                            <span style={{ fontSize: '12px', color: '#5A6270' }}>학생에게 예제 공개</span>
                            <Tooltip text={'체크하면 학생 화면에 예제로 표시됩니다.\n학생이 문제를 이해하는 데 도움이 되는 케이스에 체크하세요.'} />
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={tc.is_hidden} onChange={(e) => updateTc(i, 'is_hidden', e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
                            <span style={{ fontSize: '12px', color: '#5A6270' }}>숨김 채점용</span>
                            <Tooltip direction="left" text={'체크하면 학생에게 보이지 않고\n정답 채점에만 사용됩니다.\n더 어려운 케이스를 숨겨서 정확한 채점에 사용하세요.'} />
                          </label>
                          {form.test_cases.length > 1 && (
                            <button onClick={() => removeTc(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#FEE2E2] transition-colors">
                              <X size={12} style={{ color: '#DC2626' }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>입력값</div>
                          <textarea
                            className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none"
                            style={{ border: '1px solid #2D2D2D', fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#1E1E1E', color: '#D4D4D4' }}
                            rows={3}
                            placeholder={"입력값 (없으면 비워두세요)"}
                            value={tc.input}
                            onChange={(e) => updateTc(i, 'input', e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>정답 출력</div>
                          <textarea
                            className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none"
                            style={{ border: '1px solid #2D2D2D', fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#1E1E1E', color: '#D4D4D4' }}
                            rows={3}
                            placeholder="코드가 출력해야 할 정답"
                            value={tc.expected_output}
                            onChange={(e) => updateTc(i, 'expected_output', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addTc}
                    className="flex items-center gap-2 px-3 rounded-lg transition-colors"
                    style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: '#5A6270', width: '100%', justifyContent: 'center' }}
                  >
                    <Plus size={14} /> 케이스 추가
                  </button>
                </div>
              </Section>

              <Section
                label={`힌트 (${form.hints.length}개)`}
                expanded={expandedSection === 'hints'}
                onToggle={() => setExpandedSection(expandedSection === 'hints' ? 'starter' : 'hints')}
                tooltip="학생이 막혔을 때 AI가 보여줄 힌트입니다. 정답 코드는 포함하지 마세요."
              >
                <div className="flex flex-col gap-3">
                  {form.hints.map((h, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>힌트 {i + 1}</span>
                        <button onClick={() => removeHint(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#FEE2E2] transition-colors">
                          <X size={12} style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                      <FormField label="힌트 내용">
                        <textarea
                          className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none"
                          style={{ border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D', lineHeight: 1.6 }}
                          rows={3}
                          placeholder="예) 배열을 한 번 순회하면서 이미 본 숫자를 기억해두는 방법을 생각해보세요."
                          value={h.hint_text}
                          onChange={(e) => {
                            const hints = [...form.hints];
                            hints[i] = { ...hints[i], hint_text: e.target.value };
                            setForm((f) => ({ ...f, hints }));
                          }}
                        />
                      </FormField>
                      <div className="mt-3">
                        <FormField
                          label="표시 조건 키워드 (선택)"
                          tooltip={'학생 코드에 이 단어가 없을 때 힌트를 보여줍니다.\n예) dictionary → 딕셔너리를 쓰지 않은 학생에게 이 힌트를 표시'}
                        >
                          <input
                            className="w-full px-3 rounded-lg focus:outline-none"
                            style={{ height: 36, border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D' }}
                            placeholder="예) dictionary, for loop (비워두면 항상 표시)"
                            value={h.trigger_pattern}
                            onChange={(e) => {
                              const hints = [...form.hints];
                              hints[i] = { ...hints[i], trigger_pattern: e.target.value };
                              setForm((f) => ({ ...f, hints }));
                            }}
                          />
                        </FormField>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addHint}
                    className="flex items-center gap-2 px-3 rounded-lg transition-colors"
                    style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: '#5A6270', width: '100%', justifyContent: 'center' }}
                  >
                    <Plus size={14} /> 힌트 추가
                  </button>
                </div>
              </Section>
            </div>

            <div className="flex items-center gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid #E5E8EC' }}>
              <button onClick={closePanel} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl text-white transition-colors disabled:opacity-60"
                style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
              >
                {saving ? '저장 중...' : panelMode === 'edit' ? '수정 완료' : '등록'}
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          title={deleteTarget.title}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function Section({
  label, expanded, onToggle, tooltip, children,
}: {
  label: string; expanded: boolean; onToggle: () => void; tooltip?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid #E5E8EC' }}>
      <button onClick={onToggle} className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-[#F6F7F9] transition-colors">
        <span className="flex items-center gap-2" style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
          {label}
          {tooltip && <Tooltip text={tooltip} />}
        </span>
        {expanded ? <ChevronUp size={16} style={{ color: '#5A6270' }} /> : <ChevronDown size={16} style={{ color: '#5A6270' }} />}
      </button>
      {expanded && <div className="px-5 pb-5 pt-2">{children}</div>}
    </div>
  );
}

function FormField({ label, required, tooltip, children }: { label: string; required?: boolean; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>
        {label}
        {required && <span style={{ color: '#DC2626' }}>*</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children}
    </div>
  );
}