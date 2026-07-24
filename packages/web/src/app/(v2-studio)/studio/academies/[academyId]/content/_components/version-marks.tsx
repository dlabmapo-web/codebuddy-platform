'use client';

import type { CourseSummary } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';

import {
  useLayoutTranslation,
  useLocale,
  type TranslationKey,
} from '@/i18n';

/**
 * One vocabulary for version state, reused across the library and the builder:
 * a hollow ring is an editable draft, a solid blue dot is the live version.
 */
export type VersionState = 'draft' | 'published' | 'retired';

const stateChipClass: Record<VersionState, string> = {
  draft: 'bg-draft-soft text-draft',
  published: 'bg-brand-soft text-brand',
  retired: 'bg-retired-soft text-retired',
};

const stateDotClass: Record<VersionState, string> = {
  draft: 'border-draft bg-draft-soft',
  published: 'border-brand bg-brand',
  retired: 'border-retired bg-retired-soft',
};

const versionPrefix = 'v';

/** Key per state, so the label is looked up in the reader's language. */
const stateLabelKey: Record<VersionState, TranslationKey<'content'>> = {
  draft: 'version.draft',
  published: 'version.published',
  retired: 'version.retired',
};

export function VersionChip({
  state,
  versionNumber,
}: {
  state: VersionState;
  versionNumber?: number;
}) {
  const { t } = useLayoutTranslation('content');
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${stateChipClass[state]}`}
    >
      <span className={`size-2 rounded-full border-2 ${stateDotClass[state]}`} />
      {versionNumber === undefined ? null : (
        <span className="font-mono">{versionPrefix}{versionNumber}</span>
      )}
      {t(stateLabelKey[state])}
    </span>
  );
}

/**
 * The version spine: what is live, and what is being written next.
 */
export function VersionSpine({ course }: { course: CourseSummary }) {
  const { t } = useLayoutTranslation('content');
  const rows: Array<{ state: VersionState; versionNumber: number }> = [];
  if (course.draftVersion) {
    rows.push({ state: 'draft', versionNumber: course.draftVersion.versionNumber });
  }
  if (course.publishedVersion) {
    rows.push({
      state: 'published',
      versionNumber: course.publishedVersion.versionNumber,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12px] font-semibold text-sub">
        <span className="size-2 rounded-full border-2 border-border" />
        {t('version.none')}
      </div>
    );
  }

  return (
    <ol className="relative space-y-2">
      {rows.length > 1 ? (
        <span
          aria-hidden
          className="absolute left-[3px] top-2 h-[calc(100%-1rem)] w-px bg-border"
        />
      ) : null}
      {rows.map((row) => (
        <li className="relative flex items-center gap-2.5" key={row.state}>
          <span
            className={`size-2 shrink-0 rounded-full border-2 ${stateDotClass[row.state]}`}
          />
          <span className="font-mono text-[13px] font-bold tabular-nums">
            {versionPrefix}{row.versionNumber}
          </span>
          <span
            className={`text-[12px] font-semibold ${
              row.state === 'draft' ? 'text-draft' : 'text-brand'
            }`}
          >
            {t(stateLabelKey[row.state])}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Table cells drop the year; the locale decides the rest. */
export function useContentDate(): (iso: string) => string {
  const locale = useLocale();
  return (iso: string) => formatShortDate(iso, locale);
}
