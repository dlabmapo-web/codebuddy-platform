'use client';

import type { CurriculumEffectiveness } from '@cove/shared';
import { Compass, Layers, Repeat, Scale, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { Panel, toneStyles, type PanelTone } from '../overview-ui/panel';
import {
  CalibrationPanel,
  GrindPanel,
  NeverAttemptedPanel,
  ProblemsPanel,
} from './effectiveness-panels';

/**
 * The four measurements over authored work, as one panel with four faces.
 *
 * They were four stacked cards, and that was the page's worst passage: four
 * headers, four descriptions, and four bodies of near-identical rows, one after
 * another, none of which a reader can hold in mind at once. They are still four
 * separate questions — a hard problem is teaching attention, a mislabelled one
 * is a metadata edit, a grind is a rewrite, an untouched one is pacing — so
 * they are not merged into a table with a "kind" column, which would be a
 * heading pretending to be data.
 *
 * A tab strip is the honest shape for four alternatives that share a row form.
 * The reader picks the question; the panel answers exactly one at a time.
 *
 * ## Why the panel changes colour
 *
 * Each measurement keeps the hue it had as its own card, and the panel adopts
 * the active tab's — rail, icon plate, and count. The colour is not decoration
 * here: it is the only thing that survives at the edge of vision to say which
 * of the four questions is currently on screen, and a tab strip whose selection
 * is marked by weight alone is one readers lose their place in.
 *
 * Every count is shown, zero included. "Nothing is being brute-forced" is a
 * result, and a tab that hid itself when clean would make the page's shape
 * depend on the week.
 */

type TabKey = 'problems' | 'calibration' | 'grind' | 'never_attempted';

const tabs: readonly { key: TabKey; icon: LucideIcon; tone: PanelTone }[] = [
  { key: 'problems', icon: Compass, tone: 'warning' },
  { key: 'calibration', icon: Scale, tone: 'primary' },
  { key: 'grind', icon: Repeat, tone: 'teal' },
  { key: 'never_attempted', icon: Layers, tone: 'brand' },
];

export function EffectivenessTabs({
  academyId,
  effectiveness,
  id,
  scope,
}: {
  academyId: string;
  effectiveness: CurriculumEffectiveness;
  id: string;
  scope?: React.ReactNode;
}) {
  const { t } = useTranslation('lead');
  const [active, setActive] = React.useState<TabKey>('problems');
  const refs = React.useRef(new Map<TabKey, HTMLButtonElement | null>());

  const counts: Record<TabKey, number> = {
    problems: effectiveness.problems.length,
    calibration: effectiveness.calibration.length,
    grind: effectiveness.grind.length,
    never_attempted: effectiveness.neverAttemptedTotal,
  };

  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];

  /** Arrow keys move the selection, which is what a tab strip owes a keyboard. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.key === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setActive(next.key);
    refs.current.get(next.key)?.focus();
  };

  return (
    <Panel
      description={t(`${active}.description`)}
      icon={current.icon}
      id={id}
      scope={scope}
      tinted
      title={t(`${active}.title`)}
      tone={current.tone}
    >
      <div
        aria-label={t('effectiveness_title')}
        className="flex gap-1 overflow-x-auto border-b border-border bg-muted px-2 py-2"
        onKeyDown={onKeyDown}
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active;
          const styles = toneStyles[tab.tone];
          return (
            <button
              aria-controls={`${id}-${tab.key}`}
              aria-selected={selected}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-bold transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                selected
                  ? cn('bg-card shadow-[var(--shadow-card)]', styles.text)
                  : 'text-sub hover:bg-card/60 hover:text-ink',
              )}
              id={`${id}-${tab.key}-tab`}
              key={tab.key}
              onClick={() => setActive(tab.key)}
              ref={(node) => {
                refs.current.set(tab.key, node);
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <tab.icon aria-hidden className="size-4" strokeWidth={2.25} />
              {t(`tabs.${tab.key}`)}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[11px] font-bold tabular-nums',
                  selected ? styles.pill : 'bg-accent text-sub',
                )}
              >
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`${id}-${active}-tab`}
        id={`${id}-${active}`}
        role="tabpanel"
        tabIndex={0}
      >
        {active === 'problems' ? (
          <ProblemsPanel academyId={academyId} rows={effectiveness.problems} />
        ) : null}
        {active === 'calibration' ? (
          <CalibrationPanel
            academyId={academyId}
            rows={effectiveness.calibration}
          />
        ) : null}
        {active === 'grind' ? (
          <GrindPanel academyId={academyId} rows={effectiveness.grind} />
        ) : null}
        {active === 'never_attempted' ? (
          <NeverAttemptedPanel
            academyId={academyId}
            effectiveness={effectiveness}
          />
        ) : null}
      </div>
    </Panel>
  );
}
