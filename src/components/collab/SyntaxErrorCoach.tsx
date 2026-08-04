'use client';

import { CornerDownRight, Sparkles } from 'lucide-react';
import { buildErrorFocus } from '@/lib/pyodide/errorFocus';
import type { PythonExecutionError, SyntaxLesson } from '@/lib/pyodide/pythonError';

/* 색은 두 가지만 쓴다 — 호박색은 "여기가 문제", 초록은 "이렇게 쓰면 돼요".
   나머지는 회색조로 두어 학생의 눈이 그 두 곳으로만 가게 한다.
   카드로 띄우지 않고 에디터(#1E1E1E) 위에 그대로 얹어 편집기의 일부처럼 보이게 한다. */
const LOCATE = '#E8A33D';
const CORRECT = '#6A9955';
const INK = '#D4D4D4';
const INK_DIM = '#8A93A2';
const RULE = '#2A303B';
const WELL = '#14171D';
/** 오류 줄의 옅은 호박색 강조를 WELL 위에 미리 합성한 값 — 고정된 줄번호 칸이
    가로 스크롤 때 뒤 코드를 비치지 않게 하려면 불투명해야 한다. */
const WELL_ERROR = '#272420';

/* 코드용 서체는 코드에만 쓴다. Fira Code에는 한글 글리프가 없어서
   한글 라벨에 쓰면 대체 서체로 떨어진다. */
