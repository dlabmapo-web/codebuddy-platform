'use client';

import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  WifiOff,
  XCircle,
} from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import type { ResultPresentation } from '../_lib/scoring';

const presentationVisual = {
  grading: {
    icon: LoaderCircle,
    iconClass: 'border-brand/35 bg-brand/15 text-[#60a5fa]',
    eyebrowClass: 'text-[#60a5fa]',
    animate: true,
  },
  accepted: {
    icon: CheckCircle2,
    iconClass: 'border-success/35 bg-success/15 text-success',
    eyebrowClass: 'text-success',
    animate: false,
  },
  wrong_output: {
    icon: XCircle,
    iconClass: 'border-danger/35 bg-danger/15 text-[#fb7185]',
    eyebrowClass: 'text-[#fb7185]',
    animate: false,
  },
  runtime_error: {
    icon: XCircle,
    iconClass: 'border-danger/35 bg-danger/15 text-[#fb7185]',
    eyebrowClass: 'text-[#fb7185]',
    animate: false,
  },
  time_limit: {
    icon: AlertTriangle,
    iconClass: 'border-warning/40 bg-warning/15 text-warning',
    eyebrowClass: 'text-warning',
    animate: false,
  },
  memory_limit: {
    icon: AlertTriangle,
    iconClass: 'border-warning/40 bg-warning/15 text-warning',
    eyebrowClass: 'text-warning',
    animate: false,
  },
  not_accepted: {
    icon: XCircle,
    iconClass: 'border-danger/35 bg-danger/15 text-[#fb7185]',
    eyebrowClass: 'text-[#fb7185]',
    animate: false,
  },
  judge_error: {
    icon: AlertTriangle,
    iconClass: 'border-warning/40 bg-warning/15 text-warning',
    eyebrowClass: 'text-warning',
    animate: false,
  },
  transport_error: {
    icon: WifiOff,
    iconClass: 'border-danger/35 bg-danger/15 text-[#fb7185]',
    eyebrowClass: 'text-[#fb7185]',
    animate: false,
  },
} as const;

export function ResultHero({
  presentation,
}: {
  presentation: ResultPresentation;
}) {
  const { t } = useLayoutTranslation('learn');
  const visual = presentationVisual[presentation];
  const Icon = visual.icon;

  return (
    <section
      aria-live="polite"
      className="flex items-center gap-3.5"
      data-testid="result-hero"
    >
      <div
        className={`grid size-12 shrink-0 place-items-center rounded-xl border ${visual.iconClass}`}
      >
        <Icon
          aria-hidden
          className={`size-6 ${visual.animate ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
      </div>
      <div className="min-w-0">
        <p
          className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${visual.eyebrowClass}`}
        >
          {t(`submit.presentation.${presentation}.eyebrow`)}
        </p>
        <h3 className="mt-0.5 text-[17px] font-extrabold leading-tight text-[#f8fafc]">
          {t(`submit.presentation.${presentation}.headline`)}
        </h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[#94a3b8]">
          {t(`submit.presentation.${presentation}.guidance`)}
        </p>
      </div>
    </section>
  );
}
