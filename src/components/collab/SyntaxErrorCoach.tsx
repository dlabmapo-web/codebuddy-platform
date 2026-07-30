'use client';

import { BookOpen, CircleHelp, Lightbulb, MapPin, Sparkles } from 'lucide-react';
import type { SyntaxLesson } from '@/lib/pyodide/pythonError';

export function SyntaxErrorCoach({
  lesson,
  attemptCount,
  aiEnabled,
  aiLoading,
  aiExplanation,
  aiError,
  onAskAi,
}: {
  lesson: SyntaxLesson;
  attemptCount: number;
  aiEnabled: boolean;
  aiLoading: boolean;
  aiExplanation: string | null;
  aiError: string | null;
  onAskAi: () => void;
}) {
  const canAskAi = attemptCount >= 3;

  return (
    <section
      aria-label="파이썬 오류 코치"
      className="rounded-xl"
      style={{
        backgroundColor: '#172033',
        border: '1px solid #334155',
        color: '#E2E8F0',
        fontFamily: 'Pretendard, sans-serif',
        fontSize: 13,
        lineHeight: 1.7,
        padding: '14px 16px',
      }}
    >
      <div className="mb-3 flex items-start gap-2">
        <CircleHelp size={17} className="mt-0.5 shrink-0" style={{ color: '#93C5FD' }} />
        <div>
          <p style={{ margin: 0, color: '#93C5FD', fontSize: 12, fontWeight: 700 }}>
            오류 코치
          </p>
          <h3 style={{ margin: '2px 0 0', color: '#F8FAFC', fontSize: 15, fontWeight: 750 }}>
            {lesson.title}
          </h3>
        </div>
      </div>

      <div className="grid gap-3">
        <CoachSection icon={<CircleHelp size={14} />} title="무슨 일이 생겼나요?">
          {lesson.whatHappened}
        </CoachSection>
        <CoachSection icon={<BookOpen size={14} />} title="왜 필요한가요?">
          {lesson.why}
        </CoachSection>
        <CoachSection icon={<MapPin size={14} />} title="어디를 확인할까요?">
          {lesson.where}
        </CoachSection>
        <div>
          <div className="mb-1 flex items-center gap-1.5" style={{ color: '#A5B4FC', fontSize: 12, fontWeight: 700 }}>
            <Lightbulb size={14} />
            비슷한 예시
          </div>
          <pre
            className="overflow-x-auto rounded-lg"
            style={{
              margin: 0,
              padding: '9px 11px',
              backgroundColor: '#0F172A',
              border: '1px solid #293548',
              color: '#E2E8F0',
              fontFamily: "'Fira Code', Consolas, monospace",
              fontSize: 12,
              lineHeight: 1.65,
              whiteSpace: 'pre',
            }}
          >
            {lesson.example}
          </pre>
        </div>
        <div
          className="rounded-lg"
          style={{ padding: '9px 11px', backgroundColor: '#1E3A5F', color: '#DBEAFE' }}
        >
          <strong style={{ color: '#BFDBFE' }}>다음에 해볼 일: </strong>
          {lesson.nextStep}
        </div>
      </div>

      {aiEnabled && (
        <div className="mt-4" style={{ borderTop: '1px solid #334155', paddingTop: 12 }}>
          {aiExplanation ? (
            <div
              role="status"
              className="rounded-lg"
              style={{ padding: '10px 12px', backgroundColor: '#312E81', border: '1px solid #4F46E5' }}
            >
              <div className="mb-1 flex items-center gap-1.5" style={{ color: '#C7D2FE', fontSize: 12, fontWeight: 750 }}>
                <Sparkles size={14} />
                AI 선생님의 추가 설명
              </div>
              <p style={{ margin: 0, color: '#EEF2FF', whiteSpace: 'pre-line' }}>
                {aiExplanation}
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={!canAskAi || aiLoading}
                onClick={onAskAi}
                className="flex w-full items-center justify-center gap-2 rounded-lg disabled:cursor-not-allowed"
                style={{
                  minHeight: 38,
                  padding: '8px 12px',
                  border: `1px solid ${canAskAi ? '#6366F1' : '#475569'}`,
                  backgroundColor: canAskAi ? '#3730A3' : '#1E293B',
                  color: canAskAi ? '#EEF2FF' : '#94A3B8',
                  fontSize: 12,
                  fontWeight: 750,
                }}
              >
                <Sparkles size={14} />
                {aiLoading
                  ? 'AI 선생님이 한국어 설명을 준비하고 있어요...'
                  : canAskAi
                    ? 'AI에게 더 자세히 물어보기'
                    : `코드를 바꾸어 다시 실행해 보세요 (${attemptCount}/3)`}
              </button>
              {!canAskAi && (
                <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 11, textAlign: 'center' }}>
                  같은 종류의 오류를 세 번 해결하지 못하면 추가 도움을 받을 수 있어요.
                </p>
              )}
            </>
          )}
          {aiError && (
            <p role="alert" style={{ margin: '7px 0 0', color: '#FCA5A5', fontSize: 11 }}>
              {aiError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function CoachSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5" style={{ color: '#A5B4FC', fontSize: 12, fontWeight: 700 }}>
        {icon}
        {title}
      </div>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}
