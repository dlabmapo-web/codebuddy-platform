'use client';

import { ChevronsUpDown, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import {
  ResponsiveSelector,
  type SelectorItem,
  type TriggerProps,
} from '@/components/studio/selector';
import { cn } from '@/lib/utils';

/**
 * One scope filter, on the Studio's own selector.
 *
 * These lists are not two-item enums. A teacher can run a dozen classes and a
 * course can hold fifty problems, and a native `<select>` answers "which one of
 * these" with a scrolling column and no way to type. `ResponsiveSelector` is
 * what the rest of the product already uses for exactly this question — picking
 * an academy at sign-up, assigning a teacher to a class — so it arrives with a
 * search box, a popover on desktop, a drawer on touch, and one set of keyboard
 * behaviour a teacher has already learned somewhere else.
 *
 * ## The "all" row
 *
 * The selector has no concept of an empty choice, and this filter needs one:
 * "every class I teach" is a real answer rather than the absence of one. So it
 * is a real row at the top of the list, carrying the id `all` — which is
 * already the word the address uses for the same state, so the control, the URL,
 * and the server all spell it the same way.
 *
 * ## The trigger
 *
 * Built per call site so each filter keeps its own icon, and closing over
 * nothing else — whether the filter is narrowed is read from `selectedItem`
 * inside the trigger rather than passed in, so the component type stays stable
 * across renders and the button does not remount (and lose focus) every time
 * the selection changes.
 */

/** The written form of "no filter", shared with the address. */
export const ALL_OPTION = 'all';

export type FilterOption = { value: string; label: string };

export function FilterSelector({
  allLabel,
  disabled,
  icon,
  label,
  onChange,
  options,
  value,
}: {
  /** The row that clears this filter, e.g. "All my classes". */
  allLabel: string;
  disabled?: boolean;
  icon: LucideIcon;
  /** Names the control for assistive technology and titles the mobile drawer. */
  label: string;
  onChange: (value: string | null) => void;
  options: FilterOption[];
  value: string | null;
}) {
  const items = React.useMemo<SelectorItem[]>(
    () => [
      { id: ALL_OPTION, name: allLabel },
      ...options.map((option) => ({ id: option.value, name: option.label })),
    ],
    [allLabel, options],
  );

  const Trigger = React.useMemo(() => createTrigger(icon, label), [icon, label]);

  return (
    <ResponsiveSelector
      disabled={disabled}
      drawerTitle={label}
      list={items}
      onSelect={(item) =>
        onChange(item.id === ALL_OPTION ? null : item.id)
      }
      popoverClassName="min-w-64"
      // Never null: with nothing narrowed the "all" row is the selection, so
      // the list always shows a tick and the trigger always has a name to print.
      selectedId={value ?? ALL_OPTION}
      TriggerComp={Trigger}
    />
  );
}

function createTrigger(Icon: LucideIcon, label: string) {
  return React.forwardRef<HTMLButtonElement, TriggerProps<SelectorItem>>(
    function FilterTrigger({ className, selectedItem, ...props }, ref) {
      // A narrowed filter is a fact about what the page is showing, so the
      // control says so rather than looking identical to "everything".
      const narrowed = Boolean(selectedItem) && selectedItem!.id !== ALL_OPTION;

      return (
        <button
          aria-controls={undefined}
          aria-expanded={false}
          aria-label={label}
          className={cn(
            'flex h-9 max-w-[15rem] items-center gap-2 rounded-lg border bg-card pl-2.5 pr-2',
            'text-[13px] font-semibold shadow-[var(--shadow-card)] outline-none transition-colors',
            'hover:border-brand focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            narrowed ? 'border-brand text-brand' : 'border-border text-ink',
            className,
          )}
          ref={ref}
          role="combobox"
          type="button"
          {...props}
        >
          <Icon
            aria-hidden
            className={cn('size-4 shrink-0', narrowed ? 'text-brand' : 'text-sub')}
          />
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedItem?.name ?? label}
          </span>
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-sub" />
        </button>
      );
    },
  );
}
