'use client';

import { X, Lightbulb } from 'lucide-react';

const HINTS = [
  {
    title: '접근 방법 힌트',
    content:
      '배열을 한 번만 순회하면서, 이미 본 숫자들 중 현재 숫자와 합쳐서 target이 되는 숫자가 있는지 빠르게 확인할 방법을 생각해보세요.',
  },
  {
    title: '자료구조 힌트',
    content:
      'O(1) 시간에 숫자의 존재 여부를 확인할 수 있는 자료구조를 활용하면 전체 시간 복잡도를 크게 줄일 수 있어요. 딕셔너리(해시맵)를 활용해보세요.',
  },
];

export function HintPanel({ onClose }: { onClose: () => void }) {
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
          {HINTS.map((hint, i) => (
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
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{hint.title}</span>
              </div>
              <p style={{ fontSize: '13px', color: '#5A6270', lineHeight: 1.7 }}>{hint.content}</p>
            </div>
          ))}

          <div
            className="rounded-xl p-4"
            style={{ border: '1px solid #FEF3C7', backgroundColor: '#FFFBEB' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={14} style={{ color: '#D97706' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#B45309' }}>풀이 방향</span>
            </div>
            <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.7 }}>
              반복문 안에서 <code style={{ backgroundColor: '#FEF3C7', padding: '1px 4px', borderRadius: 4 }}>complement = target - num</code>을 계산하고,
              이 값이 이미 딕셔너리에 있는지 확인해보세요.
            </p>
          </div>
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
