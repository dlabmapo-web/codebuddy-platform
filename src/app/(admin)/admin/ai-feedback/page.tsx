'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Check, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react';
import type { DbAiFeedbackPattern, AiFeedbackPatternType } from '@/lib/types/db';

type PatternForm = {
  pattern_type: AiFeedbackPatternType;
  error_category: string;
  criteria: string;
  example_code: string;
  tutor_feedback: string;
  is_active: boolean;
};

const EMPTY_FORM: PatternForm = {
  pattern_type: 'for',
  error_category: '',
  criteria: '',
  example_code: '',
  tutor_feedback: '',
  is_active: true,
};

const TYPE_STYLE: Record<AiFeedbackPatternType, { bg: string; color: string; label: string }> = {
  for: { bg: '#EAF1FD', color: '#1450B5', label: 'for' },
  while: { bg: '#F3E8FF', color: '#7C3AED', label: 'while' },
};

function Toast({ message, type }: { message: string; type: 'ok' | 'err' }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white z-50"
      style={{ backgroundColor: type === 'ok' ? '#16A34A' : '#DC2626', fontSize: '14px', fontWeight: 600, boxShadow: '0 4px 16px rgba(22,24,29,0.18)' }}
    >
      {message}
    </div>
  );
}

function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 w-full max-w-xs mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D', marginBottom: 8 }}>패턴 삭제</h3>
        <p style={{ fontSize: '14px', color: '#5A6270', marginBottom: 20 }}>이 AI 피드백 기준을 삭제하시겠습니까?</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg transition-colors" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
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

function PatternModal({
  initial, onSave, onClose, saving,
}: {
  initial: PatternForm | null;
  onSave: (data: PatternForm) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PatternForm>(initial ?? EMPTY_FORM);

  const canSave = form.error_category.trim() && form.criteria.trim() && form.tutor_feedback.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full mx-4 flex flex-col"
        style={{ maxWidth: 560, maxHeight: '88vh', boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>
            {initial ? 'AI 피드백 기준 수정' : '새 AI 피드백 기준'}
          </h3>
          <button onClick={onClose} className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#F6F7F9]" style={{ width: 32, height: 32 }}>
            <X size={16} style={{ color: '#5A6270' }} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 overflow-auto">
          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>유형 <span style={{ color: '#DC2626' }}>*</span></label>
            <div className="flex gap-2">
              {(['for', 'while'] as AiFeedbackPatternType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, pattern_type: t }))}
                  className="flex-1 rounded-lg transition-colors"
                  style={{
                    height: 40,
                    border: `1px solid ${form.pattern_type === t ? TYPE_STYLE[t].color : '#E5E8EC'}`,
                    backgroundColor: form.pattern_type === t ? TYPE_STYLE[t].bg : '#FFFFFF',
                    color: form.pattern_type === t ? TYPE_STYLE[t].color : '#5A6270',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>오류 분류 <span style={{ color: '#DC2626' }}>*</span></label>
            <input
              className="w-full px-3 rounded-lg focus:outline-none"
              style={{ height: 42, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              placeholder="예) 논리오류(범위), 문법오류, 자료형오류"
              value={form.error_category}
              onChange={(e) => setForm((f) => ({ ...f, error_category: e.target.value }))}
            />
          </div>

          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>판단 기준 <span style={{ color: '#DC2626' }}>*</span></label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
              style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }}
              rows={3}
              placeholder="이 오류로 판단할 코드 패턴을 문제와 무관하게 서술하세요."
              value={form.criteria}
              onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))}
            />
          </div>

          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>예시 코드 (선택)</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
              style={{ border: '1px solid #2D2D2D', backgroundColor: '#1E1E1E', color: '#D4D4D4', fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.6 }}
              rows={5}
              placeholder="이 오류를 보여주는 예시 코드"
              value={form.example_code}
              onChange={(e) => setForm((f) => ({ ...f, example_code: e.target.value }))}
            />
          </div>

          <div>
            <label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>튜터 피드백 <span style={{ color: '#DC2626' }}>*</span></label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
              style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }}
              rows={3}
              placeholder="이 오류에 해당할 때 학생에게 전달할 피드백 문구"
              value={form.tutor_feedback}
              onChange={(e) => setForm((f) => ({ ...f, tutor_feedback: e.target.value }))}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <span style={{ fontSize: '14px', color: '#16181D' }}>사용 중</span>
            <span style={{ fontSize: '12px', color: '#8A8F98' }}>(끄면 AI 채점 시 이 기준을 사용하지 않습니다)</span>
          </label>
        </div>

        <div className="flex gap-2 px-6 py-5 flex-shrink-0" style={{ borderTop: '1px solid #E5E8EC' }}>
          <button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !canSave}
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