const MONO = "'Fira Code', Consolas, monospace";
const CODE_TEXT = { fontFamily: MONO, fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre' } as const;
const LABEL = { fontSize: 11, fontWeight: 700, color: INK_DIM, letterSpacing: '0.01em' } as const;

export function SyntaxErrorCoach({
  lesson,
  error,
  code,
  attemptCount,
  aiEnabled,
  aiLoading,
  aiExplanation,
  aiError,
  onAskAi,
  onFocusLine,
}: {
  lesson: SyntaxLesson;
  error: PythonExecutionError;
  code: string;
  attemptCount: number;
  aiEnabled: boolean;
  aiLoading: boolean;
  aiExplanation: string | null;
  aiError: string | null;
  onAskAi: () => void;
  onFocusLine?: (line: number, column: number) => void;
}) {
  const canAskAi = attemptCount >= 3;
  const focus = buildErrorFocus(code, error.line, error.offset);
  const gutterWidth = focus
    ? `${String(focus.lines[focus.lines.length - 1].no).length + 1}ch`
    : '2ch';

  return (
    <section
      aria-label="파이썬 오류 코치"
      style={{ color: INK, fontFamily: 'Pretendard, sans-serif', fontSize: 13, lineHeight: 1.75 }}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {focus && (
          <LocationChip
            lineNo={focus.lineNo}
            column={focus.caretColumn === null ? null : focus.caretColumn + 1}
            onClick={onFocusLine
              ? () => onFocusLine(focus.lineNo, (focus.caretColumn ?? 0) + 1)
              : undefined}
          />
        )}
        <h3 style={{ margin: 0, color: '#F1F3F6', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {lesson.title}
        </h3>
      </header>

      <div
        className="mt-3.5 grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        style={{ borderTop: `1px solid ${RULE}`, paddingTop: 14 }}
      >
        <div className="min-w-0">
          {focus && (
            <>
              <div style={LABEL}>내 코드</div>
              <div
                className="mt-1.5 overflow-x-auto rounded-md"
                style={{ backgroundColor: WELL, border: `1px solid ${RULE}`, padding: '8px 0' }}
              >
                {focus.lines.map((line) => (
                  <div key={line.no}>
                    <div
                      className="flex"
                      style={{ backgroundColor: line.isError ? WELL_ERROR : WELL }}
                    >
                      <span
                        aria-hidden="true"
                        className="sticky left-0 shrink-0 select-none pr-3 pl-3 text-right"
                        style={{
                          ...CODE_TEXT,
                          width: gutterWidth,
                          boxSizing: 'content-box',
                          backgroundColor: line.isError ? WELL_ERROR : WELL,
                          color: line.isError ? LOCATE : INK_DIM,
                        }}
                      >
                        {line.no}
                      </span>
                      <pre style={{ ...CODE_TEXT, margin: 0, paddingRight: 12, color: line.isError ? INK : INK_DIM }}>
                        {line.text || ' '}
                      </pre>
                    </div>
                    {line.isError && focus.caretColumn !== null && (
                      <div className="flex" aria-hidden="true" style={{ backgroundColor: WELL }}>
                        <span
                          className="sticky left-0 shrink-0 pr-3 pl-3"
                          style={{ ...CODE_TEXT, width: gutterWidth, boxSizing: 'content-box', backgroundColor: WELL }}
                        />
                        <pre style={{ ...CODE_TEXT, margin: 0, color: LOCATE }}>
                          {`${' '.repeat(focus.caretColumn)}^`}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          <p style={{ margin: focus ? '7px 0 0' : 0, color: INK_DIM, fontSize: 12 }}>{lesson.where}</p>

          <div className="mt-4" style={{ ...LABEL, color: CORRECT }}>이렇게 쓰면 돼요</div>
          <pre
            className="mt-1.5 overflow-x-auto rounded-md"
            style={{
              ...CODE_TEXT,
              margin: 0,
              padding: '9px 12px',
              backgroundColor: WELL,
              borderLeft: `2px solid ${CORRECT}`,
              color: INK,
            }}
          >
            {lesson.example}
          </pre>
        </div>

        <div className="min-w-0">
          <div style={LABEL}>왜 이런 일이 생겼나요</div>
          <p style={{ margin: '6px 0 0' }}>{lesson.whatHappened}</p>
          <p style={{ margin: '8px 0 0', color: INK_DIM }}>{lesson.why}</p>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3"
        style={{ borderTop: `1px solid ${RULE}`, paddingTop: 12 }}
      >
        <p className="flex min-w-0 items-start gap-2" style={{ margin: 0, flex: '1 1 320px' }}>
          <CornerDownRight size={15} className="mt-1 shrink-0" style={{ color: LOCATE }} />
          <span>{lesson.nextStep}</span>
        </p>

        {aiEnabled && !aiExplanation && (
          <AskAiButton
            canAskAi={canAskAi}
            aiLoading={aiLoading}
            attemptCount={attemptCount}
            onAskAi={onAskAi}
          />
        )}
      </div>

      {aiEnabled && aiExplanation && (
        <div
          role="status"
          className="mt-3 rounded-md"
          style={{ padding: '11px 13px', backgroundColor: WELL, border: `1px solid ${RULE}` }}
        >
          <div className="mb-1.5 flex items-center gap-1.5" style={{ ...LABEL, color: 'var(--color-primary)' }}>
            <Sparkles size={13} />
            AI 선생님 설명
          </div>
          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{aiExplanation}</p>
        </div>
      )}

      {aiError && (
        <p role="alert" style={{ margin: '8px 0 0', color: '#E88A8A', fontSize: 12 }}>
          {aiError}
        </p>
      )}
    </section>
  );
}

/** 오류 위치. 누르면 에디터의 그 자리로 커서를 옮긴다. */
function LocationChip({
  lineNo,
  column,
  onClick,
}: {
  lineNo: number;
  column: number | null;
  onClick?: () => void;
}) {
  const text = column === null ? `${lineNo}줄` : `${lineNo}:${column}`;
  const chip = {
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: 'rgba(232, 168, 61, 0.13)',
    border: '1px solid rgba(232, 168, 61, 0.4)',
    color: LOCATE,
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 600,
  } as const;

  if (!onClick) return <span style={chip}>{text}</span>;

  return (
    <button
      type="button"
      onClick={onClick}
      title="에디터에서 이 자리로 이동"
      className="shrink-0 transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
      style={chip}
    >
      {text}
    </button>
  );
}

/**
 * 버튼은 눌렀을 때 일어나는 일만 말한다. 아직 열리지 않았다면 남은 횟수는
 * 버튼 라벨이 아니라 옆의 안내가 알려준다.
 */
function AskAiButton({
  canAskAi,
  aiLoading,
  attemptCount,
  onAskAi,
}: {
  canAskAi: boolean;
  aiLoading: boolean;
  attemptCount: number;
  onAskAi: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      {!canAskAi && (
        <span style={{ color: INK_DIM, fontSize: 11.5 }}>
          {`직접 ${Math.max(1, 3 - attemptCount)}번 더 고쳐본 뒤에 열려요`}
        </span>
      )}
      <button
        type="button"
        disabled={!canAskAi || aiLoading}
        onClick={onAskAi}
        className="flex items-center gap-1.5 rounded-md transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
        style={{
          height: 32,
          padding: '0 13px',
          border: `1px solid ${canAskAi ? 'var(--color-primary)' : RULE}`,
          backgroundColor: canAskAi ? 'var(--color-primary)' : 'transparent',
          color: canAskAi ? '#FFFFFF' : INK_DIM,
          fontSize: 12,
          fontWeight: 650,
          whiteSpace: 'nowrap',
        }}
      >
        <Sparkles size={13} />
        {aiLoading ? '설명 준비 중' : 'AI 선생님께 묻기'}
      </button>
    </div>
  );
}
