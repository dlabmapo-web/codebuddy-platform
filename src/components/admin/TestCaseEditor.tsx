'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';

export type TestCaseDraft = {
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
};

type Props = {
  value: TestCaseDraft[];
  onChange: (testCases: TestCaseDraft[]) => void;
  /** 문제에서 입력 형식을 선언했는지 여부 */
  requiresInput?: boolean;
};

function withOrder(testCases: TestCaseDraft[]) {
  return testCases.map((testCase, index) => ({
    ...testCase,
    order_no: index + 1,
  }));
}

function caseError(testCase: TestCaseDraft, requiresInput: boolean) {
  if (requiresInput && testCase.input === '') return '표준 입력값을 입력해주세요.';
  if (!testCase.expected_output.trim()) return '기대 출력값을 입력해주세요.';
  if (testCase.is_sample === testCase.is_hidden) return '공개 방식을 하나만 선택해주세요.';
  return null;
}

export function TestCaseEditor({ value, onChange, requiresInput = false }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = value.length === 0
    ? 0
    : Math.min(selectedIndex, value.length - 1);

  const summary = useMemo(() => ({
    sample: value.filter((testCase) => testCase.is_sample).length,
    hidden: value.filter((testCase) => testCase.is_hidden).length,
    invalid: value.filter((testCase) => caseError(testCase, requiresInput)).length,
  }), [requiresInput, value]);

  const selected = value[activeIndex];
  const approximatePoints = value.length > 0
    ? Math.round(100 / value.length)
    : 0;
  const inputMissing = Boolean(selected && requiresInput && selected.input === '');

  const replaceSelected = (patch: Partial<TestCaseDraft>) => {
    onChange(value.map((testCase, index) => (
      index === activeIndex ? { ...testCase, ...patch } : testCase
    )));
  };

  const addCase = () => {
    const next = withOrder([
      ...value,
      {
        input: '',
        expected_output: '',
        is_sample: false,
        is_hidden: true,
        order_no: value.length + 1,
      },
    ]);
    onChange(next);
    setSelectedIndex(next.length - 1);
  };

  const duplicateCase = () => {
    if (!selected) return;
    const next = withOrder([
      ...value.slice(0, activeIndex + 1),
      { ...selected },
      ...value.slice(activeIndex + 1),
    ]);
    onChange(next);
    setSelectedIndex(activeIndex + 1);
  };

  const removeCase = () => {
    if (!selected) return;
    const next = withOrder(value.filter((_, index) => index !== activeIndex));
    onChange(next);
    setSelectedIndex(Math.max(0, activeIndex - 1));
  };

  const moveCase = (direction: -1 | 1) => {
    const target = activeIndex + direction;
    if (!selected || target < 0 || target >= value.length) return;
    const next = [...value];
    [next[activeIndex], next[target]] = [next[target], next[activeIndex]];
    onChange(withOrder(next));
    setSelectedIndex(target);
  };

  return (
    <div data-testid="test-case-editor" className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '전체', value: value.length, color: 'var(--color-ink)' },
          { label: '예시 공개', value: summary.sample, color: 'var(--color-primary)' },
          { label: '비공개', value: summary.hidden, color: 'var(--color-sub)' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl px-3 py-2.5"
            style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <div style={{ fontSize: 11, color: 'var(--color-sub)' }}>{item.label}</div>
            <div style={{ marginTop: 2, fontSize: 18, lineHeight: 1, fontWeight: 750, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {summary.invalid > 0 && (
        <div
          role="alert"
          className="rounded-xl px-3 py-2.5"
          style={{ backgroundColor: 'var(--tint-danger)', border: '1px solid var(--tint-danger-line)', color: '#DC2626', fontSize: 12 }}
        >
          저장하기 전에 {summary.invalid}개 테스트케이스를 확인해주세요.
        </div>
      )}

      {value.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl px-6 py-10 text-center"
          style={{ border: '1px dashed var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          <EyeOff size={28} style={{ color: 'var(--color-sub)' }} />
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>
            아직 테스트케이스가 없습니다
          </div>
          <p style={{ marginTop: 4, maxWidth: 320, fontSize: 12, lineHeight: 1.6, color: 'var(--color-sub)' }}>
            첫 테스트는 비공개로 생성됩니다. 학생에게 보여줄 예시는 공개 방식으로 바꿀 수 있어요.
          </p>
          <button
            type="button"
            onClick={addCase}
            className="mt-4 flex items-center gap-1.5 rounded-xl px-4 text-white"
            style={{ height: 38, backgroundColor: 'var(--color-primary)', fontSize: 13, fontWeight: 700 }}
          >
            <Plus size={14} /> 첫 테스트 추가
          </button>
        </div>
      ) : (
        <div
          className="grid overflow-hidden rounded-2xl"
          style={{ gridTemplateColumns: 'minmax(132px, 0.34fr) minmax(0, 1fr)', border: '1px solid var(--color-border)' }}
        >
          <div style={{ backgroundColor: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-sub)' }}>케이스 목록</span>
              <button
                type="button"
                onClick={addCase}
                aria-label="테스트케이스 추가"
                className="flex items-center justify-center rounded-lg"
                style={{ width: 26, height: 26, backgroundColor: 'var(--tint-soft)', color: 'var(--color-primary)' }}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1 p-2">
              {value.map((testCase, index) => {
                const error = caseError(testCase, requiresInput);
                const active = index === activeIndex;
                return (
                  <button
                    type="button"
                    key={`${testCase.order_no}-${index}`}
                    data-testid={`test-case-nav-${index + 1}`}
                    onClick={() => setSelectedIndex(index)}
                    className="flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--tint-soft)' : 'transparent',
                      border: active ? '1px solid var(--tint-accent-line)' : '1px solid transparent',
                    }}
                  >
                    <span
                      className="flex shrink-0 items-center justify-center rounded-lg"
                      style={{
                        width: 26,
                        height: 26,
                        backgroundColor: active ? 'var(--color-primary)' : 'var(--color-card)',
                        color: active ? 'white' : 'var(--color-sub)',
                        border: active ? 'none' : '1px solid var(--color-border)',
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontSize: 11, fontWeight: 650, color: 'var(--color-ink)' }}>
                        테스트 {index + 1}
                      </span>
                      <span style={{ display: 'block', marginTop: 1, fontSize: 9, color: error ? '#DC2626' : 'var(--color-sub)' }}>
                        {error ? '확인 필요' : testCase.is_sample ? '예시 공개' : '비공개'}
                      </span>
                    </span>
                    {error
                      ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#DC2626' }} />
                      : <CheckCircle2 size={12} style={{ color: '#16A34A', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="min-w-0 p-4" style={{ backgroundColor: 'var(--color-card)' }}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--color-ink)' }}>
                    테스트 {activeIndex + 1}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: 'var(--color-sub)' }}>
                    자동 배점 약 {approximatePoints}점 · 최종 점수는 통과 비율로 계산
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveCase(-1)} disabled={activeIndex === 0} aria-label="테스트 위로 이동" className="flex items-center justify-center rounded-lg disabled:opacity-30" style={{ width: 30, height: 30, border: '1px solid var(--color-border)', color: 'var(--color-sub)' }}><ArrowUp size={13} /></button>
                  <button type="button" onClick={() => moveCase(1)} disabled={activeIndex === value.length - 1} aria-label="테스트 아래로 이동" className="flex items-center justify-center rounded-lg disabled:opacity-30" style={{ width: 30, height: 30, border: '1px solid var(--color-border)', color: 'var(--color-sub)' }}><ArrowDown size={13} /></button>
                  <button type="button" onClick={duplicateCase} aria-label="테스트 복제" className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, border: '1px solid var(--color-border)', color: 'var(--color-sub)' }}><Copy size={13} /></button>
                  <button type="button" onClick={removeCase} aria-label="테스트 삭제" className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, border: '1px solid var(--tint-danger-line)', color: '#DC2626' }}><Trash2 size={13} /></button>
                </div>
              </div>

              <fieldset>
                <legend style={{ marginBottom: 7, fontSize: 11, fontWeight: 700, color: 'var(--color-sub)' }}>
                  공개 방식
                </legend>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={selected.is_sample}
                    onClick={() => replaceSelected({ is_sample: true, is_hidden: false })}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left"
                    style={{
                      border: selected.is_sample ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      backgroundColor: selected.is_sample ? 'var(--tint-soft)' : 'var(--color-surface)',
                    }}
                  >
                    <Eye size={15} style={{ color: selected.is_sample ? 'var(--color-primary)' : 'var(--color-sub)' }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>예시 공개</span>
                      <span style={{ display: 'block', marginTop: 1, fontSize: 9, color: 'var(--color-sub)' }}>문제 설명에 입출력 표시</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={selected.is_hidden}
                    onClick={() => replaceSelected({ is_sample: false, is_hidden: true })}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left"
                    style={{
                      border: selected.is_hidden ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      backgroundColor: selected.is_hidden ? 'var(--tint-soft)' : 'var(--color-surface)',
                    }}
                  >
                    <EyeOff size={15} style={{ color: selected.is_hidden ? 'var(--color-primary)' : 'var(--color-sub)' }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>비공개 채점</span>
                      <span style={{ display: 'block', marginTop: 1, fontSize: 9, color: 'var(--color-sub)' }}>학생에게 값 공개 안 함</span>
                    </span>
                  </button>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label>
                  <span style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--color-sub)' }}>
                    표준 입력 <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>(stdin)</span>
                  </span>
                  <textarea
                    data-testid="test-case-input"
                    className="w-full resize-y rounded-xl px-3 py-2.5 focus:outline-none"
                    style={{ minHeight: 116, border: '1px solid var(--color-border)', backgroundColor: 'var(--code-bg)', color: 'var(--code-fg)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55 }}
                    placeholder={'예) 2 3'}
                    value={selected.input}
                    onChange={(event) => replaceSelected({ input: event.target.value })}
                  />
                </label>
                <label>
                  <span style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--color-sub)' }}>
                    기대 출력 <span style={{ color: '#DC2626' }}>*</span> <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>(stdout)</span>
                  </span>
                  <textarea
                    data-testid="test-case-output"
                    aria-invalid={!selected.expected_output.trim()}
                    className="w-full resize-y rounded-xl px-3 py-2.5 focus:outline-none"
                    style={{ minHeight: 116, border: `1px solid ${selected.expected_output.trim() ? 'var(--color-border)' : '#F87171'}`, backgroundColor: 'var(--code-bg)', color: 'var(--code-fg)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55 }}
                    placeholder={'예) 5'}
                    value={selected.expected_output}
                    onChange={(event) => replaceSelected({ expected_output: event.target.value })}
                  />
                  {!selected.expected_output.trim() && (
                    <span style={{ display: 'block', marginTop: 5, fontSize: 10, color: '#DC2626' }}>
                      기대 출력값을 입력해주세요.
                    </span>
                  )}
                </label>
              </div>

              {inputMissing && (
                <div
                  role="alert"
                  data-testid="test-case-input-warning"
                  className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: 'var(--tint-danger)', border: '1px solid var(--tint-danger-line)' }}
                >
                  <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0, color: '#DC2626' }} />
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-ink)' }}>
                    이 문제는 입력 형식을 사용하지만 표준 입력이 비어 있습니다. 예를 들어 두 수의 합 문제라면 <code>3 5</code>처럼 실제 채점값을 입력해주세요.
                  </p>
                </div>
              )}

              <div
                className="mt-3 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: 'var(--tint-soft)', border: '1px solid var(--tint-line)' }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink)' }}>
                  입력과 출력 작성 규칙
                </div>
                <ul style={{ marginTop: 5, paddingLeft: 14, fontSize: 11, lineHeight: 1.7, color: 'var(--color-sub)', listStyle: 'disc' }}>
                  <li>
                    <code>input()</code> 한 번이 입력 한 줄을 읽습니다. <code>input()</code>이 두 번이면 입력도 두 줄로 적어주세요.
                  </li>
                  <li>
                    <code>input(&quot;이름: &quot;)</code>의 안내 문구는 화면에 출력되는 글자입니다. 기대 출력에 똑같이 포함해주세요.
                  </li>
                  <li>
                    학생이 입력한 값 자체는 출력에 남지 않습니다. 프로그램이 직접 출력할 때만 기대 출력에 넣어주세요.
                  </li>
                </ul>
                <div
                  className="mt-2.5 grid gap-2 sm:grid-cols-2"
                  style={{ fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.6 }}
                >
                  <div>
                    <div style={{ marginBottom: 3, fontFamily: 'inherit', color: 'var(--color-sub)' }}>코드</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', padding: '6px 8px', borderRadius: 6, backgroundColor: 'var(--code-bg)', color: 'var(--code-fg)' }}>
{`name = input("이름: ")
pw = input("비밀번호: ")
print(f"환영합니다, {name}")`}
                    </pre>
                  </div>
                  <div>
                    <div style={{ marginBottom: 3, color: 'var(--color-sub)' }}>표준 입력 / 기대 출력</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', padding: '6px 8px', borderRadius: 6, backgroundColor: 'var(--code-bg)', color: 'var(--code-fg)' }}>
{`철수
1234
---
이름: 비밀번호: 환영합니다, 철수`}
                    </pre>
                  </div>
                </div>
                <p style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.6, color: 'var(--color-sub)' }}>
                  안내 문구 두 개가 한 줄에 붙는 이유는 <code>input()</code>이 줄바꿈 없이 문구만 출력하기 때문입니다.
                  (<code>---</code> 윗줄이 표준 입력, 아랫줄이 기대 출력)
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
