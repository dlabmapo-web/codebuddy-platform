'use client';

import { peoplePageSizes, type PeoplePageSize } from '@cove/shared';
import { Check, Rows3 } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './overlays';

/**
 * How many rows a table's page holds.
 *
 * ## Why it is not a `<select>`
 *
 * It sits in a toolbar beside Columns and the facet chips, all of which are
 * menu buttons drawn by this product. A native select rendered the operating
 * system's own popup next to them — a different typeface, a different palette,
 * a different shape on every machine — so the one control a reader is least
 * likely to need was the one that stood out most. This is the same
 * `DropdownMenu` the Columns button uses, so the toolbar reads as one row of
 * controls.
 *
 * ## Why the copy comes from `common`
 *
 * `useLayoutTranslation` reads the namespace the studio layout always mounts.
 * The previous version reached into `manager`, which only the manager's own
 * pages load, so on a teacher's page the label rendered as the literal string
 * `people.page_size`. A control shared by five tables cannot depend on a
 * namespace only some of them carry.
 *
 * ## Three sizes, not a number
 *
 * The server accepts three, so the control offers three: one that could ask
 * for 5,000 rows would be a control that sometimes returns an error the reader
 * cannot act on.
 */
export function PageSizePicker<Size extends number = PeoplePageSize>({
  onChange,
  value,
  sizes,
}: {
  onChange: (pageSize: Size) => void;
  value: number;
  /**
   * The sizes on offer, when they are not the people tables' three.
   *
   * Typed from the caller's own list so the change handler keeps whatever
   * literal union that list has, instead of every table widening to `number`
   * and casting it back at the boundary.
   */
  sizes?: readonly Size[];
}) {
  const { t } = useLayoutTranslation('common');
  const options = sizes ?? (peoplePageSizes as unknown as readonly Size[]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('pagination.page_size')}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand data-[state=open]:border-brand data-[state=open]:text-brand"
          type="button"
        >
          <Rows3 className="size-4" />
          <span className="font-mono tabular-nums">{value}</span>
          {/* The unit, so the number is not a bare figure in a toolbar of
              words. Hidden on a narrow screen, where the icon carries it. */}
          <span className="hidden sm:inline font-semibold">
            {t('pagination.per_page')}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('pagination.page_size')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((size) => (
          <DropdownMenuItem
            key={size}
            onSelect={() => onChange(size)}
          >
            <Check
              className={cn(
                'size-4',
                // Kept in the layout rather than swapped out, so the labels
                // stay on one left edge instead of shifting as the choice
                // moves down the list.
                size === value ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span className="font-mono tabular-nums">{size}</span>
            <span className="text-sub">{t('pagination.per_page')}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