export default function AdminAiFeedbackPage() {
  const [patterns, setPatterns] = useState<DbAiFeedbackPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | AiFeedbackPatternType>('all');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; id?: string; data: PatternForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DbAiFeedbackPattern | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (message: string, type: 'ok' | 'err') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/ai-feedback-patterns');
    const json = await res.json();
    setPatterns(json.patterns ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const visible = patterns.filter((p) => typeFilter === 'all' || p.pattern_type === typeFilter);
  const forCount = patterns.filter((p) => p.pattern_type === 'for').length;
  const whileCount = patterns.filter((p) => p.pattern_type === 'while').length;

  const handleSave = async (data: PatternForm) => {
    if (!modal) return;
    setSaving(true);
    const url = modal.mode === 'edit' && modal.id ? `/api/admin/ai-feedback-patterns/${modal.id}` : '/api/admin/ai-feedback-patterns';
    const method = modal.mode === 'edit' ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { showToast(json.error?.message ?? '저장 중 오류가 발생했습니다.', 'err'); return; }
    showToast(modal.mode === 'edit' ? '기준이 수정되었습니다.' : '기준이 추가되었습니다.', 'ok');
    setModal(null);
    fetchPatterns();
  };

  const handleDelete = async (pattern: DbAiFeedbackPattern) => {
    const res = await fetch(`/api/admin/ai-feedback-patterns/${pattern.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (!res.ok) { showToast('삭제 중 오류가 발생했습니다.', 'err'); return; }
    showToast('기준이 삭제되었습니다.', 'ok');
    fetchPatterns();
  };

  const toggleActive = async (pattern: DbAiFeedbackPattern) => {
    await fetch(`/api/admin/ai-feedback-patterns/${pattern.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !pattern.is_active }),
    });
    fetchPatterns();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>AI 피드백 기준</h1>
          <p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>
            오답 채점 시 AI가 학생 코드를 판정할 for/while 오류 패턴을 관리하세요. 모든 문제에 공통으로 적용됩니다.
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create', data: EMPTY_FORM })}
          className="flex items-center gap-2 px-4 rounded-xl text-white transition-colors"
          style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
        >
          <Plus size={16} />
          새 패턴 추가
        </button>
      </div>

      <div className="flex items-center gap-1.5 rounded-2xl p-1 bg-white w-fit" style={{ border: '1px solid #E5E8EC' }}>
        {([
          { key: 'all', label: `전체 ${patterns.length}` },
          { key: 'for', label: `for ${forCount}` },
          { key: 'while', label: `while ${whileCount}` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className="rounded-xl px-4 transition-colors"
            style={{
              height: 36,
              fontSize: '13px',
              fontWeight: typeFilter === key ? 700 : 500,
              backgroundColor: typeFilter === key ? '#16181D' : 'transparent',
              color: typeFilter === key ? '#FFFFFF' : '#5A6270',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl animate-pulse" style={{ height: 100, border: '1px solid #E5E8EC' }} />
          ))
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-20 gap-2" style={{ border: '1px solid #E5E8EC' }}>
            <Sparkles size={40} style={{ color: '#E5E8EC' }} />
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }}>등록된 기준이 없습니다</p>
            <p style={{ fontSize: '14px', color: '#5A6270' }}>새 패턴을 추가해 AI 피드백 기준을 만들어보세요</p>
          </div>
        ) : (
          visible.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl p-5 flex flex-col gap-3"
              style={{ border: '1px solid #E5E8EC', opacity: p.is_active ? 1 : 0.6 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: TYPE_STYLE[p.pattern_type].bg, color: TYPE_STYLE[p.pattern_type].color }}>
                    {TYPE_STYLE[p.pattern_type].label}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>{p.error_category}</span>
                  {!p.is_active && (
                    <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#F0F1F3', color: '#8A8F98' }}>미사용</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(p)} title={p.is_active ? '사용 중지' : '사용 시작'} className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-[#F0F1F3]">
                    {p.is_active ? <ToggleRight size={18} style={{ color: '#16A34A' }} /> : <ToggleLeft size={18} style={{ color: '#BCC0C7' }} />}
                  </button>
                  <button
                    onClick={() => setModal({
                      mode: 'edit',
                      id: p.id,
                      data: {
                        pattern_type: p.pattern_type,
                        error_category: p.error_category,
                        criteria: p.criteria,
                        example_code: p.example_code ?? '',
                        tutor_feedback: p.tutor_feedback,
                        is_active: p.is_active,
                      },
                    })}
                    className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-[#EAF1FD]"
                    title="수정"
                  >
                    <Pencil size={14} style={{ color: '#1B64DA' }} />
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-[#FEE2E2]" title="삭제">
                    <Trash2 size={14} style={{ color: '#DC2626' }} />
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '13px', color: '#5A6270', lineHeight: 1.6 }}>{p.criteria}</p>

              {p.example_code && (
                <pre
                  className="rounded-xl p-3 overflow-x-auto"
                  style={{ backgroundColor: '#1E1E1E', color: '#D4D4D4', fontSize: '12px', fontFamily: 'monospace', lineHeight: 1.6 }}
                >
                  {p.example_code}
                </pre>
              )}

              <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#F6F7F9' }}>
                <p style={{ fontSize: '13px', color: '#16181D', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{p.tutor_feedback}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {modal && (
        <PatternModal
          initial={modal.mode === 'edit' ? modal.data : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
      {deleteTarget && <DeleteConfirmModal onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
