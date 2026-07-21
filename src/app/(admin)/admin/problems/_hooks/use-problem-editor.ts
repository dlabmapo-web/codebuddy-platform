import { useState } from 'react';
import type { DbProblem, DbProblemHint, DbTestCase } from '@/lib/types/db';
import { buildProblemPayload, createEmptyProblemForm, normalizeProblemForm, validateProblemForm } from '../_lib/problem-form';
import type { EditorSection, HierarchyRow, ProblemForm, ShowMessage, TestCaseForm } from '../_lib/types';

export function useProblemEditor({
  selectedChapter,
  showMessage,
  refreshProblems,
}: {
  selectedChapter: HierarchyRow | null;
  showMessage: ShowMessage;
  refreshProblems: (chapterId: string) => Promise<void>;
}) {
  const [panelMode, setPanelMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm>(() => createEmptyProblemForm());
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<EditorSection>('basic');

  const close = () => {
    setPanelMode('closed');
    setEditId(null);
  };

  const openCreate = () => {
    if (!selectedChapter) {
      showMessage('챕터를 먼저 선택해주세요.', 'err');
      return;
    }
    setForm(createEmptyProblemForm(selectedChapter.id));
    setEditId(null);
    setPanelMode('create');
    setExpandedSection('basic');
  };

  const openEdit = async (id: string) => {
    const response = await fetch(`/api/admin/problems/${id}`);
    const json = await response.json();
    if (!json.problem) {
      showMessage('문제를 불러올 수 없습니다.', 'err');
      return;
    }
    const detail = json as { problem: DbProblem; test_cases: DbTestCase[]; hints: DbProblemHint[] };
    setForm(normalizeProblemForm(detail.problem, detail.test_cases, detail.hints, selectedChapter?.id ?? ''));
    setEditId(id);
    setPanelMode('edit');
    setExpandedSection('basic');
  };

  const save = async () => {
    const validationMessage = validateProblemForm(form);
    if (validationMessage) {
      showMessage(validationMessage, 'err');
      return;
    }
    setSaving(true);
    const url = panelMode === 'edit' && editId ? `/api/admin/problems/${editId}` : '/api/admin/problems';
    const method = panelMode === 'edit' ? 'PATCH' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildProblemPayload(form)),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok) {
      showMessage(json.error?.message ?? '저장 중 오류가 발생했습니다.', 'err');
      return;
    }
    showMessage(panelMode === 'edit' ? '문제가 수정되었습니다.' : '문제가 등록되었습니다.', 'ok');
    close();
    if (selectedChapter) await refreshProblems(selectedChapter.id);
  };

  const updateField = <Key extends keyof ProblemForm>(key: Key, value: ProblemForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTestCase = (index: number, field: keyof TestCaseForm, value: unknown) => {
    setForm((current) => {
      const testCases = [...current.test_cases];
      testCases[index] = { ...testCases[index], [field]: value };
      return { ...current, test_cases: testCases };
    });
  };

  const addTestCase = () => setForm((current) => ({
    ...current,
    test_cases: [...current.test_cases, { input: '', expected_output: '', is_sample: false, is_hidden: false, order_no: current.test_cases.length + 1 }],
  }));

  const removeTestCase = (index: number) => setForm((current) => ({
    ...current,
    test_cases: current.test_cases.filter((_, itemIndex) => itemIndex !== index).map((testCase, itemIndex) => ({ ...testCase, order_no: itemIndex + 1 })),
  }));

  const addHint = () => setForm((current) => ({
    ...current,
    hints: [...current.hints, { hint_text: '', trigger_pattern: '', order_no: current.hints.length + 1 }],
  }));

  const updateHint = (index: number, hintText: string) => setForm((current) => {
    const hints = [...current.hints];
    hints[index] = { ...hints[index], hint_text: hintText };
    return { ...current, hints };
  });

  const removeHint = (index: number) => setForm((current) => ({
    ...current,
    hints: current.hints.filter((_, itemIndex) => itemIndex !== index).map((hint, itemIndex) => ({ ...hint, order_no: itemIndex + 1 })),
  }));

  return {
    addHint, addTestCase, close, expandedSection, form, openCreate, openEdit, panelMode,
    removeHint, removeTestCase, save, saving, setExpandedSection, updateField, updateHint,
    updateTestCase,
  };
}
