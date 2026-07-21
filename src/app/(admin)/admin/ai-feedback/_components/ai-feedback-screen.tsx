'use client';

import { Plus } from 'lucide-react';
import { AdminToast } from '../../_components/admin-toast';
import { useAiFeedbackPatterns } from '../_hooks/use-ai-feedback-patterns';
import { DeletePatternModal } from './delete-pattern-modal';
import { PatternFilters } from './pattern-filters';
import { PatternList } from './pattern-list';
import { PatternModal } from './pattern-modal';

export function AiFeedbackScreen() {
  const workflow = useAiFeedbackPatterns();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div><h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>AI 피드백 기준</h1><p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>오답 채점 시 AI가 학생 코드를 판정할 다양한 오류 패턴을 관리하세요. 모든 문제에 공통으로 적용됩니다.</p></div>
        <button onClick={workflow.openCreate} className="flex items-center gap-2 px-4 rounded-xl text-white transition-colors" style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }} onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = '#1450B5')} onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = '#1B64DA')}><Plus size={16} />새 패턴 추가</button>
      </div>
      <PatternFilters patterns={workflow.patterns} typeOptions={workflow.typeOptions} typeFilter={workflow.typeFilter} onChange={workflow.setTypeFilter} />
      <PatternList patterns={workflow.visiblePatterns} loading={workflow.loading} onToggleActive={workflow.toggleActive} onEdit={workflow.openEdit} onDelete={workflow.setDeleteTarget} />
      {workflow.modal && <PatternModal initial={workflow.modal.mode === 'edit' ? workflow.modal.data : null} typeOptions={workflow.typeOptions} onSave={workflow.savePattern} onClose={() => workflow.setModal(null)} saving={workflow.saving} />}
      {workflow.deleteTarget && <DeletePatternModal onConfirm={workflow.deletePattern} onCancel={() => workflow.setDeleteTarget(null)} />}
      {workflow.toast && <AdminToast message={workflow.toast.message} type={workflow.toast.type} />}
    </div>
  );
}
