'use client';

import type { ContentLens } from '@cove/shared';
import { contentLenses } from '@cove/shared';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { contentLensHrefs } from '../../_lib/content-view';

/**
 * Courses, classes, problems — three views of one academy's teaching, across
 * every academy.
 *
 * Links rather than buttons, for the reason the users directory gives: each
 * lens is a URL, so it can be bookmarked, sent to a colleague, and opened in a
 * new tab, and Back does the obvious thing.
 */
export function ContentLensTabs({ active }: { active: ContentLens }) {
  const { t } = useTranslation('platform-content');

  return (
    <nav aria-label={t('lens.label')}>
      <ul className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {contentLenses.map((lens) => {
          const isActive = lens === active;
          return (
            <li key={lens}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex h-8 items-center rounded-md px-3 text-[13.5px] font-bold transition-colors ${
                  isActive ? 'bg-card text-ink shadow-sm' : 'text-sub hover:text-ink'
                }`}
                href={contentLensHrefs[lens]}
              >
                {t(`lens.${lens}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
