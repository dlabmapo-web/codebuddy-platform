'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import { LoaderCircle, Play, Square } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

/** Shared run controls. Students run the complete sample set; teachers can
 * still run individual samples while inspecting a student's program. */
export function RunControls({
  running,
  ready,
  sampleTestCases,
  activeSample,
  onRun,
  onRunSample,
  onRunAll,
  onStop,
}: {
  running: boolean;
  ready: boolean;
  sampleTestCases: LearnSampleTestCase[];
  activeSample: number | null;
  onRun: () => void;
  onRunSample: (index: number) => void;
  onRunAll?: () => void;
  onStop: () => void;
}) {
  const { t } = useLayoutTranslation('learn');

  if (running) {
    return (
      <button
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-danger/90 px-2.5 py-1 text-[12px] font-bold text-on-danger transition-colors hover:bg-danger"
        onClick={onStop}
        type="button"
      >
        <Square className="size-3" />
        {t('workspace.stop')}
      </button>
    );
  }

  // Ten chips cannot spell out "Test" until the pane is very wide, so past a
  // handful each is its number alone and the strip rarely has to scroll at
  // all. The full label stays in the accessible name either way, so nothing is
  // lost to a screen reader, or to a test that looks a chip up by name.
  const dense = sampleTestCases.length > 4;

  return (
    <>
      {onRunAll ? (
        <button type="button" disabled={!ready || sampleTestCases.length === 0} onClick={onRunAll} className="inline-flex shrink-0 items-center rounded-md bg-white/10 px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{t('workspace.run_tests')}</button>
      ) : sampleTestCases.length > 0 ? (
        <div className="cove-scroll-x flex min-w-0 flex-1 overflow-x-auto py-1">
          {/* `ml-auto`, not the parent's `justify-end`: see `.cove-scroll-x`. */}
          <div className="ml-auto flex items-center gap-1">
            {sampleTestCases.map((_, index) => (
              <button
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
                  activeSample === index
                    ? 'bg-brand/25 text-white'
                    : 'bg-white/10 text-[#d4d4d4] hover:bg-white/20 hover:text-white'
                }`}
                disabled={!ready}
                key={index}
                onClick={() => onRunSample(index)}
                title={t('workspace.run_sample_n', { number: index + 1 })}
                type="button"
              >
                {activeSample === index ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : (
                  <Play className="size-2.5" />
                )}
                <span className={dense ? 'sr-only @5xl:not-sr-only' : undefined}>
                  {t('workspace.sample_n', { number: index + 1 })}
                </span>
                {dense ? (
                  <span aria-hidden className="@5xl:hidden">
                    {index + 1}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-[12px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-50"
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
