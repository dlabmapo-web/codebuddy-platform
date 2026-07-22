export function DeletePatternModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 w-full max-w-xs mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D', marginBottom: 8 }}>패턴 삭제</h3><p style={{ fontSize: '14px', color: '#5A6270', marginBottom: 20 }}>이 AI 피드백 기준을 삭제하시겠습니까?</p>
        <div className="flex gap-2"><button onClick={onCancel} className="flex-1 rounded-lg transition-colors" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button><button onClick={onConfirm} className="flex-1 rounded-lg text-white transition-colors" style={{ height: 40, backgroundColor: '#DC2626', fontSize: '14px', fontWeight: 600 }}>삭제</button></div>
      </div>
    </div>
  );
}
