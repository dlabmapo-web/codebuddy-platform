'use client';

import type { Column } from '@tanstack/react-table';
import { Check, PlusCircle } from 'lucide-react';
import type * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './overlays';

export type FacetOption = {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
};

export type TableFacet = {
  /** Column this filter narrows. Must use an `arrIncludesSome` filter. */
  columnId: string;
  title: string;
  options: FacetOption[];
};

/**
 * Multi-select filter for a single column, shown as a dashed "add filter"
 * chip that fills in with the chosen values.
 */
export function FacetedFilter<TData, TValue>({
  column,
  options,
  title,
}: {
  column: Column<TData, TValue> | undefined;
  options: FacetOption[];
  title: string;
}) {
  const { t } = useLayoutTranslation('common');
  const selected = new Set((column?.getFilterValue() as string[]) ?? []);
  const counts = column?.getFacetedUniqueValues();
  const active = selected.size > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-lg border border-dashed px-3.5 text-[13.5px] font-bold transition-colors',
            active
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-border bg-card text-sub hover:border-brand hover:text-brand',
          )}
          type="button"
        >
          <PlusCircle className="size-4" />
          {title}
          {active ? (
            <>
              <span className="h-4 w-px bg-brand/30" />
              <span className="flex gap-1">
                {selected.size > 2
                  ? (
                    <span className="rounded bg-card px-1.5 py-0.5 text-[12px] font-bold">
                      {t('filter.selected', { count: selected.size })}
                    </span>
                  )
                  : options
                      .filter((option) => selected.has(option.value))
                      .map((option) => (
                        <span
                          className="rounded bg-card px-1.5 py-0.5 text-[12px] font-bold"
                          key={option.value}
                        >
                          {option.label}
                        </span>
                      ))}
              </span>
            </>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>{t('filter.no_results')}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const next = new Set(selected);
                      if (isSelected) next.delete(option.value);
                      else next.add(option.value);
                      const values = Array.from(next);
                      column?.setFilterValue(
                        values.length > 0 ? values : undefined,
                      );
                    }}
                    value={option.label}
                  >
                    <span
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border',
                        isSelected
                          ? 'border-brand bg-brand text-on-brand'
                          : 'border-border',
                      )}
                    >
                      {isSelected ? <Check className="size-3" /> : null}
                    </span>
                    {option.icon ? (
                      <option.icon className="size-4 text-sub" />
                    ) : null}
                    <span className="flex-1">{option.label}</span>
                    {counts?.get(option.value) ? (
                      <span className="font-mono text-[12px] tabular-nums text-sub">
                        {counts.get(option.value)}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {active ? (
              <CommandGroup className="border-t border-border">
                <CommandItem
                  className="justify-center text-[13px] font-bold text-sub"
                  onSelect={() => column?.setFilterValue(undefined)}
                  value="__clear__"
                >
                  {t('filter.clear')}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
