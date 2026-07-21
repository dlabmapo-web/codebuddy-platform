import { useRef } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useCurriculumImport } from '../../_hooks/use-curriculum-import';
import { ImportPreview } from './import-preview';

export function CurriculumImportModal({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const workflow = useCurriculumImport(onImported);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,24,29,0.55)' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white" style={{ boxShadow: '0 16px 48px rgba(22,24,29,0.22)' }} onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary"><FileSpreadsheet size={20} /></div><div><h2 style={{ fontSize: '17px', fontWeight: 800, color: '#16181D' }}>엑셀 일괄 등록</h2><p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 2 }}>과목부터 문제·테스트케이스까지 한 번에 등록합니다.</p></div></div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface" aria-label="닫기"><X size={16} style={{ color: '#5A6270' }} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <div className="rounded-xl bg-[#F8FAFC] px-4 py-3" style={{ border: '1px solid #E5E8EC' }}><p style={{ fontSize: '13px', fontWeight: 700, color: '#16181D' }}>등록 방법</p><ol className="mt-2 list-decimal space-y-1 pl-4" style={{ fontSize: '12px', lineHeight: 1.55, color: '#5A6270' }}><li>샘플 파일의 <b>문제</b>, <b>테스트케이스</b>, <b>힌트</b> 시트를 작성합니다.</li><li>시트 간 문제는 <b>문제키</b>로 연결합니다. 같은 과목·단계·챕터는 자동으로 재사용합니다.</li><li>업로드 후 검증 결과를 확인하고 일괄 등록을 누릅니다.</li></ol></div>
            <a href="/templates/paircode-curriculum-import-sample.xlsx" download className="flex items-center justify-center gap-2 rounded-xl px-4 text-primary transition-colors hover:bg-primary-light" style={{ minHeight: 46, border: '1px solid #C7D9F7', fontSize: '13px', fontWeight: 700 }}><Download size={15} /> 샘플 엑셀 다운로드</a>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) workflow.parseFile(file); event.target.value = ''; }} />
          <button onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); workflow.setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => workflow.setDragging(false)} onDrop={(event) => { event.preventDefault(); workflow.setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) workflow.parseFile(file); }} className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-9 transition-colors" style={{ borderColor: workflow.dragging ? '#1B64DA' : '#C9CED6', backgroundColor: workflow.dragging ? '#F0F7FF' : '#FAFBFC' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm"><Upload size={21} /></div><p className="mt-3" style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>{workflow.parsing ? '엑셀 파일을 읽는 중...' : workflow.fileName || '엑셀 파일을 선택하거나 여기에 놓으세요'}</p><p className="mt-1" style={{ fontSize: '12px', color: '#8A8F98' }}>.xlsx 또는 .xls · 최대 200개 문제</p>
          </button>
          {workflow.errors.length > 0 && <div className="mt-4 rounded-xl bg-[#FFF7F7] p-4" style={{ border: '1px solid #FECACA' }}><div className="flex items-center gap-2" style={{ color: '#DC2626' }}><AlertCircle size={16} /><span style={{ fontSize: '13px', fontWeight: 700 }}>수정이 필요한 항목 {workflow.errors.length}개</span></div><ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5" style={{ fontSize: '12px', color: '#B91C1C' }}>{workflow.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div>}
          <ImportPreview rows={workflow.rows} />
        </div>
        <footer className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid #E5E8EC', backgroundColor: '#FAFBFC' }}><p style={{ fontSize: '11px', color: '#8A8F98' }}>기존 항목과 번호가 충돌하면 등록하지 않고 오류를 안내합니다.</p><div className="flex shrink-0 gap-2"><button onClick={onClose} className="rounded-xl px-5" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '13px', fontWeight: 700, color: '#5A6270' }}>취소</button><button onClick={workflow.submit} disabled={!workflow.ready || workflow.importing} className="rounded-xl px-5 text-white disabled:opacity-40" style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '13px', fontWeight: 700 }}>{workflow.importing ? '등록 중...' : `${workflow.rows.length || ''}개 문제 일괄 등록`}</button></div></footer>
      </div>
    </div>
  );
}
