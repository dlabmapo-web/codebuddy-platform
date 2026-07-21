import { ChevronRight, FileSpreadsheet, FolderPlus, Layers, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { useCurriculumBrowser } from '../_hooks/use-curriculum-browser';
import { HIERARCHY_LABEL } from '../_lib/presentation';
import type { HierarchyRow } from '../_lib/types';
import { HierarchyList } from './hierarchy-list';
import { ProblemList } from './problem-list';

type Browser = ReturnType<typeof useCurriculumBrowser>;

export function CurriculumBrowser({
  browser,
  editorOpen,
  onCloseEditor,
  onCreateProblem,
  onEditProblem,
  onOpenImport,
  children,
}: {
  browser: Browser;
  editorOpen: boolean;
  onCloseEditor: () => void;
  onCreateProblem: () => void;
  onEditProblem: (id: string) => void;
  onOpenImport: () => void;
  children: ReactNode;
}) {
  const enterHierarchy = (row: HierarchyRow) => {
    onCloseEditor();
    if (browser.level === 'subjects') browser.enterSubject(row);
    else if (browser.level === 'stages') browser.enterStage(row);
    else browser.enterChapter(row);
  };
  const goTo = (target: 'subjects' | 'stages' | 'chapters') => {
    onCloseEditor();
    browser.goTo(target);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div><h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>문제 관리</h1><p style={{ fontSize: '14px', color: '#5A6270', marginTop: 2 }}>과목 → 단계 → 챕터 → 문제 순으로 관리하세요.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenImport} className="flex items-center gap-2 px-4 rounded-xl transition-colors" style={{ height: 40, border: '1px solid #C7D9F7', backgroundColor: '#F8FBFF', fontSize: '14px', fontWeight: 600, color: '#1B64DA' }}><FileSpreadsheet size={16} />엑셀 일괄 등록</button>
          {browser.currentKind && <button onClick={browser.openCreateHierarchy} className="flex items-center gap-2 px-4 rounded-xl transition-colors" style={{ height: 40, border: '1px solid #E5E8EC', backgroundColor: '#FFFFFF', fontSize: '14px', fontWeight: 600, color: '#16181D' }}><FolderPlus size={16} style={{ color: '#5A6270' }} />{HIERARCHY_LABEL[browser.currentKind]} 추가</button>}
          {browser.level === 'problems' && <button onClick={onCreateProblem} className="flex items-center gap-2 px-4 rounded-xl text-white transition-colors" style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}><Plus size={16} />문제 등록</button>}
        </div>
      </div>

      <nav className="flex items-center gap-1.5 mb-4 flex-wrap" style={{ fontSize: '13px' }}>
        <button onClick={() => goTo('subjects')} style={{ fontWeight: browser.level === 'subjects' ? 700 : 500, color: browser.level === 'subjects' ? '#1B64DA' : '#5A6270' }}>과목</button>
        {browser.selectedSubject && <><ChevronRight size={14} style={{ color: '#BCC0C7' }} /><button onClick={() => goTo('stages')} style={{ fontWeight: browser.level === 'stages' ? 700 : 500, color: browser.level === 'stages' ? '#1B64DA' : '#5A6270' }}>{browser.selectedSubject.order_no}. {browser.selectedSubject.title}</button></>}
        {browser.selectedStage && <><ChevronRight size={14} style={{ color: '#BCC0C7' }} /><button onClick={() => goTo('chapters')} style={{ fontWeight: browser.level === 'chapters' ? 700 : 500, color: browser.level === 'chapters' ? '#1B64DA' : '#5A6270' }}>{browser.selectedStage.order_no}. {browser.selectedStage.title}</button></>}
        {browser.selectedChapter && <><ChevronRight size={14} style={{ color: '#BCC0C7' }} /><span style={{ fontWeight: 700, color: '#1B64DA' }}>{browser.selectedChapter.order_no}. {browser.selectedChapter.title}</span></>}
      </nav>

      <div className="flex gap-5 items-start">
        <div className="flex flex-col bg-white rounded-2xl overflow-hidden" style={{ flex: '0 0 auto', width: editorOpen ? '460px' : '100%', maxWidth: editorOpen ? '460px' : '860px', border: '1px solid #E5E8EC', minHeight: 320 }}>
        {browser.loading ? <div className="flex-1 flex items-center justify-center py-16" style={{ color: '#5A6270', fontSize: '14px' }}>불러오는 중...</div>
          : browser.level !== 'problems' && browser.currentRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center py-16">
              <Layers size={36} style={{ color: '#D1D5DB' }} /><p style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>아직 {browser.currentKind ? HIERARCHY_LABEL[browser.currentKind] : ''}가 없습니다</p>
              <button onClick={browser.openCreateHierarchy} className="flex items-center gap-2 px-4 mt-2 rounded-xl text-white" style={{ height: 38, backgroundColor: '#1B64DA', fontSize: '13px', fontWeight: 600 }}><FolderPlus size={15} /> {browser.currentKind ? HIERARCHY_LABEL[browser.currentKind] : ''} 추가</button>
            </div>
          ) : browser.level === 'problems' ? (
            <ProblemList problems={browser.problems} chapterOrder={browser.selectedChapter?.order_no} onCreate={onCreateProblem} onEdit={onEditProblem} onMove={browser.moveProblem} onTogglePublish={browser.toggleProblemPublish} onDelete={browser.setDeleteProblemTarget} />
          ) : browser.currentKind ? (
            <HierarchyList rows={browser.currentRows} kind={browser.currentKind} childLabel={browser.childLabel} onEnter={enterHierarchy} onMove={browser.moveHierarchy} onTogglePublish={browser.toggleHierarchyPublish} onEdit={browser.openEditHierarchy} onDelete={browser.setDeleteHierarchyTarget} />
          ) : null}
        </div>
        {children}
      </div>
    </>
  );
}
