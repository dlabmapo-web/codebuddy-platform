'use client';

import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

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
} from '@/components/studio/overlays';

/** An academy a new record can land in — the facet's own list. */
export type ConsoleAcademyOption = { id: string; name: string; slug: string };

/**
 * Which academy a console form is about to write into.
 *
 * The one field a studio form never needs and a console form always does: a
 * manager has one academy and an operator has all of them. It is drawn as a
 * **form control** — solid border, the height of the inputs around it — and
 * deliberately *not* as the dashed facet chip the toolbars use. The chip
 * narrows a list you are looking at; this decides where a new record lands, and
 * two controls that look alike while doing different things is how a course, or
 * an invitation, ends up in the wrong customer's academy.
 *
 * A searchable list rather than a plain select: the console's own facet is fed
 * by every academy on the platform, and a list an operator has to scroll is a
 * list they pick the wrong neighbour from.
 *
 * `locked` renders the choice as settled fact rather than disabling the
 * control. A disabled combobox invites clicking; a sentence does not. Callers
 * pass it when the academy facet has already answered the question, because
 * asking again charges the operator for the filter they set.
 */
export function AcademyField({
  academies,
  locked = false,
  onChange,
  selected,
}: {
  academies: ConsoleAcademyOption[];
  locked?: boolean;
  onChange: (academyId: string) => void;
  selected: ConsoleAcademyOption | null;
}) {
  const { t } = useTranslation('platform');
  const [open, setOpen] = React.useState(false);

  if (locked) {
    return (
      <p className="flex h-11 items-center gap-2 rounded-lg border border-border bg-canvas px-3 text-[15px] font-semibold text-ink">
        <Building2
          aria-hidden
          className="size-4 shrink-0 text-sub"
          strokeWidth={2.25}
        />
        <span className="truncate">
          {selected?.name ?? t('academy_field.unknown')}
        </span>
      </p>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-[15px] outline-none transition-colors hover:bg-canvas focus:border-brand focus:ring-2 focus:ring-brand/20"
          type="button"
        >
          <Building2
            aria-hidden
            className="size-4 shrink-0 text-sub"
            strokeWidth={2.25}
          />
          <span
            className={
              selected
                ? 'min-w-0 flex-1 truncate font-semibold text-ink'
                : 'min-w-0 flex-1 truncate text-sub'
            }
          >
            {selected?.name ?? t('academy_field.placeholder')}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-sub" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder={t('academy_field.search')} />
          <CommandList>
            <CommandEmpty>{t('academy_field.empty')}</CommandEmpty>
            <CommandGroup>
              {academies.map((academy) => (
                <CommandItem
                  key={academy.id}
                  onSelect={() => {
                    onChange(academy.id);
                    setOpen(false);
                  }}
                  // Searchable by slug as well as name: an operator working
                  // from a URL in a ticket has the slug, not the name.
                  value={`${academy.name} ${academy.slug}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">
                      {academy.name}
                    </span>
                    <span className="truncate font-mono text-[12px] text-sub">
                      /{academy.slug}
                    </span>
                  </span>
                  {academy.id === selected?.id ? (
                    <Check className="size-4" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
