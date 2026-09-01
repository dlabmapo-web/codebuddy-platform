'use client';

import type { UserLens } from '@cove/shared';
import { userLenses } from '@cove/shared';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { lensHrefs } from '../_lib/user-view';

/**
 * Four entrances onto one directory.
 *
 * An operator asks for "the teachers page", so there is a teachers page — but
 * it is this table with its role facet already set, not a second
 * implementation. Three separate tables would give one column three places to
 * drift, and the day somebody fixes how a suspended membership renders they
 * would fix it once.
 *
 * Links rather than buttons, because each lens *is* a URL: it can be
 * bookmarked, sent to a colleague, and opened in a new tab, and the browser's
 * Back does the obvious thing. A tab control that swapped state in place would
 * take all three away.
 */
export function UserLensTabs({ active }: { active: UserLens }) {
  const { t } = useTranslation('platform-users');

  return (
    <nav aria-label={t('lens.label')}>
      <ul className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {userLenses.map((lens) => {
          const isActive = lens === active;
          return (
            <li key={lens}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex h-8 items-center rounded-md px-3 text-[13.5px] font-bold transition-colors ${
                  isActive
                    ? 'bg-card text-ink shadow-sm'
                    : 'text-sub hover:text-ink'
                }`}
                href={lensHrefs[lens]}
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
