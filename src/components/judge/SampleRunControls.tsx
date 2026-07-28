import { LoaderCircle, Play } from 'lucide-react';

export function SampleRunControls({
  sampleCount,
  activeSampleIndex,
  disabled,
  onRun,
}: {
  sampleCount: number;
  activeSampleIndex: number | null;
  disabled: boolean;
  onRun: (sampleIndex: number) => void;
}) {
  if (sampleCount === 0) return null;

  return (
    <div
      role="group"
      className="flex min-w-0 items-center gap-2 overflow-x-auto px-2"
      aria-label="테스트 케이스"
    >
      {Array.from({ length: Math.min(sampleCount, 5) }, (_, sampleIndex) => {
        const sampleNumber = sampleIndex + 1;
        const active = activeSampleIndex === sampleIndex;
        return (
          <button
            key={sampleNumber}
            type="button"
            onClick={() => onRun(sampleIndex)}
            disabled={disabled}
            aria-label={`테스트 ${sampleNumber} 실행${active ? ' 중' : ''}`}
            aria-busy={active}
            className="flex shrink-0 items-center justify-center gap-1 rounded-md px-2 transition-[background-color,border-color,box-shadow,opacity] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1 focus-visible:ring-offset-[#1E1E1E] disabled:cursor-not-allowed"
            style={{
              minWidth: 72,
              height: 28,
              border: active ? '1px solid #93C5FD' : '1px solid #3B82F6',
              backgroundColor: active ? '#174EA6' : '#1B64DA',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 600,
              lineHeight: 1,
              boxShadow: active ? '0 0 0 2px rgba(59, 130, 246, 0.24)' : 'none',
              opacity: disabled && !active ? 0.45 : 1,
            }}
          >
            {active
              ? <LoaderCircle size={11} className="block shrink-0 animate-spin motion-reduce:animate-none" />
              : <Play size={10} className="block shrink-0" fill="currentColor" />}
            <span className="block leading-none">테스트 {sampleNumber}</span>
          </button>
        );
      })}
    </div>
  );
}
