'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

/**
 * One worked example.
 *
 * Copy only. Running a sample lives in the terminal toolbar, because that is
 * where its output appears — a control and its result in the same region is the
 * shorter loop, and duplicating it here would leave two buttons needing to be
 * explained to each other.
 */
export function ExampleCard({
  index,
  testCase,
}: {
  index: number;
  testCase: LearnSampleTestCase;
}) {
  const { t } = useLayoutTranslation('learn');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(testCase.input);
      setCopied(true);
    } catch {
      // Denied clipboard permission, or an insecure origin. The input is still
      // on screen to retype; a failed copy is not worth an error state.
    }
  };

  return (
    <article className="rounded-lg border border-border p-4">
      <header className="mb-3">
        <h4 className="text-[13.5px] font-bold">
          {t('workspace.example_n', { number: index + 1 })}
        </h4>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ValueBlock
          action={
            <button
              aria-label={
                copied ? t('workspace.copied') : t('workspace.copy_input')
              }
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[#94a3b8] transition-colors hover:bg-white/10 hover:text-white"
              onClick={() => void copy()}
              title={
                copied ? t('workspace.copied') : t('workspace.copy_input')
              }
              type="button"
            >
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          }
          label={t('workspace.stdin')}
          value={testCase.input}
        />
        <ValueBlock
          label={t('workspace.stdout')}
          value={testCase.expectedOutput}
        />
      </div>
    </article>
  );
}

/** Literal values a student can copy: dark, monospaced, unmistakably data. */
function ValueBlock({
  action,
  label,
  value,
}: {
  action?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 font-mono text-[11.5px] font-bold uppercase tracking-wider text-sub">
        {label}
      </div>
      <div className="relative">
        <pre
          className={`overflow-x-auto rounded-lg bg-[#0f172a] py-2.5 pl-3 font-mono text-[13px] leading-[1.6] text-[#e2e8f0] ${
            action ? 'pr-11' : 'pr-3'
          }`}
        >
          {value || ' '}
        </pre>
        {action}
      </div>
    </div>
  );
}
