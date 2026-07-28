'use client';

import { memo } from 'react';
import { SampleInputCopyButton } from '@/components/judge/SampleInputCopyButton';
import type { DbProblem, DbTestCase } from '@/lib/types/db';

export type PublicProblemStatementProblem = Pick<
  DbProblem,
  | 'description'
  | 'input_format'
  | 'output_format'
  | 'constraint_text'
  | 'time_limit_ms'
>;

export type PublicProblemSample = Pick<
  DbTestCase,
  'id' | 'input' | 'expected_output' | 'order_no'
>;

type PublicProblemStatementProps = {
  problem: PublicProblemStatementProblem;
  samples: PublicProblemSample[];
};

export const PublicProblemStatement = memo(function PublicProblemStatement({
  problem,
  samples,
}: PublicProblemStatementProps) {
  return (
    <div className="p-5">
      <div
        className="mb-5 flex gap-5 pb-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div>
          <span
            style={{
              color: 'var(--color-sub)',
              display: 'block',
              fontSize: 11,
            }}
          >
            실행 제한
          </span>
          <span
            style={{
              color: 'var(--color-ink)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {problem.time_limit_ms / 1000}초
          </span>
        </div>
        <div>
          <span
            style={{
              color: 'var(--color-sub)',
              display: 'block',
              fontSize: 11,
            }}
          >
            언어
          </span>
          <span
            style={{
              color: 'var(--color-ink)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Python 3
          </span>
        </div>
      </div>

      <h3
        style={{
          color: 'var(--color-ink)',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        문제
      </h3>
      <div
        className="tiptap-render"
        style={{
          color: 'var(--color-ink)',
          fontSize: 14,
          lineHeight: 1.75,
          marginBottom: 20,
        }}
        dangerouslySetInnerHTML={{ __html: problem.description }}
      />

      {problem.input_format && (
        <>
          <h3
            style={{
              color: 'var(--color-ink)',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            입력
          </h3>
          <p
            style={{
              color: 'var(--color-sub)',
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            {problem.input_format}
          </p>
        </>
      )}

      {problem.output_format && (
        <>
          <h3
            style={{
              color: 'var(--color-ink)',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            출력
          </h3>
          <p
            style={{
              color: 'var(--color-sub)',
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {problem.output_format}
          </p>
        </>
      )}

      {samples.length > 0 && (
        <>
          <h3
            style={{
              color: 'var(--color-ink)',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            예제
          </h3>
          <div className="mb-5 flex flex-col gap-4">
            {samples.map((sample, index) => (
              <div
                key={sample.id}
                className="grid gap-3"
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                }}
              >
                {sample.input && (
                  <div className="min-w-0 flex-1">
                    <div
                      style={{
                        color: 'var(--color-sub)',
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      예제 입력 {index + 1}
                    </div>
                    <div
                      className="relative rounded-lg"
                      style={{
                        backgroundColor: 'var(--code-bg)',
                        border: '1px solid var(--code-border)',
                        position: 'relative',
                      }}
                    >
                      <div
                        className="overflow-x-auto p-3 pr-24"
                        style={{
                          color: 'var(--code-fg)',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          whiteSpace: 'pre',
                        }}
                      >
                        {sample.input}
                      </div>
                      <SampleInputCopyButton
                        input={sample.input}
                        sampleNumber={index + 1}
                      />
                    </div>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    style={{
                      color: 'var(--color-sub)',
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    예제 출력 {index + 1}
                  </div>
                  <div
                    className="overflow-x-auto rounded-lg p-3"
                    style={{
                      backgroundColor: 'var(--code-bg)',
                      border: '1px solid var(--code-border)',
                      color: 'var(--code-fg)',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      whiteSpace: 'pre',
                    }}
                  >
                    {sample.expected_output}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {problem.constraint_text && (
        <>
          <h3
            style={{
              color: 'var(--color-ink)',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            제약 조건
          </h3>
          <ul className="flex flex-col gap-1.5">
            {problem.constraint_text
              .split('\n')
              .filter(Boolean)
              .map((constraint, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span
                    style={{
                      backgroundColor: 'var(--color-sub)',
                      borderRadius: 99,
                      display: 'inline-block',
                      flexShrink: 0,
                      height: 4,
                      marginTop: 6,
                      width: 4,
                    }}
                  />
                  <span
                    style={{
                      color: 'var(--color-sub)',
                      fontFamily: 'monospace',
                      fontSize: 13,
                    }}
                  >
                    {constraint.replace(/^[•·\-]\s*/, '')}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
});
