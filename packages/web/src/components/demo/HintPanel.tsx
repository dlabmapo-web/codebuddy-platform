'use client';

import { X, Lightbulb } from 'lucide-react';

export function HintPanel({ hints, onClose }: { hints: string[]; onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(22,24,29,0.3)' }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col bg-white"
        style={{ width: 360, borderLeft: '1px solid #E5E8EC', boxShadow: '-4px 0 16px rgba(22,24,29,0.08)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #E5E8EC' }}
        >
          <div className="flex items-center gap-2">
            <Lightbulb size={16} style={{ color: '#D97706' }} />
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>힌트</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface transition-colors"
          >
            <X size={16} style={{ color: '#5A6270' }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 flex flex-col gap-3">
          {hints.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Lightbulb size={32} style={{ color: '#E5E8EC' }} />
              <p style={{ fontSize: '13px', color: '#8A8F98', textAlign: 'center' }}>
                이 문제에 등록된 힌트가 없습니다.
              </p>
            </div>
          ) : (
            hints.map((hint, i) => (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{ border: '1px solid #E5E8EC' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#EAF1FD', fontSize: '11px', fontWeight: 700, color: '#1B64DA' }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>힌트 {i + 1}</span>
                </div>
                <p style={{ fontSize: '13px', color: '#5A6270', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{hint}</p>
              </div>
            ))
          )}
        </div>

        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid #E5E8EC', backgroundColor: '#F6F7F9' }}
        >
          <p style={{ fontSize: '12px', color: '#5A6270', lineHeight: 1.6 }}>
            힌트는 정답을 직접 알려주지 않고 방향만 제시합니다.
          </p>
        </div>
      </div>
    </>
  );
}
