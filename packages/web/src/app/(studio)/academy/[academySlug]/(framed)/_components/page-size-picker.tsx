'use client';

import { peoplePageSizes, type PeoplePageSize } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * How many rows a people table's page holds.
 *
 * Three sizes rather than a free number, because the server accepts three: a
 * control that could ask for 5,000 rows would be a control that sometimes
 * returns an error a manager cannot act on.
 *
 * Changing it deliberately does *not* reset the page. It widens the window on
 * the result the manager is already reading, rather than sending them back to
 * the top of it.
 *
 * Shared by Members, Students, and Staff, which page by the same rule.
 */
export function PageSizePicker({
  onChange,
  value,
}: {
  onChange: (pageSize: PeoplePageSize) => void;
  value: number;
}) {
  const { t } = useTranslation('manager');
  const id = React.useId();
  return (
    <span className="flex items-center gap-1.5">
      <label className="text-[12px] font-bold text-sub" htmlFor={id}>
        {t('people.page_size')}
      </label>
      <select
        className="h-10 rounded-lg border border-border bg-card px-2 text-[13px] font-bold outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        id={id}
        onChange={(event) =>
          onChange(Number(event.target.value) as PeoplePageSize)
        }
        value={value}
      >
        {peoplePageSizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </span>
  );
}
