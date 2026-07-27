'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, ChevronRight,
  X, Check, HelpCircle, FolderPlus, ArrowUp, ArrowDown, Layers, Sparkles, FileSpreadsheet,
} from 'lucide-react';
import type { DbProblem, DbTestCase, DbProblemHint, ProblemDifficulty } from '@/lib/types/db';
import { registerCoveTheme } from '@/lib/monaco/theme';
import { CurriculumExcelImportModal } from '@/components/admin/CurriculumExcelImportModal';

const RichEditor = dynamic(() => import('@/components/editor/RichEditor').then(m => ({ default: m.RichEditor })), {
  ssr: false,
  loading: () => <div className="rounded-xl animate-pulse" style={{ height: 200, backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }} />,
});

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ height: 200, backgroundColor: '#1E1E1E', borderRadius: 8 }}>
      <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>에디터 로딩 중...</span>
    </div>
  ),
});

type ProblemRow = Pick<DbProblem, 'id' | 'problem_no' | 'chapter_id' | 'order_no' | 'title' | 'difficulty' | 'is_published' | 'use_ai_feedback' | 'created_at'>;

type HierarchyRow = {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  is_published: boolean;
  child_count?: number;
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
  chapter_id: string;
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

type NavLevel = 'subjects' | 'stages' | 'chapters' | 'problems';
type HierarchyKind = 'subject' | 'stage' | 'chapter';

const EMPTY_FORM: ProblemForm = {
  chapter_id: '',
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
  medium: { bg: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

const KIND_LABEL: Record<HierarchyKind, string> = {
  subject: '과목',
  stage: '단계',
  chapter: '챕터',
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
      <div className="bg-card rounded-xl p-6 w-full max-w-xs mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: 8 }}>문제 삭제</h3>
        <p style={{ fontSize: '14px', color: 'var(--color-sub)', marginBottom: 20 }}>
          <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{title}</span> 문제를 삭제하시겠습니까?<br />
          테스트케이스와 힌트도 함께 삭제됩니다.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg transition-colors" style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>취소</button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg text-white transition-colors"
            style={{ height: 40, backgroundColor: '#DC2626', fontSize: '14px', fontWeight: 600 }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function HierarchyModal({
  kind, initial, defaultOrderNo, onSave, onClose, saving,
}: {
  kind: HierarchyKind;
  initial: { title: string; description: string; is_published: boolean; order_no: number } | null;
  defaultOrderNo: number;
  onSave: (data: { title: string; description: string; is_published: boolean; order_no: number }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? true);
  const [orderNo, setOrderNo] = useState(String(initial?.order_no ?? defaultOrderNo));
  const label = KIND_LABEL[kind];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-card rounded-2xl p-6 w-full max-w-md mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: 4 }}>
          {initial ? `${label} 수정` : `새 ${label}`}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--color-sub)', marginBottom: 18 }}>
          번호와 이름을 입력하세요.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-sub)' }}>{label} 번호 <span style={{ color: '#DC2626' }}>*</span></label>
            <input
              type="number"
              min={1}
              className="w-full px-3 rounded-lg focus:outline-none"
              style={{ height: 42, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-sub)' }}>{label} 이름 <span style={{ color: '#DC2626' }}>*</span></label>
            <input
              autoFocus
              className="w-full px-3 rounded-lg focus:outline-none"
              style={{ height: 42, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
              placeholder={`예) ${kind === 'subject' ? '파이썬' : kind === 'stage' ? '1단계' : '변수와 입출력'}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-sub)' }}>설명 (선택)</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
              style={{ border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.6 }}
              rows={2}
              placeholder={`이 ${label}에 대한 간단한 설명`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="w-4 h-4 accent-primary" />
            <span style={{ fontSize: '14px', color: 'var(--color-ink)' }}>학생에게 공개</span>
            <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>(끄면 하위도 함께 숨겨집니다)</span>
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid var(--color-border)', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>취소</button>
          <button
            onClick={() => onSave({
              title,
              description,
              is_published: isPublished,
              order_no: Math.max(1, Number(orderNo) || defaultOrderNo),
            })}
            disabled={saving || !title.trim()}
            className="flex-1 rounded-xl text-white transition-colors disabled:opacity-50"
            style={{ height: 44, backgroundColor: 'var(--color-primary)', fontSize: '14px', fontWeight: 600 }}
          >
            {saving ? '저장 중...' : initial ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminProblemsPage() {
  const [level, setLevel] = useState<NavLevel>('subjects');
  const [subjects, setSubjects] = useState<HierarchyRow[]>([]);
  const [stages, setStages] = useState<HierarchyRow[]>([]);
  const [chapters, setChapters] = useState<HierarchyRow[]>([]);
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<HierarchyRow | null>(null);
  const [selectedStage, setSelectedStage] = useState<HierarchyRow | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<HierarchyRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [panelMode, setPanelMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProblemRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'err' } | null>(null);
  const [expandedSection, setExpandedSection] = useState<'basic' | 'starter' | 'testcases' | 'hints'>('basic');

  const [hierModal, setHierModal] = useState<{
    kind: HierarchyKind;
    mode: 'create' | 'edit';
    id?: string;
    title: string;
    description: string;
    is_published: boolean;
    order_no: number;
  } | null>(null);
  const [hierSaving, setHierSaving] = useState(false);
  const [deleteHierTarget, setDeleteHierTarget] = useState<{ kind: HierarchyKind; row: HierarchyRow } | null>(null);
  const [excelImportOpen, setExcelImportOpen] = useState(false);

  const showToast = (message: string, type: 'ok' | 'err') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadSubjects = useCallback(async () => {
    const res = await fetch('/api/admin/subjects');
    const json = await res.json();
    setSubjects((json.subjects ?? []).map((s: HierarchyRow & { stage_count?: number }) => ({
      ...s,
      child_count: s.stage_count ?? 0,
    })));
  }, []);

  const loadStages = useCallback(async (subjectId: string) => {
    const res = await fetch(`/api/admin/stages?subject_id=${subjectId}`);
    const json = await res.json();
    setStages((json.stages ?? []).map((s: HierarchyRow & { chapter_count?: number }) => ({
      ...s,
      child_count: s.chapter_count ?? 0,
    })));
  }, []);

  const loadChapters = useCallback(async (stageId: string) => {
    const res = await fetch(`/api/admin/chapters?stage_id=${stageId}`);
    const json = await res.json();
    setChapters((json.chapters ?? []).map((c: HierarchyRow & { problem_count?: number }) => ({
      ...c,
      child_count: c.problem_count ?? 0,
    })));
  }, []);

  const loadProblems = useCallback(async (chapterId: string) => {
    const res = await fetch(`/api/admin/problems?chapter_id=${chapterId}`);
    const json = await res.json();
    const chapterProblems: ProblemRow[] = json.problems ?? [];
    setProblems(chapterProblems.sort((a, b) => a.order_no - b.order_no));
  }, []);

  useEffect(() => {
    loadSubjects().finally(() => setLoading(false));
  }, [loadSubjects]);

  const openCreate = () => {
    if (!selectedChapter) { showToast('챕터를 먼저 선택해주세요.', 'err'); return; }
    setForm({ ...EMPTY_FORM, chapter_id: selectedChapter.id });
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
      chapter_id: problem.chapter_id ?? selectedChapter?.id ?? '',
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
    if (!form.chapter_id) { showToast('챕터를 선택해주세요.', 'err'); return; }
    if (!form.title.trim()) { showToast('문제 제목을 입력해주세요.', 'err'); return; }
    if (!form.description.trim()) { showToast('문제 내용을 입력해주세요.', 'err'); return; }

    setSaving(true);
    const validTc = form.test_cases.filter((tc) => tc.expected_output.trim());
    if (validTc.length === 0) { setSaving(false); showToast('정답을 1개 이상 입력해주세요.', 'err'); return; }
    const body = {
      chapter_id: form.chapter_id,
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
    if (selectedChapter) loadProblems(selectedChapter.id);
  };

  const handleDelete = async (problem: ProblemRow) => {
    const res = await fetch(`/api/admin/problems/${problem.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (!res.ok) { showToast('삭제 중 오류가 발생했습니다.', 'err'); return; }
    showToast('문제가 삭제되었습니다.', 'ok');
    if (selectedChapter) loadProblems(selectedChapter.id);
  };

  const togglePublish = async (problem: ProblemRow) => {
    await fetch(`/api/admin/problems/${problem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !problem.is_published }),
    });
    if (selectedChapter) loadProblems(selectedChapter.id);
  };

  const apiBase = (kind: HierarchyKind) =>
    kind === 'subject' ? '/api/admin/subjects' : kind === 'stage' ? '/api/admin/stages' : '/api/admin/chapters';

  const saveHierarchy = async (data: { title: string; description: string; is_published: boolean; order_no: number }) => {
    if (!hierModal) return;
    setHierSaving(true);
    const url = hierModal.mode === 'edit' ? `${apiBase(hierModal.kind)}/${hierModal.id}` : apiBase(hierModal.kind);
    const method = hierModal.mode === 'edit' ? 'PATCH' : 'POST';
    const body: Record<string, unknown> = { ...data };
    if (hierModal.mode === 'create') {
      if (hierModal.kind === 'stage' && selectedSubject) body.subject_id = selectedSubject.id;
      if (hierModal.kind === 'chapter' && selectedStage) body.stage_id = selectedStage.id;
    }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setHierSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      showToast(json?.error?.message ?? `${KIND_LABEL[hierModal.kind]} 저장 중 오류가 발생했습니다.`, 'err');
      return;
    }
    showToast(hierModal.mode === 'edit' ? `${KIND_LABEL[hierModal.kind]}가 수정되었습니다.` : `${KIND_LABEL[hierModal.kind]}가 추가되었습니다.`, 'ok');
    setHierModal(null);
    if (hierModal.kind === 'subject') loadSubjects();
    else if (hierModal.kind === 'stage' && selectedSubject) loadStages(selectedSubject.id);
    else if (hierModal.kind === 'chapter' && selectedStage) loadChapters(selectedStage.id);
  };

  const toggleHierPublish = async (kind: HierarchyKind, row: HierarchyRow) => {
    await fetch(`${apiBase(kind)}/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !row.is_published }),
    });
    if (kind === 'subject') loadSubjects();
    else if (kind === 'stage' && selectedSubject) loadStages(selectedSubject.id);
    else if (kind === 'chapter' && selectedStage) loadChapters(selectedStage.id);
  };

  const handleDeleteHierarchy = async () => {
    if (!deleteHierTarget) return;
    const { kind, row } = deleteHierTarget;
    const res = await fetch(`${apiBase(kind)}/${row.id}`, { method: 'DELETE' });
    const json = await res.json();
    setDeleteHierTarget(null);
    if (!res.ok) { showToast(json.error?.message ?? '삭제 중 오류가 발생했습니다.', 'err'); return; }
    showToast(`${KIND_LABEL[kind]}가 삭제되었습니다.`, 'ok');
    if (kind === 'subject') loadSubjects();
    else if (kind === 'stage' && selectedSubject) loadStages(selectedSubject.id);
    else if (kind === 'chapter' && selectedStage) loadChapters(selectedStage.id);
  };

  const moveHierarchy = async (kind: HierarchyKind, row: HierarchyRow, siblings: HierarchyRow[], dir: -1 | 1) => {
    const sorted = [...siblings].sort((a, b) => a.order_no - b.order_no);
    const idx = sorted.findIndex((c) => c.id === row.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      fetch(`${apiBase(kind)}/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: other.order_no }) }),
      fetch(`${apiBase(kind)}/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: row.order_no }) }),
    ]);
    if (kind === 'subject') loadSubjects();
    else if (kind === 'stage' && selectedSubject) loadStages(selectedSubject.id);
    else if (kind === 'chapter' && selectedStage) loadChapters(selectedStage.id);
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
    if (selectedChapter) loadProblems(selectedChapter.id);
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

  const enterSubject = (row: HierarchyRow) => {
    setSelectedSubject(row);
    setSelectedStage(null);
    setSelectedChapter(null);
    setLevel('stages');
    closePanel();
    loadStages(row.id);
  };

  const enterStage = (row: HierarchyRow) => {
    setSelectedStage(row);
    setSelectedChapter(null);
    setLevel('chapters');
    closePanel();
    loadChapters(row.id);
  };

  const enterChapter = (row: HierarchyRow) => {
    setSelectedChapter(row);
    setLevel('problems');
    closePanel();
    loadProblems(row.id);
  };

  const goTo = (target: NavLevel) => {
    closePanel();
    if (target === 'subjects') {
      setLevel('subjects');
      setSelectedSubject(null);
      setSelectedStage(null);
      setSelectedChapter(null);
      loadSubjects();
    } else if (target === 'stages' && selectedSubject) {
      setLevel('stages');
      setSelectedStage(null);
      setSelectedChapter(null);
      loadStages(selectedSubject.id);
    } else if (target === 'chapters' && selectedStage) {
      setLevel('chapters');
      setSelectedChapter(null);
      loadChapters(selectedStage.id);
    }
  };

  const currentRows =
    level === 'subjects' ? subjects
      : level === 'stages' ? stages
        : level === 'chapters' ? chapters
          : [];

  const currentKind: HierarchyKind | null =
    level === 'subjects' ? 'subject'
      : level === 'stages' ? 'stage'
        : level === 'chapters' ? 'chapter'
          : null;

  const childLabel =
    level === 'subjects' ? '단계'
      : level === 'stages' ? '챕터'
        : level === 'chapters' ? '문제'
          : '문제';

  const nextOrderNo = (() => {
    if (level === 'problems') return (problems.reduce((m, p) => Math.max(m, p.order_no), 0) || 0) + 1;
    const rows = currentRows;
    return (rows.reduce((m, r) => Math.max(m, r.order_no), 0) || 0) + 1;
  })();

  const openCreateHier = () => {
    if (!currentKind) return;
    setHierModal({
      kind: currentKind,
      mode: 'create',
      title: '',
      description: '',
      is_published: true,
      order_no: nextOrderNo,
    });
  };

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
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)' }}>문제 관리</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-sub)', marginTop: 2 }}>과목 → 단계 → 챕터 → 문제 순으로 관리하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExcelImportOpen(true)}
            className="flex items-center gap-2 px-4 rounded-xl transition-colors"
            style={{ height: 40, border: '1px solid #C7D9F7', backgroundColor: 'var(--tint-soft)', fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)' }}
          >
            <FileSpreadsheet size={16} />
            엑셀 일괄 등록
          </button>
          {currentKind && (
            <button
              onClick={openCreateHier}
              className="flex items-center gap-2 px-4 rounded-xl transition-colors"
              style={{ height: 40, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}
            >
              <FolderPlus size={16} style={{ color: 'var(--color-sub)' }} />
              {KIND_LABEL[currentKind]} 추가
            </button>
          )}
          {level === 'problems' && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 rounded-xl text-white transition-colors"
              style={{ height: 40, backgroundColor: 'var(--color-primary)', fontSize: '14px', fontWeight: 600 }}
            >
              <Plus size={16} />
              문제 등록
            </button>
          )}
        </div>
      </div>

      <nav className="flex items-center gap-1.5 mb-4 flex-wrap" style={{ fontSize: '13px' }}>
        <button onClick={() => goTo('subjects')} style={{ fontWeight: level === 'subjects' ? 700 : 500, color: level === 'subjects' ? 'var(--color-primary)' : 'var(--color-sub)' }}>
          과목
        </button>
        {selectedSubject && (
          <>
            <ChevronRight size={14} style={{ color: '#BCC0C7' }} />
            <button onClick={() => goTo('stages')} style={{ fontWeight: level === 'stages' ? 700 : 500, color: level === 'stages' ? 'var(--color-primary)' : 'var(--color-sub)' }}>
              {selectedSubject.order_no}. {selectedSubject.title}
            </button>
          </>
        )}
        {selectedStage && (
          <>
            <ChevronRight size={14} style={{ color: '#BCC0C7' }} />
            <button onClick={() => goTo('chapters')} style={{ fontWeight: level === 'chapters' ? 700 : 500, color: level === 'chapters' ? 'var(--color-primary)' : 'var(--color-sub)' }}>
              {selectedStage.order_no}. {selectedStage.title}
            </button>
          </>
        )}
        {selectedChapter && (
          <>
            <ChevronRight size={14} style={{ color: '#BCC0C7' }} />
            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
              {selectedChapter.order_no}. {selectedChapter.title}
            </span>
          </>
        )}
      </nav>

      <div className="flex gap-5 items-start">
        <div
          className="flex flex-col bg-card rounded-2xl overflow-hidden"
          style={{
            flex: '0 0 auto',
            width: panelMode !== 'closed' ? '460px' : '100%',
            maxWidth: panelMode !== 'closed' ? '460px' : '860px',
            border: '1px solid var(--color-border)',
            minHeight: 320,
          }}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16" style={{ color: 'var(--color-sub)', fontSize: '14px' }}>불러오는 중...</div>
          ) : level !== 'problems' && currentRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center py-16">
              <Layers size={36} style={{ color: '#D1D5DB' }} />
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>아직 {currentKind ? KIND_LABEL[currentKind] : ''}가 없습니다</p>
              <button
                onClick={openCreateHier}
                className="flex items-center gap-2 px-4 mt-2 rounded-xl text-white"
                style={{ height: 38, backgroundColor: 'var(--color-primary)', fontSize: '13px', fontWeight: 600 }}
              >
                <FolderPlus size={15} /> {currentKind ? KIND_LABEL[currentKind] : ''} 추가
              </button>
            </div>
          ) : level === 'problems' ? (
            <div className="flex flex-col">
              {problems.length === 0 ? (
                <div className="px-4 py-10 text-center" style={{ fontSize: '13px', color: '#BCC0C7' }}>
                  아직 문제가 없습니다.
                  <button onClick={openCreate} className="block mx-auto mt-3 text-primary" style={{ fontSize: '13px', fontWeight: 600 }}>
                    + 문제 추가
                  </button>
                </div>
              ) : (
                problems.map((p, pIdx) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: pIdx < problems.length - 1 ? '1px solid var(--color-muted)' : 'none', backgroundColor: pIdx % 2 === 0 ? 'var(--color-card)' : 'var(--color-muted)' }}>
                    <span className="shrink-0 text-center" style={{ width: 40, fontSize: '12px', fontWeight: 700, color: 'var(--color-sub)', fontFamily: 'monospace' }}>
                      {selectedChapter?.order_no}-{pIdx + 1}
                    </span>
                    <button onClick={() => openEdit(p.id)} className="flex-1 min-w-0 text-left truncate" style={{ fontSize: '14px', fontWeight: 500, color: p.is_published ? 'var(--color-ink)' : 'var(--color-sub)' }}>
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
                      <button onClick={() => moveProblem(p, problems, -1)} disabled={pIdx === 0} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--color-muted)] disabled:opacity-30"><ArrowUp size={13} style={{ color: 'var(--color-sub)' }} /></button>
                      <button onClick={() => moveProblem(p, problems, 1)} disabled={pIdx === problems.length - 1} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--color-muted)] disabled:opacity-30"><ArrowDown size={13} style={{ color: 'var(--color-sub)' }} /></button>
                      <button onClick={() => togglePublish(p)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--color-muted)]">{p.is_published ? <Eye size={14} style={{ color: 'var(--color-primary)' }} /> : <EyeOff size={14} style={{ color: '#BCC0C7' }} />}</button>
                      <button onClick={() => openEdit(p.id)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-primary-light"><Pencil size={13} style={{ color: 'var(--color-primary)' }} /></button>
                      <button onClick={() => setDeleteTarget(p)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--tint-danger)]"><Trash2 size={13} style={{ color: '#DC2626' }} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-2">
              {[...currentRows].sort((a, b) => a.order_no - b.order_no).map((row, idx, arr) => (
                <div key={row.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: row.is_published ? 'var(--tint-soft)' : 'var(--color-surface)' }}>
                    <button
                      onClick={() => {
                        if (level === 'subjects') enterSubject(row);
                        else if (level === 'stages') enterStage(row);
                        else enterChapter(row);
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 28, height: 28, backgroundColor: row.is_published ? 'var(--color-primary)' : '#BCC0C7', color: 'white', fontSize: '12px', fontWeight: 700 }}>
                        {row.order_no}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate" style={{ fontSize: '14px', fontWeight: 700, color: row.is_published ? 'var(--color-ink)' : 'var(--color-sub)' }}>{row.title}</span>
                          <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>· {row.child_count ?? 0}{childLabel}</span>
                          {!row.is_published && <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: 'var(--color-border)', color: 'var(--color-sub)' }}>숨김</span>}
                        </div>
                        {row.description && <p className="truncate mt-0.5" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>{row.description}</p>}
                      </div>
                      <ChevronRight size={16} style={{ color: '#BCC0C7' }} />
                    </button>
                    {currentKind && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveHierarchy(currentKind, row, currentRows, -1)} disabled={idx === 0} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-card/70 disabled:opacity-30"><ArrowUp size={13} style={{ color: 'var(--color-sub)' }} /></button>
                        <button onClick={() => moveHierarchy(currentKind, row, currentRows, 1)} disabled={idx === arr.length - 1} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-card/70 disabled:opacity-30"><ArrowDown size={13} style={{ color: 'var(--color-sub)' }} /></button>
                        <button onClick={() => toggleHierPublish(currentKind, row)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-card/70">{row.is_published ? <Eye size={14} style={{ color: 'var(--color-primary)' }} /> : <EyeOff size={14} style={{ color: '#BCC0C7' }} />}</button>
                        <button
                          onClick={() => setHierModal({
                            kind: currentKind,
                            mode: 'edit',
                            id: row.id,
                            title: row.title,
                            description: row.description ?? '',
                            is_published: row.is_published,
                            order_no: row.order_no,
                          })}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-card/70"
                        >
                          <Pencil size={13} style={{ color: 'var(--color-sub)' }} />
                        </button>
                        <button onClick={() => setDeleteHierTarget({ kind: currentKind, row })} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-card/70"><Trash2 size={13} style={{ color: '#DC2626' }} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {panelMode !== 'closed' && (
          <div className="bg-card rounded-2xl flex flex-col min-w-0 overflow-hidden" style={{ flex: '1', border: '1px solid var(--color-border)', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 80px)' }}>
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)' }}>
                {panelMode === 'create' ? '문제 등록' : '문제 수정'}
              </h2>
              <button onClick={closePanel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface transition-colors">
                <X size={16} style={{ color: 'var(--color-sub)' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <Section label="기본 정보" expanded={expandedSection === 'basic'} onToggle={() => setExpandedSection(expandedSection === 'basic' ? 'starter' : 'basic')}>
                <div className="flex flex-col gap-4">
                  <FormField label="챕터" required tooltip="현재 선택된 챕터에 문제가 등록됩니다.">
                    <div className="px-3 rounded-lg flex items-center" style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)', backgroundColor: 'var(--color-surface)' }}>
                      {selectedSubject?.title} / {selectedStage?.title} / {selectedChapter?.title}
                    </div>
                  </FormField>

                  <FormField label="문제 제목" required>
                    <input
                      className="w-full px-3 rounded-lg focus:outline-none"
                      style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
                      placeholder="예) 두 수의 합, 피보나치 수열"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </FormField>

                  <FormField label="난이도" required>
                    <select
                      className="w-full px-3 rounded-lg focus:outline-none"
                      style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
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
                      placeholder="학생에게 보여줄 문제 내용을 입력하세요."
                    />
                  </FormField>

                  <FormField label="조건 및 제약 (선택)" tooltip={'풀이에서 주의해야 할 범위나 규칙을 입력하세요.'}>
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                      style={{ border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.6 }}
                      rows={3}
                      value={form.constraint_text}
                      onChange={(e) => setForm((f) => ({ ...f, constraint_text: e.target.value }))}
                    />
                  </FormField>

                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
                    <span style={{ fontSize: '14px', color: 'var(--color-ink)' }}>즉시 공개</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input type="checkbox" checked={form.use_ai_feedback} onChange={(e) => setForm((f) => ({ ...f, use_ai_feedback: e.target.checked }))} className="w-4 h-4 accent-primary" />
                    <span style={{ fontSize: '14px', color: 'var(--color-ink)' }}>AI 피드백 사용</span>
                  </label>
                </div>
              </Section>

              <Section
                label="초기 코드 (에디터 기본값)"
                expanded={expandedSection === 'starter'}
                onToggle={() => setExpandedSection(expandedSection === 'starter' ? 'basic' : 'starter')}
              >
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2D2D2D' }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: '#2D2D2D' }}>
                    <span style={{ fontSize: '12px', color: '#8C8C8C', fontFamily: 'monospace' }}>Python 3</span>
                  </div>
                  <MonacoEditor
                    height={220}
                    language="python"
                    theme="cove-dark"
                    beforeMount={registerCoveTheme}
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
              </Section>

              <Section
                label={`정답 (${form.test_cases.length}개)`}
                expanded={expandedSection === 'testcases'}
                onToggle={() => setExpandedSection(expandedSection === 'testcases' ? 'starter' : 'testcases')}
              >
                <div className="flex flex-col gap-3">
                  {form.test_cases.map((tc, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>정답 {i + 1}</span>
                        {form.test_cases.length > 1 && (
                          <button onClick={() => removeTc(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--tint-danger)]"><X size={12} style={{ color: '#DC2626' }} /></button>
                        )}
                      </div>
                      <div className="mb-3">
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-sub)', marginBottom: 4 }}>입력값 (input)</div>
                        <textarea className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: '13px', backgroundColor: 'var(--color-card)' }} rows={2} value={tc.input} onChange={(e) => updateTc(i, 'input', e.target.value)} />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-sub)', marginBottom: 4 }}>정답 출력값</div>
                        <textarea className="w-full px-2 py-1.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: '13px', backgroundColor: 'var(--color-card)', color: 'var(--color-ink)' }} rows={3} value={tc.expected_output} onChange={(e) => updateTc(i, 'expected_output', e.target.value)} />
                      </div>
                    </div>
                  ))}
                  <button onClick={addTc} className="flex items-center gap-2 px-3 rounded-lg" style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: 'var(--color-sub)', width: '100%', justifyContent: 'center' }}>
                    <Plus size={14} /> 정답 추가
                  </button>
                </div>
              </Section>

              <Section
                label={`힌트 (${form.hints.length}개)`}
                expanded={expandedSection === 'hints'}
                onToggle={() => setExpandedSection(expandedSection === 'hints' ? 'starter' : 'hints')}
              >
                <div className="flex flex-col gap-3">
                  {form.hints.map((h, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>힌트 {i + 1}</span>
                        <button onClick={() => removeHint(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--tint-danger)]"><X size={12} style={{ color: '#DC2626' }} /></button>
                      </div>
                      <textarea
                        className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none"
                        style={{ border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-ink)', lineHeight: 1.6 }}
                        rows={3}
                        value={h.hint_text}
                        onChange={(e) => {
                          const hints = [...form.hints];
                          hints[i] = { ...hints[i], hint_text: e.target.value };
                          setForm((f) => ({ ...f, hints }));
                        }}
                      />
                    </div>
                  ))}
                  <button onClick={addHint} className="flex items-center gap-2 px-3 rounded-lg" style={{ height: 36, border: '1px dashed #BCC0C7', fontSize: '13px', color: 'var(--color-sub)', width: '100%', justifyContent: 'center' }}>
                    <Plus size={14} /> 힌트 추가
                  </button>
                </div>
              </Section>
            </div>

            <div className="flex items-center gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button onClick={closePanel} className="flex-1 rounded-xl" style={{ height: 44, border: '1px solid var(--color-border)', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl text-white disabled:opacity-60" style={{ height: 44, backgroundColor: 'var(--color-primary)', fontSize: '14px', fontWeight: 600 }}>
                {saving ? '저장 중...' : panelMode === 'edit' ? '수정 완료' : '등록'}
              </button>
            </div>
          </div>
        )}
      </div>

      {excelImportOpen && (
        <CurriculumExcelImportModal
          onClose={() => setExcelImportOpen(false)}
          onImported={(message) => {
            setExcelImportOpen(false);
            showToast(message, 'ok');
            loadSubjects();
            if (selectedSubject) loadStages(selectedSubject.id);
            if (selectedStage) loadChapters(selectedStage.id);
            if (selectedChapter) loadProblems(selectedChapter.id);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal title={deleteTarget.title} onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
      )}

      {hierModal && (
        <HierarchyModal
          kind={hierModal.kind}
          initial={hierModal.mode === 'edit' ? {
            title: hierModal.title,
            description: hierModal.description,
            is_published: hierModal.is_published,
            order_no: hierModal.order_no,
          } : null}
          defaultOrderNo={hierModal.order_no}
          onSave={saveHierarchy}
          onClose={() => setHierModal(null)}
          saving={hierSaving}
        />
      )}

      {deleteHierTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={() => setDeleteHierTarget(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-xs mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: 8 }}>{KIND_LABEL[deleteHierTarget.kind]} 삭제</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-sub)', marginBottom: 20 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{deleteHierTarget.row.title}</span>을(를) 삭제하시겠습니까?<br />
              하위 항목이 있으면 삭제할 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteHierTarget(null)} className="flex-1 rounded-lg" style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', fontWeight: 600 }}>취소</button>
              <button onClick={handleDeleteHierarchy} className="flex-1 rounded-lg text-white" style={{ height: 40, backgroundColor: '#DC2626', fontSize: '14px', fontWeight: 600 }}>삭제</button>
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
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button onClick={onToggle} className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface transition-colors">
        <span className="flex items-center gap-2" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
          {label}
          {tooltip && <Tooltip text={tooltip} />}
        </span>
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--color-sub)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-sub)' }} />}
      </button>
      {expanded && <div className="px-5 pb-5 pt-2">{children}</div>}
    </div>
  );
}

function FormField({ label, required, tooltip, children }: { label: string; required?: boolean; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-sub)' }}>
        {label}
        {required && <span style={{ color: '#DC2626' }}>*</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children}
    </div>
  );
}
