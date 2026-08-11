'use client';

import { Check, X } from 'lucide-react';

export interface SubmitResult {
  status: 'pass' | 'fail' | 'partial';
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  failedCases: number[];
}

interface ResultModalProps {
  result: SubmitResult;
  onClose: () => void;
  onRetry: () => void;
  onHint: () => void;
}

export function ResultModal({ result, onClose, onRetry, onHint }: ResultModalProps) {
  const isPass = result.status === 'pass';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(22,24,29,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl p-8 w-full max-w-sm mx-4"
        style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isPass ? '#DCFCE7' : '#FEE2E2' }}
          >
            {isPass
              ? <Check size={32} style={{ color: '#16A34A' }} strokeWidth={2.5} />
              : <X size={32} style={{ color: '#DC2626' }} strokeWidth={2.5} />}
          </div>
        </div>

        <h2
          className="text-center mb-2"
          style={{ fontSize: '20px', fontWeight: 700, color: isPass ? '#16A34A' : '#DC2626' }}
        >
          {isPass ? '정답입니다!' : result.status === 'partial' ? '일부 통과' : '오답입니다'}
        </h2>

        {isPass ? (
          <>
            <p className="text-center mb-5" style={{ fontSize: '14px', color: '#5A6270' }}>
              모든 테스트케이스를 통과했습니다
            </p>
            <div
              className="flex justify-around rounded-xl p-4 mb-6"
              style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}
            >
              <div className="text-center">
                <div style={{ fontSize: '11px', color: '#5A6270', marginBottom: 2 }}>통과</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#16A34A' }}>
                  {result.passedCount}/{result.totalCount}
                </div>
              </div>
              <div style={{ width: 1, backgroundColor: '#E5E8EC' }} />
              <div className="text-center">
                <div style={{ fontSize: '11px', color: '#5A6270', marginBottom: 2 }}>실행 시간</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#16181D' }}>
                  {result.runtimeMs}ms
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg text-white transition-colors"
              style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
            >
              닫기
            </button>
          </>
        ) : (
          <>
            <p className="text-center mb-4" style={{ fontSize: '14px', color: '#5A6270' }}>
              {result.passedCount}/{result.totalCount} 케이스 통과
            </p>
            <div
              className="rounded-xl p-4 mb-5"
              style={{ backgroundColor: '#FFF5F5', border: '1px solid #FCA5A5' }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>
                실패한 테스트케이스
              </div>
              <div style={{ fontSize: '13px', color: '#5A6270' }}>
                케이스 {result.failedCases.join(', ')}에서 오류가 발생했습니다.
              </div>
              <div className="mt-2" style={{ fontSize: '12px', color: '#B91C1C' }}>
                * 정답은 노출되지 않습니다
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onHint}
                className="flex-1 rounded-lg transition-colors"
                style={{
                  height: 40,
                  border: '1px solid #E5E8EC',
                  backgroundColor: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#16181D',
                }}
              >
                힌트 보기
              </button>
              <button
                onClick={onRetry}
                className="flex-1 rounded-lg text-white transition-colors"
                style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
              >
                다시 풀기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
