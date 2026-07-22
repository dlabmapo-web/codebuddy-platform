import { useState } from 'react';
import { HIERARCHY_LABEL } from '../_lib/presentation';
import type { HierarchyKind } from '../_lib/types';

export function HierarchyModal({ kind, initial, defaultOrderNo, onSave, onClose, saving }: {
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
  const label = HIERARCHY_LABEL[kind];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D', marginBottom: 4 }}>{initial ? `${label} 수정` : `새 ${label}`}</h3>
        <p style={{ fontSize: '13px', color: '#8A8F98', marginBottom: 18 }}>번호와 이름을 입력하세요.</p>
        <div className="flex flex-col gap-4">
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>{label} 번호 <span style={{ color: '#DC2626' }}>*</span></label><input type="number" min={1} className="w-full px-3 rounded-lg focus:outline-none" style={{ height: 42, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} value={orderNo} onChange={(event) => setOrderNo(event.target.value)} /></div>
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>{label} 이름 <span style={{ color: '#DC2626' }}>*</span></label><input autoFocus className="w-full px-3 rounded-lg focus:outline-none" style={{ height: 42, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} placeholder={`예) ${kind === 'subject' ? '파이썬' : kind === 'stage' ? '1단계' : '변수와 입출력'}`} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
          <div><label className="block mb-1.5" style={{ fontSize: '13px', fontWeight: 600, color: '#5A6270' }}>설명 (선택)</label><textarea className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none" style={{ border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', lineHeight: 1.6 }} rows={2} placeholder={`이 ${label}에 대한 간단한 설명`} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
          <label className="flex items-center gap-2 cursor-pointer w-fit"><input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} className="w-4 h-4 accent-primary" /><span style={{ fontSize: '14px', color: '#16181D' }}>학생에게 공개</span><span style={{ fontSize: '12px', color: '#8A8F98' }}>(끄면 하위도 함께 숨겨집니다)</span></label>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
          <button onClick={() => onSave({ title, description, is_published: isPublished, order_no: Math.max(1, Number(orderNo) || defaultOrderNo) })} disabled={saving || !title.trim()} className="flex-1 rounded-xl text-white transition-colors disabled:opacity-50" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}>{saving ? '저장 중...' : initial ? '수정' : '추가'}</button>
        </div>
      </div>
    </div>
  );
}
