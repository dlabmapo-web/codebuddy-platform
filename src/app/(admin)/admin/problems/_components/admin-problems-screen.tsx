'use client';

import { useCallback, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useCurriculumBrowser } from '../_hooks/use-curriculum-browser';
import { useProblemEditor } from '../_hooks/use-problem-editor';
import { HIERARCHY_LABEL } from '../_lib/presentation';
import type { MessageType } from '../_lib/types';
import { CurriculumBrowser } from './curriculum-browser';
import { CurriculumImportModal } from './curriculum-import/curriculum-import-modal';
import { DeleteConfirmationModal } from './delete-confirmation-modal';
import { HierarchyModal } from './hierarchy-modal';
import { ProblemEditorPanel } from './problem-editor-panel';

export function AdminProblemsScreen() {
  const [toast, setToast] = useState<{ message: string; type: MessageType } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const showMessage = useCallback((message: string, type: MessageType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  const browser = useCurriculumBrowser(showMessage);
  const editor = useProblemEditor({
    selectedChapter: browser.selectedChapter,
    showMessage,
    refreshProblems: browser.loadProblems,
  });
  const curriculumPath = `${browser.selectedSubject?.title} / ${browser.selectedStage?.title} / ${browser.selectedChapter?.title}`;

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-white" style={{ backgroundColor: toast.type === 'ok' ? '#16A34A' : '#DC2626', boxShadow: '0 4px 16px rgba(22,24,29,0.16)', fontSize: '14px', fontWeight: 600 }}>
          {toast.type === 'ok' ? <Check size={16} /> : <X size={16} />}{toast.message}
        </div>
      )}

      <CurriculumBrowser
        browser={browser}
        editorOpen={editor.panelMode !== 'closed'}
        onCloseEditor={editor.close}
        onCreateProblem={editor.openCreate}
        onEditProblem={editor.openEdit}
        onOpenImport={() => setImportOpen(true)}
      >
        <ProblemEditorPanel editor={editor} curriculumPath={curriculumPath} />
      </CurriculumBrowser>

      {importOpen && (
        <CurriculumImportModal
          onClose={() => setImportOpen(false)}
          onImported={(message) => {
            setImportOpen(false);
            showMessage(message, 'ok');
            browser.refreshAll();
          }}
        />
      )}

      {browser.deleteProblemTarget && (
        <DeleteConfirmationModal
          title={browser.deleteProblemTarget.title}
          description={<> 문제를 삭제하시겠습니까?<br />테스트케이스와 힌트도 함께 삭제됩니다.</>}
          onConfirm={browser.deleteProblem}
          onCancel={() => browser.setDeleteProblemTarget(null)}
        />
      )}

      {browser.hierarchyModal && (
        <HierarchyModal
          kind={browser.hierarchyModal.kind}
          initial={browser.hierarchyModal.mode === 'edit' ? {
            title: browser.hierarchyModal.title,
            description: browser.hierarchyModal.description,
            is_published: browser.hierarchyModal.is_published,
            order_no: browser.hierarchyModal.order_no,
          } : null}
          defaultOrderNo={browser.hierarchyModal.order_no}
          onSave={browser.saveHierarchy}
          onClose={() => browser.setHierarchyModal(null)}
          saving={browser.hierarchySaving}
        />
      )}

      {browser.deleteHierarchyTarget && (
        <DeleteConfirmationModal
          heading={`${HIERARCHY_LABEL[browser.deleteHierarchyTarget.kind]} 삭제`}
          title={browser.deleteHierarchyTarget.row.title}
          description={<>을(를) 삭제하시겠습니까?<br />하위 항목이 있으면 삭제할 수 없습니다.</>}
          onConfirm={browser.deleteHierarchy}
          onCancel={() => browser.setDeleteHierarchyTarget(null)}
        />
      )}
    </div>
  );
}
