'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, ChevronRight, X, Check, HelpCircle, FolderPlus, ArrowUp, ArrowDown, Layers, Sparkles } from 'lucide-react';
import type { DbProblem, DbTestCase, DbProblemHint, ProblemDifficulty } from '@/lib/types/db';
import { registerPaircodeTheme } from '@/lib/monaco/theme';

const RichEditor = dynamic(() => import('@/components/editor/RichEditor').then(m => ({ default: m.RichEditor })), {
  ssr: false,
  loading: () => <div className="rounded-xl animate-pulse" style={{ height: 200, backgroundColor: '#F3F4F6', border: '1px solid #E5E8EC' }} />,
});

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ height: 200, backgroundColor: '#1E1E1E', borderRadius: 8 }}>
      <span style={{ fontSize: '12px', color: '#5A6270' }}>에디터 로딩 중...</span>
    </div>
  ),
});

type ProblemRow = Pick<DbProblem, 'id' | 'problem_no' | 'category_id' | 'order_no' | 'title' | 'difficulty' | 'is_published' | 'use_ai_feedback' | 'created_at'>;

type CategoryRow = {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  is_published: boolean;
  problem_count: number;
};

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
  category_id: string;
  title: string;
  difficulty: ProblemDifficulty;
  description: string;
  input_format: string;
  output_format: string;
  constraint_text: string;
  starter_code: string;
  is_published: boolean;
  use_ai_feedback: boolean;
  test_cases: TestCaseForm[];
  hints: HintForm[];
};

