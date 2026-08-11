'use client';

import { Sparkles, X } from 'lucide-react';

export type AiFeedbackItem = { id: string; content: string; created_at: string };

const ACCENT = '#4F46E5';
const ACCENT_BG = '#EEF2FF';

export function AiFeedbackPanel({
  feedbacks, loading, onClose,
}: {
  feedbacks: AiFeedbackItem[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-full mt-1 bg-card rounded-2xl shadow-lg overflow-hidden"
      style={{ width: 360, maxHeight: 420, overflowY: 'auto', zIndex: 50, border: '1px solid #E5E8EC' }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid #E5E8EC', position: 'sticky', top: 0, backgroundColor: '#FFFFFF' }}
      >
        <span className="flex items-center gap-1.5" style={{ fontSize: '13px', fontWeight: 700, color: '#16181D' }}>
          <Sparkles size={14} style={{ color: ACCENT }} /> AI 피드백
        </span>
        <button onClick={onClose} className="flex items-center justify-center rounded" style={{ width: 24, height: 24, color: '#BCC0C7' }}>
          <X size={14} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: feedbacks.length > 0 ? `1px solid ${ACCENT_BG}` : 'none' }}>
          <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
          <span style={{ fontSize: '13px', color: '#5A6270' }}>AI가 코드를 분석하고 있어요...</span>
        </div>
      )}

      {feedbacks.length === 0 && !loading ? (
        <div className="px-4 py-8 text-center">
          <p style={{ fontSize: '13px', color: '#8A8F98' }}>아직 AI 피드백이 없습니다.</p>
          <p style={{ fontSize: '12px', color: '#BCC0C7', marginTop: 4 }}>오답을 제출하면 AI가 코드를 분석해드려요.</p>
        </div>
      ) : (
        feedbacks.map((fb, i) => (
          <div key={fb.id} style={{ padding: '12px 16px', borderBottom: i < feedbacks.length - 1 ? '1px solid #F0F1FF' : 'none' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="rounded-full flex items-center justify-center text-white shrink-0" style={{ width: 22, height: 22, backgroundColor: ACCENT }}>
                <Sparkles size={11} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: ACCENT }}>AI 튜터</span>
              <span style={{ fontSize: '11px', color: '#BCC0C7', marginLeft: 'auto' }}>
                {new Date(fb.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#16181D', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{fb.content}</p>
          </div>
        ))
      )}

      <div className="px-4 py-3" style={{ backgroundColor: ACCENT_BG }}>
        <p style={{ fontSize: '11px', color: ACCENT, lineHeight: 1.6 }}>AI가 자동으로 분석한 피드백이며, 정답을 직접 알려주지는 않습니다.</p>
      </div>
    </div>
  );
}
