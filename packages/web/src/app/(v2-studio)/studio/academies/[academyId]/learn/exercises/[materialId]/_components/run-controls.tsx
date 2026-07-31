'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import { LoaderCircle, Play, Square } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

export function RunControls({
  running,
  ready,
  sampleTestCases,
  activeSample,
  onRun,
  onRunSample,
  onStop,
}: {
  running: boolean;
  ready: boolean;
  sampleTestCases: LearnSampleTestCase[];
  activeSample: number | null;
  onRun: () => void;
  onRunSample: (index: number) => void;
  onStop: () => void;
}) {
  const { t } = useLayoutTranslation('learn');

  if (running) {
    return (
      <button
        className="inline-flex items-center gap-1.5 rounded-md bg-danger/90 px-2.5 py-1 text-[12px] font-bold text-white transition-colors hover:bg-danger"
        onClick={onStop}
        type="button"
      >
        <Square className="size-3" />
        {t('workspace.stop')}
      </button>
    );
  }

  return (
    <>
      {sampleTestCases.map((_, index) => (
        <button
          className="rounded-md border border-white/15 px-2 py-1 font-mono text-[11.5px] font-bold text-[#a5a5a5] transition-colors hover:border-brand/50 hover:text-white disabled:opacity-40"
          disabled={!ready}
          key={index}
          onClick={() => onRunSample(index)}
          title={t('workspace.run_sample_n', { number: index + 1 })}
          type="button"
        >
          {activeSample === index ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            t('workspace.sample_n', { number: index + 1 })
          )}
        </button>
      ))}
      <button
        className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-[12px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
        disabled={!ready}
        onClick={onRun}
        type="button"
      >
        {ready ? (
          <Play className="size-3" />
        ) : (
          // Pyodide is still downloading. The editor stays usable throughout,
          // so this is the only control that waits on it.
          <LoaderCircle className="size-3 animate-spin" />
        )}
        {ready ? t('workspace.run') : t('workspace.preparing')}
      </button>
    </>
  );
}
