'use client';

import type { ContentLens } from '@cove/shared';
import { contentLenses } from '@cove/shared';
import { Check, PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/studio/overlays';

import {
  contentPath,
  queryForContentLens,
  type ContentQuery,
} from '../../_lib/content-query';
import { lensIcons } from '../../_lib/content-view';

/**
 * Which kind of content the table is showing.
 *
 * Built from the same parts as the Academy chip beside it — same height, same
 * dashed-to-solid trigger, same popover, same place in the toolbar — because
 * to an operator these are one row of controls that narrow one table, and a
 * selector that looked like a different species would read as page navigation
 * rather than as part of the toolbar. The type's own icon replaces the facet's
 * generic mark, which is the one difference worth drawing.
 *
 * It is a facet by family, not by behaviour, and it says so in two ways: it is
 * single-select, and it never renders bare. There is no "no type" — a table has
 * to be showing something — so the chip is always in its chosen state and never
 * offers a way to clear it.
 *
 * Picking a type is a navigation, so the lens stays a URL: bookmarkable,
 * shareable, and Back does the obvious thing.
 */
export function ContentTypeChip({
  lens,
  query,
}: {
  lens: ContentLens;
  query: ContentQuery;
}) {
  const { t } = useTranslation('platform-content');
  const router = useRouter();
  const ActiveIcon = lensIcons[lens];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t('type.label')}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-brand bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          type="button"
        >
          <PlusCircle className="size-4" />
          {t('type.label')}
          <span aria-hidden className="h-4 w-px bg-brand/30" />
          <span className="inline-flex items-center gap-1.5 rounded bg-card px-1.5 py-0.5 text-[12px] font-bold">
            <ActiveIcon className="size-3.5" />
            {t(`lens.${lens}`)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-0">
        <Command>
          <CommandList>
            <CommandGroup heading={t('type.label')}>
              {contentLenses.map((option) => {
                const Icon = lensIcons[option];
                return (
                  <CommandItem
                    key={option}
                    onSelect={() => {
                      if (option === lens) return;
                      // The academy filter travels; the search text does not.
                      // "python fundamentals" typed against courses matches no
                      // problem, and an empty table reads as "there are none"
                      // rather than "your search moved with you".
                      router.push(
                        contentPath(option, queryForContentLens(query)),
                      );
                    }}
                    value={t(`lens.${option}`)}
                  >
                    <Icon className="size-4 text-sub" />
                    <span className="flex-1">{t(`lens.${option}`)}</span>
                    {option === lens ? <Check className="size-4" /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
