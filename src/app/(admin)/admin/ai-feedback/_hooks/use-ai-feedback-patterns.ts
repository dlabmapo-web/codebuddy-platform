import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DbAiFeedbackPattern } from '@/lib/types/db';
import { createEmptyPatternForm, patternToForm } from '../_lib/pattern-form';
import type { PatternForm, PatternModalState, PatternTypeFilter, ToastMessage } from '../_lib/types';

export function useAiFeedbackPatterns() {
  const [patterns, setPatterns] = useState<DbAiFeedbackPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<PatternTypeFilter>('all');
  const [modal, setModal] = useState<PatternModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DbAiFeedbackPattern | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((message: string, type: ToastMessage['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/admin/ai-feedback-patterns');
    const json = await response.json();
    setPatterns(json.patterns ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial route hydration intentionally starts the existing client-side request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPatterns();
  }, [fetchPatterns]);

  const typeOptions = useMemo(
    () => Array.from(new Set(patterns.map((pattern) => pattern.pattern_type))).sort((a, b) => a.localeCompare(b, 'ko')),
    [patterns],
  );
  const visiblePatterns = useMemo(
    () => patterns.filter((pattern) => typeFilter === 'all' || pattern.pattern_type === typeFilter),
    [patterns, typeFilter],
  );

  const openCreate = () => setModal({ mode: 'create', data: createEmptyPatternForm() });
  const openEdit = (pattern: DbAiFeedbackPattern) => setModal({ mode: 'edit', id: pattern.id, data: patternToForm(pattern) });

  const savePattern = async (data: PatternForm) => {
    if (!modal) return;
    setSaving(true);
    const url = modal.mode === 'edit' && modal.id ? `/api/admin/ai-feedback-patterns/${modal.id}` : '/api/admin/ai-feedback-patterns';
    const method = modal.mode === 'edit' ? 'PATCH' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok) {
      showToast(json.error?.message ?? '저장 중 오류가 발생했습니다.', 'err');
      return;
    }
    const saved = json.pattern as DbAiFeedbackPattern;
    setPatterns((current) => modal.mode === 'edit'
      ? current.map((pattern) => pattern.id === saved.id ? saved : pattern)
      : [...current, saved].sort((a, b) => a.order_no - b.order_no));
    showToast(modal.mode === 'edit' ? '기준이 수정되었습니다.' : '기준이 추가되었습니다.', 'ok');
    setModal(null);
  };

  const deletePattern = async () => {
    if (!deleteTarget) return;
    const response = await fetch(`/api/admin/ai-feedback-patterns/${deleteTarget.id}`, { method: 'DELETE' });
    const targetId = deleteTarget.id;
    setDeleteTarget(null);
    if (!response.ok) {
      showToast('삭제 중 오류가 발생했습니다.', 'err');
      return;
    }
    setPatterns((current) => current.filter((pattern) => pattern.id !== targetId));
    showToast('기준이 삭제되었습니다.', 'ok');
  };

  const toggleActive = async (pattern: DbAiFeedbackPattern) => {
    const nextActive = !pattern.is_active;
    setPatterns((current) => current.map((item) => item.id === pattern.id ? { ...item, is_active: nextActive } : item));
    const response = await fetch(`/api/admin/ai-feedback-patterns/${pattern.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextActive }),
    });
    const json = await response.json();
    if (!response.ok) {
      setPatterns((current) => current.map((item) => item.id === pattern.id ? pattern : item));
      showToast(json.error?.message ?? '사용 여부 변경 중 오류가 발생했습니다.', 'err');
      return;
    }
    setPatterns((current) => current.map((item) => item.id === pattern.id ? json.pattern : item));
  };

  return {
    deletePattern, deleteTarget, loading, modal, openCreate, openEdit, patterns,
    savePattern, saving, setDeleteTarget, setModal, setTypeFilter, toast, toggleActive,
    typeFilter, typeOptions, visiblePatterns,
  };
}