const EMPTY_FORM: ProblemForm = {
  category_id: '',
  title: '',
  difficulty: 'easy',
  description: '',
  input_format: '',
  output_format: '',
  constraint_text: '',
  starter_code: '',
  is_published: false,
  use_ai_feedback: false,
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

function CategoryModal({
  initial, onSave, onClose, saving,
}: {
  initial: { title: string; description: string; is_published: boolean } | null;
  onSave: (data: { title: string; description: string; is_published: boolean }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D', marginBottom: 4 }}>
          {initial ? '카테고리 수정' : '새 카테고리'}
        </h3>
        <p style={{ fontSize: '13px', color: '#8A8F98', marginBottom: 18 }}>
          예) 파이썬 기초, 자료구조, 알고리즘 입문
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>카테고리 이름 <span style={{ color: '#DC2626' }}>*</span></label>
            <input
              autoFocus
              className="w-full px-3 rounded-lg focus:outline-none"
              style={{ height: 42, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              placeholder="예) 파이썬 기초"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>설명 (선택)</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
              style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }}
              rows={2}
              placeholder="이 카테고리에 대한 간단한 설명"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="w-4 h-4 accent-primary" />
            <span style={{ fontSize: '14px', color: '#16181D' }}>학생에게 공개</span>
            <span style={{ fontSize: '12px', color: '#8A8F98' }}>(끄면 하위 문제도 함께 숨겨집니다)</span>
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
          <button
            onClick={() => onSave({ title, description, is_published: isPublished })}
            disabled={saving || !title.trim()}
            className="flex-1 rounded-xl text-white transition-colors disabled:opacity-50"
            style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
          >
            {saving ? '저장 중...' : initial ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminProblemsPage() {
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [panelMode, setPanelMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProblemRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'err' } | null>(null);
  const [expandedSection, setExpandedSection] = useState<'basic' | 'starter' | 'testcases' | 'hints'>('basic');
  const [catModal, setCatModal] = useState<{ mode: 'create' | 'edit'; id?: string; title: string; description: string; is_published: boolean } | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [deleteCatTarget, setDeleteCatTarget] = useState<CategoryRow | null>(null);

  const showToast = (message: string, type: 'ok' | 'err') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      fetch('/api/admin/problems'),
      fetch('/api/admin/categories'),
    ]);
    const pJson = await pRes.json();
    const cJson = await cRes.json();
    setProblems(pJson.problems ?? []);
    setCategories(cJson.categories ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = (categoryId?: string) => {
    setForm({ ...EMPTY_FORM, category_id: categoryId ?? categories[0]?.id ?? '' });
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
      category_id: problem.category_id ?? '',
      title: problem.title,
      difficulty: problem.difficulty,
      description: problem.description,
      input_format: problem.input_format ?? '',
      output_format: problem.output_format ?? '',
      constraint_text: problem.constraint_text ?? '',
      starter_code: problem.starter_code ?? '',
      is_published: problem.is_published,
      use_ai_feedback: problem.use_ai_feedback,
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
    if (!form.category_id) { showToast('카테고리를 선택해주세요.', 'err'); return; }
    if (!form.title.trim()) { showToast('문제 제목을 입력해주세요.', 'err'); return; }
    if (!form.description.trim()) { showToast('문제 내용을 입력해주세요.', 'err'); return; }

    setSaving(true);
    const validTc = form.test_cases.filter((tc) => tc.expected_output.trim());
    if (validTc.length === 0) { setSaving(false); showToast('정답을 1개 이상 입력해주세요.', 'err'); return; }
    const body = {
      category_id: form.category_id,
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
      use_ai_feedback: form.use_ai_feedback,
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
    fetchAll();
  };

  const handleDelete = async (problem: ProblemRow) => {
    const res = await fetch(`/api/admin/problems/${problem.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (!res.ok) { showToast('삭제 중 오류가 발생했습니다.', 'err'); return; }
    showToast('문제가 삭제되었습니다.', 'ok');
    fetchAll();
  };

  const togglePublish = async (problem: ProblemRow) => {
    await fetch(`/api/admin/problems/${problem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !problem.is_published }),
    });
    fetchAll();
  };

  const saveCategory = async (data: { title: string; description: string; is_published: boolean }) => {
    if (!catModal) return;
    setCatSaving(true);
    const url = catModal.mode === 'edit' ? `/api/admin/categories/${catModal.id}` : '/api/admin/categories';
    const method = catModal.mode === 'edit' ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setCatSaving(false);
    if (!res.ok) { showToast('카테고리 저장 중 오류가 발생했습니다.', 'err'); return; }
    showToast(catModal.mode === 'edit' ? '카테고리가 수정되었습니다.' : '카테고리가 추가되었습니다.', 'ok');
    setCatModal(null);
    fetchAll();
  };

  const toggleCategoryPublish = async (cat: CategoryRow) => {
    await fetch(`/api/admin/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !cat.is_published }),
    });
    fetchAll();
  };

  const handleDeleteCategory = async (cat: CategoryRow) => {
    const res = await fetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
    const json = await res.json();
    setDeleteCatTarget(null);
    if (!res.ok) { showToast(json.error?.message ?? '삭제 중 오류가 발생했습니다.', 'err'); return; }
    showToast('카테고리가 삭제되었습니다.', 'ok');
    fetchAll();
  };

  const moveCategory = async (cat: CategoryRow, dir: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.order_no - b.order_no);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      fetch(`/api/admin/categories/${cat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: other.order_no }) }),
      fetch(`/api/admin/categories/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: cat.order_no }) }),
    ]);
    fetchAll();
  };

  const moveProblem = async (p: ProblemRow, siblings: ProblemRow[], dir: -1 | 1) => {
    const idx = siblings.findIndex((x) => x.id === p.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    await Promise.all([
      fetch(`/api/admin/problems/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: other.order_no }) }),
      fetch(`/api/admin/problems/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: p.order_no }) }),
    ]);
    fetchAll();
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
    <div>
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-white"
          style={{ backgroundColor: toast.type === 'ok' ? '#16A34A' : '#DC2626', boxShadow: '0 4px 16px rgba(22,24,29,0.16)', fontSize: '14px', fontWeight: 600 }}
        >
          {toast.type === 'ok' ? <Check size={16} /> : <X size={16} />}
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>문제 관리</h1>
          <p style={{ fontSize: '14px', color: '#5A6270', marginTop: 2 }}>카테고리(주제) 아래에 문제를 등록하고 관리하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCatModal({ mode: 'create', title: '', description: '', is_published: true })}
            className="flex items-center gap-2 px-4 rounded-xl transition-colors"
            style={{ height: 40, border: '1px solid #E5E8EC', backgroundColor: '#FFFFFF', fontSize: '14px', fontWeight: 600, color: '#16181D' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F6F7F9')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
          >
            <FolderPlus size={16} style={{ color: '#5A6270' }} />
            카테고리 추가
          </button>
          <button
            onClick={() => openCreate()}
            disabled={categories.length === 0}
            className="flex items-center gap-2 px-4 rounded-xl text-white transition-colors disabled:opacity-50"
            style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
          >
            <Plus size={16} />
            문제 등록
          </button>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        <div
          className="flex flex-col bg-white rounded-2xl overflow-hidden"
          style={{
            flex: '0 0 auto',
            width: panelMode !== 'closed' ? '460px' : '100%',
            maxWidth: panelMode !== 'closed' ? '460px' : '860px',
            border: '1px solid #E5E8EC',
          }}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: '#5A6270', fontSize: '14px' }}>불러오는 중...</div>
          ) : categories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Layers size={36} style={{ color: '#D1D5DB' }} />
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>아직 카테고리가 없습니다</p>
              <p style={{ fontSize: '13px', color: '#8A8F98' }}>먼저 카테고리(주제)를 만든 뒤 문제를 등록하세요.</p>
              <button
                onClick={() => setCatModal({ mode: 'create', title: '', description: '', is_published: true })}
                className="flex items-center gap-2 px-4 mt-2 rounded-xl text-white"
                style={{ height: 38, backgroundColor: '#1B64DA', fontSize: '13px', fontWeight: 600 }}
              >
                <FolderPlus size={15} /> 카테고리 추가
              </button>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-2.5">
              {[...categories].sort((a, b) => a.order_no - b.order_no).map((cat, catIdx, catArr) => {
                const catProblems = problems
                  .filter((p) => p.category_id === cat.id)
                  .sort((a, b) => a.order_no - b.order_no);
                const isCollapsed = collapsed[cat.id];
                return (
                  <div key={cat.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5"
                      style={{ backgroundColor: cat.is_published ? '#F0F7FF' : '#F6F7F9', borderBottom: isCollapsed ? 'none' : '1px solid #E5E8EC' }}
                    >
                      <button
                        onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
                        className="flex items-center justify-center w-6 h-6 rounded-md transition-colors hover:bg-white/60 shrink-0"
                      >
                        {isCollapsed ? <ChevronRight size={15} style={{ color: '#5A6270' }} /> : <ChevronDown size={15} style={{ color: '#5A6270' }} />}
                      </button>
                      <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 22, height: 22, backgroundColor: cat.is_published ? '#1B64DA' : '#BCC0C7', color: '#fff', fontSize: '12px', fontWeight: 700 }}>
                        {catIdx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate" style={{ fontSize: '14px', fontWeight: 700, color: cat.is_published ? '#16181D' : '#8A8F98' }}>{cat.title}</span>
                          <span style={{ fontSize: '12px', color: '#8A8F98' }}>· {catProblems.length}문제</span>
                          {!cat.is_published && <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: '#E5E8EC', color: '#8A8F98' }}>숨김</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveCategory(cat, -1)} disabled={catIdx === 0} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-white/70 disabled:opacity-30" title="위로">
                          <ArrowUp size={13} style={{ color: '#5A6270' }} />
                        </button>
                        <button onClick={() => moveCategory(cat, 1)} disabled={catIdx === catArr.length - 1} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-white/70 disabled:opacity-30" title="아래로">
                          <ArrowDown size={13} style={{ color: '#5A6270' }} />
                        </button>
                        <button onClick={() => toggleCategoryPublish(cat)} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-white/70" title={cat.is_published ? '숨기기' : '공개'}>
                          {cat.is_published ? <Eye size={14} style={{ color: '#1B64DA' }} /> : <EyeOff size={14} style={{ color: '#BCC0C7' }} />}
                        </button>
                        <button onClick={() => setCatModal({ mode: 'edit', id: cat.id, title: cat.title, description: cat.description ?? '', is_published: cat.is_published })} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-white/70" title="카테고리 수정">
                          <Pencil size={13} style={{ color: '#5A6270' }} />
                        </button>
                        <button onClick={() => setDeleteCatTarget(cat)} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-white/70" title="카테고리 삭제">
                          <Trash2 size={13} style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="flex flex-col">
                        {catProblems.length === 0 ? (
                          <div className="px-4 py-3" style={{ fontSize: '12px', color: '#BCC0C7' }}>아직 문제가 없습니다.</div>
                        ) : (
                          catProblems.map((p, pIdx) => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: pIdx < catProblems.length - 1 ? '1px solid #F0F1F3' : 'none', backgroundColor: pIdx % 2 === 0 ? '#FFFFFF' : '#FAFBFC' }}>
                              <span className="shrink-0 text-center" style={{ width: 34, fontSize: '12px', fontWeight: 700, color: '#8A8F98', fontFamily: 'monospace' }}>
                                {catIdx + 1}-{pIdx + 1}
                              </span>
                              <button onClick={() => openEdit(p.id)} className="flex-1 min-w-0 text-left truncate" style={{ fontSize: '14px', fontWeight: 500, color: p.is_published ? '#16181D' : '#8A8F98' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#1B64DA')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = p.is_published ? '#16181D' : '#8A8F98')}
                              >
                                {p.title}
                              </button>
                              {p.use_ai_feedback && (
                                <span className="px-2 py-0.5 rounded shrink-0 flex items-center gap-1" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#EEF2FF', color: '#4F46E5' }}>
                                  <Sparkles size={11} /> AI
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded shrink-0" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_STYLE[p.difficulty].bg, color: DIFF_STYLE[p.difficulty].color }}>
                                {DIFF_LABEL[p.difficulty]}
                              </span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button onClick={() => moveProblem(p, catProblems, -1)} disabled={pIdx === 0} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[#F0F1F3] disabled:opacity-30" title="위로">
                                  <ArrowUp size={13} style={{ color: '#5A6270' }} />
                                </button>
                                <button onClick={() => moveProblem(p, catProblems, 1)} disabled={pIdx === catProblems.length - 1} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[#F0F1F3] disabled:opacity-30" title="아래로">
                                  <ArrowDown size={13} style={{ color: '#5A6270' }} />
                                </button>
                                <button onClick={() => togglePublish(p)} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[#F0F1F3]" title={p.is_published ? '비공개로 전환' : '공개로 전환'}>
                                  {p.is_published ? <Eye size={14} style={{ color: '#1B64DA' }} /> : <EyeOff size={14} style={{ color: '#BCC0C7' }} />}
                                </button>
                                <button onClick={() => openEdit(p.id)} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[#EAF1FD]" title="수정">
                                  <Pencil size={13} style={{ color: '#1B64DA' }} />
                                </button>
                                <button onClick={() => setDeleteTarget(p)} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[#FEE2E2]" title="삭제">
                                  <Trash2 size={13} style={{ color: '#DC2626' }} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                        <button
                          onClick={() => openCreate(cat.id)}
                          className="flex items-center gap-1.5 px-3 py-2 transition-colors hover:bg-[#F6F7F9]"
                          style={{ fontSize: '12px', color: '#1B64DA', fontWeight: 600, borderTop: '1px solid #F0F1F3' }}
                        >
                          <Plus size={13} /> 이 카테고리에 문제 추가
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {panelMode !== 'closed' && (
          <div className="bg-white rounded-2xl flex flex-col min-w-0 overflow-hidden" style={{ flex: '1', border: '1px solid #E5E8EC', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 80px)' }}>
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #E5E8EC' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D' }}>
                {panelMode === 'create' ? '문제 등록' : '문제 수정'}
              </h2>
              <button onClick={closePanel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] transition-colors">
                <X size={16} style={{ color: '#5A6270' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <Section
                label="기본 정보"
                expanded={expandedSection === 'basic'}
                onToggle={() => setExpandedSection(expandedSection === 'basic' ? 'starter' : 'basic')}
              >
                <div className="flex flex-col gap-4">
                  <FormField label="카테고리" required tooltip={'이 문제가 속할 1레벨 주제입니다.\n예) 파이썬 기초 → print문, if문'}>
                    <select
                      className="w-full px-3 rounded-lg focus:outline-none"
                      style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
                      value={form.category_id}
                      onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                    >
                      <option value="" disabled>카테고리를 선택하세요</option>
                      {[...categories].sort((a, b) => a.order_no - b.order_no).map((c, i) => (
                        <option key={c.id} value={c.id}>{i + 1}. {c.title}</option>
                      ))}
                    </select>
                  </FormField>

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
                    <RichEditor
                      value={form.description}
                      onChange={(html) => setForm((f) => ({ ...f, description: html }))}
                      placeholder="학생에게 보여줄 문제 내용을 입력하세요. 이미지, 표, 색상 등을 활용해 알기 쉽게 작성하세요."
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

                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      checked={form.use_ai_feedback}
                      onChange={(e) => setForm((f) => ({ ...f, use_ai_feedback: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span style={{ fontSize: '14px', color: '#16181D' }}>AI 피드백 사용</span>
                    <span style={{ fontSize: '12px', color: '#5A6270' }}>(체크하면 오답 시 AI가 코드를 분석해 피드백을 제공합니다)</span>
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
                label={`정답 (${form.test_cases.length}개)`}
                expanded={expandedSection === 'testcases'}
                onToggle={() => setExpandedSection(expandedSection === 'testcases' ? 'starter' : 'testcases')}
                tooltip={'학생 코드가 출력해야 할 정답을 입력합니다.\ninput()을 쓰는 문제는 입력값도 함께 채워주세요.\n정답을 여러 개 등록할 수 있고, 모든 정답을 맞춰야 통과입니다.\n최소 1개 이상 등록해야 저장됩니다.'}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#EAF1FD', border: '1px solid #C7D9F7' }}>
                    <span style={{ fontSize: '12px', color: '#1450B5', lineHeight: 1.6 }}>
                      학생 코드가 출력해야 할 <strong>정답을 1개 이상</strong> 등록하세요. 모든 정답을 통과해야 맞음으로 처리됩니다.
                      <br />
                      <code>input()</code>을 사용하는 문제라면 <strong>입력값</strong>도 함께 채워주세요. (사용하지 않으면 비워두세요)
                    </span>
                  </div>
                  {form.test_cases.map((tc, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>정답 {i + 1}</span>
                        <div className="flex items-center gap-3">
                          {form.test_cases.length > 1 && (
                            <button onClick={() => removeTc(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#FEE2E2] transition-colors">
                              <X size={12} style={{ color: '#DC2626' }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="flex items-center gap-1 mb-1" style={{ fontSize: '11px', fontWeight: 600, color: '#5A6270' }}>
                          입력값 (input)
                          <span style={{ fontWeight: 400, color: '#8A8F98' }}>· input()이 없으면 비워두세요</span>
                        </div>
                        <textarea
                          className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none"
                          style={{ border: '1px solid #E5E8EC', fontFamily: 'monospace', fontSize: '13px', backgroundColor: '#FFFFFF', color: '#16181D' }}
                          rows={2}
                          placeholder={'input()에 넣어줄 값 (여러 줄 가능)\n예) 3 5'}
                          value={tc.input}
                          onChange={(e) => updateTc(i, 'input', e.target.value)}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>정답 출력값</div>
                        <textarea
                          className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none"
                          style={{ border: '1px solid #2D2D2D', fontFamily: 'monospace', fontSize: '13px', backgroundColor: '#1E1E1E', color: '#D4D4D4' }}
                          rows={3}
                          placeholder="코드가 출력해야 할 정답을 입력하세요"
                          value={tc.expected_output}
                          onChange={(e) => updateTc(i, 'expected_output', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addTc}
                    className="flex items-center gap-2 px-3 rounded-lg transition-colors"
                    style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: '#5A6270', width: '100%', justifyContent: 'center' }}
                  >
                    <Plus size={14} /> 정답 추가
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

      {catModal && (
        <CategoryModal
          initial={catModal.mode === 'edit' ? { title: catModal.title, description: catModal.description, is_published: catModal.is_published } : null}
          onSave={saveCategory}
          onClose={() => setCatModal(null)}
          saving={catSaving}
        />
      )}

      {deleteCatTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={() => setDeleteCatTarget(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-xs mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D', marginBottom: 8 }}>카테고리 삭제</h3>
            <p style={{ fontSize: '14px', color: '#5A6270', marginBottom: 20 }}>
              <span style={{ fontWeight: 600, color: '#16181D' }}>{deleteCatTarget.title}</span> 카테고리를 삭제하시겠습니까?<br />
              하위 문제가 있으면 삭제할 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteCatTarget(null)} className="flex-1 rounded-lg transition-colors" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
              <button onClick={() => handleDeleteCategory(deleteCatTarget)} className="flex-1 rounded-lg text-white transition-colors" style={{ height: 40, backgroundColor: '#DC2626', fontSize: '14px', fontWeight: 600 }}>삭제</button>
            </div>
          </div>
        </div>
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