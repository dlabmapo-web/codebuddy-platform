'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';

export type SubmissionCaseResult = {
  case_no: number;
  visibility: 'sample' | 'hidden';
  outcome:
    | 'accepted'
    | 'wrong_answer'
    | 'time_limit_exceeded'
    | 'compilation_error'
    | 'runtime_error'
    | 'judge_error'
    | null;
};

export type SubmissionResult = {
  status: 'judging' | 'pass' | 'fail' | 'partial' | 'judge_error';
  score: number;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  elapsedSec: number;
  attemptNo: number;
  cases: SubmissionCaseResult[];
};

type Props = {
  result: SubmissionResult;
  onClose: () => void;
  onRetry: () => void;
  onHint: () => void;
  aiFeedbackEnabled: boolean;
  aiFeedbackLoading: boolean;
  aiFeedbackContent: string | null;
  nextProblemId: string | null;
  stageId: string | null;
};

const OUTCOME = {
  accepted: { label: '통과', detail: '정답', color: '#34D399', bg: 'rgba(52, 211, 153, 0.12)' },
  wrong_answer: { label: '실패', detail: '출력이 달라요', color: '#FB7185', bg: 'rgba(251, 113, 133, 0.12)' },
  time_limit_exceeded: { label: '시간 초과', detail: '실행 시간을 줄여보세요', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)' },
  compilation_error: { label: '실행 불가', detail: '문법을 확인해보세요', color: '#FB7185', bg: 'rgba(251, 113, 133, 0.12)' },
  runtime_error: { label: '실행 오류', detail: '예외가 발생했어요', color: '#FB7185', bg: 'rgba(251, 113, 133, 0.12)' },
  judge_error: { label: '채점 오류', detail: '다시 시도해주세요', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' },
} as const;

function formatSolveTime(seconds: number) {
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

function statusCopy(result: SubmissionResult) {
  if (result.status === 'judging') {
    return {
      eyebrow: '공식 제출',
      title: '테스트를 확인하고 있어요',
      description: '예시와 비공개 테스트를 안전한 채점 환경에서 실행 중입니다.',
      color: '#93C5FD',
    };
  }
  if (result.status === 'pass') {
    return {
      eyebrow: `${result.attemptNo}번째 제출`,
      title: '모든 테스트를 통과했어요',
      description: '좋아요. 이 문제의 모든 조건을 만족했습니다.',
      color: '#34D399',
    };
  }
  if (result.status === 'partial') {
    return {
      eyebrow: `${result.attemptNo}번째 제출`,
      title: '거의 다 왔어요',
      description: '통과하지 못한 조건을 찾아 코드를 조금 더 다듬어보세요.',
      color: '#FBBF24',
    };
  }
  if (result.status === 'judge_error') {
    return {
      eyebrow: '공식 제출',
      title: '채점 결과를 만들지 못했어요',
      description: '이 제출은 오답으로 기록되지 않았습니다. 잠시 후 다시 시도해주세요.',
      color: '#CBD5E1',
    };
  }
  return {
    eyebrow: `${result.attemptNo}번째 제출`,
    title: '다시 확인해볼까요?',
    description: '입력 처리와 출력 형식을 차근차근 확인해보세요.',
    color: '#FB7185',
  };
}

export function SubmissionResultDrawer({
  result,
  onClose,
  onRetry,
  onHint,
  aiFeedbackEnabled,
  aiFeedbackLoading,
  aiFeedbackContent,
  nextProblemId,
  stageId,
}: Props) {
  const copy = statusCopy(result);
  const isJudging = result.status === 'judging';
  const isPass = result.status === 'pass';
  const isJudgeError = result.status === 'judge_error';
  const showAi = !isJudging && !isPass && !isJudgeError && aiFeedbackEnabled;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="채점 결과"
      data-testid="submission-result-drawer"
      className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none"
      style={{
        background: 'linear-gradient(180deg, #202532 0%, #171A23 100%)',
        borderLeft: '1px solid #303746',
        boxShadow: '-18px 0 48px rgba(5, 8, 15, 0.34)',
        color: '#F8FAFC',
      }}
    >
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #303746' }}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: copy.color, boxShadow: `0 0 12px ${copy.color}` }} />
          <span style={{ fontSize: 12, fontWeight: 750, letterSpacing: '0.02em', color: '#CBD5E1' }}>채점 결과</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="채점 결과 닫기"
          className="flex items-center justify-center rounded-xl transition-colors hover:bg-white/10"
          style={{ width: 34, height: 34, color: '#94A3B8' }}
        >
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${copy.color}18`, border: `1px solid ${copy.color}45` }}
          >
            {isJudging
              ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={26} style={{ color: copy.color }} />
              : isPass
                ? <CheckCircle2 size={28} style={{ color: copy.color }} />
                : isJudgeError
                  ? <AlertTriangle size={27} style={{ color: copy.color }} />
                  : <XCircle size={27} style={{ color: copy.color }} />}
          </div>
          <div className="min-w-0 pt-0.5">
            <div style={{ fontSize: 10, fontWeight: 750, letterSpacing: '0.08em', color: copy.color, textTransform: 'uppercase' }}>
              {copy.eyebrow}
            </div>
            <h2 style={{ marginTop: 3, fontSize: 20, lineHeight: 1.25, fontWeight: 800 }}>{copy.title}</h2>
            <p style={{ marginTop: 5, fontSize: 12, lineHeight: 1.6, color: '#94A3B8' }}>{copy.description}</p>
          </div>
        </div>

        {isJudging ? (
          <div className="mt-7">
            <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: '#303746' }}>
              <div className="h-full w-2/5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: 'linear-gradient(90deg, #5B8DEF, #93C5FD)' }} />
            </div>
            <div className="mt-3 flex items-center justify-between" style={{ fontSize: 11, color: '#8490A5' }}>
              <span>코드를 여러 입력으로 실행 중</span>
              <span>{result.totalCount}개 테스트</span>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-[1.2fr_1fr_1fr] gap-2">
              <div
                data-testid="submission-score"
                className="rounded-2xl p-3.5"
                style={{ backgroundColor: `${copy.color}12`, border: `1px solid ${copy.color}35` }}
              >
                <div style={{ fontSize: 10, color: '#94A3B8' }}>점수</div>
                <div className="mt-1 flex items-end gap-1">
                  <strong style={{ fontSize: 27, lineHeight: 1, color: copy.color }}>{isJudgeError ? '—' : result.score}</strong>
                  <span style={{ fontSize: 11, color: '#8490A5' }}>/ 100</span>
                </div>
              </div>
              <div className="rounded-2xl p-3.5" style={{ backgroundColor: '#202532', border: '1px solid #303746' }}>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>통과</div>
                <div style={{ marginTop: 5, fontSize: 16, fontWeight: 750 }}>{result.passedCount} / {result.totalCount}</div>
              </div>
              <div className="rounded-2xl p-3.5" style={{ backgroundColor: '#202532', border: '1px solid #303746' }}>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>실행 시간</div>
                <div style={{ marginTop: 5, fontSize: 16, fontWeight: 750 }}>{result.runtimeMs}ms</div>
              </div>
            </div>

            {!isJudgeError && result.cases.length > 0 && (
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 style={{ fontSize: 12, fontWeight: 750, color: '#E2E8F0' }}>테스트별 결과</h3>
                  <span style={{ fontSize: 10, color: '#7F8A9E' }}>풀이 시간 {formatSolveTime(result.elapsedSec)}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {result.cases.map((testCase) => {
                    const outcome = testCase.outcome ? OUTCOME[testCase.outcome] : OUTCOME.judge_error;
                    const accepted = testCase.outcome === 'accepted';
                    return (
                      <div
                        key={testCase.case_no}
                        data-testid={`submission-case-${testCase.case_no}`}
                        className="flex items-center gap-3 rounded-2xl px-3 py-3"
                        style={{ backgroundColor: '#202532', border: '1px solid #303746' }}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: outcome.bg, color: outcome.color }}
                        >
                          {accepted ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>테스트 {testCase.case_no}</span>
                          <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: '#8490A5' }}>{outcome.detail}</span>
                        </span>
                        <span className="flex items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: '#292F3D', fontSize: 9, color: '#A7B0C2' }}>
                          {testCase.visibility === 'sample' ? <Eye size={10} /> : <EyeOff size={10} />}
                          {testCase.visibility === 'sample' ? '예시' : '비공개'}
                        </span>
                        <strong style={{ minWidth: 44, textAlign: 'right', fontSize: 10, color: outcome.color }}>{outcome.label}</strong>
                      </div>
                    );
                  })}
                </div>
                {result.cases.some((testCase) => testCase.visibility === 'hidden') && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: '#1D2635', border: '1px solid #2D3A4E' }}>
                    <EyeOff size={13} style={{ marginTop: 1, flexShrink: 0, color: '#8DA3C7' }} />
                    <p style={{ fontSize: 10, lineHeight: 1.55, color: '#8DA3C7' }}>
                      비공개 테스트의 입력과 정답은 공개되지 않아요. 경계값과 예외 상황을 확인해보세요.
                    </p>
                  </div>
                )}
              </section>
            )}

            {showAi && (
              <section className="mt-5 rounded-2xl p-4" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(129, 140, 248, 0.28)' }}>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles size={14} style={{ color: '#A5B4FC' }} />
                  <h3 style={{ fontSize: 11, fontWeight: 750, color: '#C7D2FE' }}>AI 피드백</h3>
                </div>
                {aiFeedbackContent ? (
                  <p style={{ whiteSpace: 'pre-line', fontSize: 11, lineHeight: 1.65, color: '#C7D2FE' }}>{aiFeedbackContent}</p>
                ) : (
                  <div className="flex items-center gap-2" style={{ fontSize: 11, color: '#A5B4FC' }}>
                    <LoaderCircle size={13} className={aiFeedbackLoading ? 'animate-spin motion-reduce:animate-none' : ''} />
                    코드를 분석하고 있어요...
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 px-5 py-4" style={{ borderTop: '1px solid #303746', backgroundColor: '#171A23' }}>
        {isJudging ? (
          <>
            <button type="button" onClick={onClose} className="col-span-2 rounded-xl" style={{ height: 44, border: '1px solid #394153', color: '#CBD5E1', fontSize: 13, fontWeight: 700 }}>
              닫고 계속 코딩하기
            </button>
          </>
        ) : isPass ? (
          <>
            <button type="button" onClick={onClose} className="rounded-xl" style={{ height: 44, border: '1px solid #394153', color: '#CBD5E1', fontSize: 13, fontWeight: 700 }}>
              결과 닫기
            </button>
            <Link
              href={nextProblemId ? `/problems/${nextProblemId}` : stageId ? `/problems?stage=${stageId}` : '/problems'}
              className="flex items-center justify-center gap-1 rounded-xl text-white"
              style={{ height: 44, backgroundColor: 'var(--color-primary)', fontSize: 13, fontWeight: 750 }}
            >
              {nextProblemId ? '다음 문제' : '문제 목록'} <ChevronRight size={14} />
            </Link>
          </>
        ) : (
          <>
            {!isJudgeError && (
              <button type="button" onClick={onHint} className="flex items-center justify-center gap-1.5 rounded-xl" style={{ height: 44, border: '1px solid #394153', color: '#CBD5E1', fontSize: 13, fontWeight: 700 }}>
                <Lightbulb size={14} /> 힌트 보기
              </button>
            )}
            <button type="button" onClick={onRetry} className={`flex items-center justify-center gap-1.5 rounded-xl text-white ${isJudgeError ? 'col-span-2' : ''}`} style={{ height: 44, backgroundColor: 'var(--color-primary)', fontSize: 13, fontWeight: 750 }}>
              <RotateCcw size={14} /> {isJudgeError ? '다시 제출하기' : '코드 수정하기'}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
