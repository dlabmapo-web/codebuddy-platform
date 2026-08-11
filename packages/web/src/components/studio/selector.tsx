'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './overlays';

export type SelectorItem = { id: string; name: string };

export type TriggerProps<T> = React.ComponentPropsWithoutRef<'button'> & {
  selectedItem?: T;
};

export type TriggerComponent<T> = React.ForwardRefExoticComponent<
  TriggerProps<T> & React.RefAttributes<HTMLButtonElement>
>;

export type MultiTriggerProps<T> = React.ComponentPropsWithoutRef<'button'> & {
  selectedItems: T[];
};

export type MultiTriggerComponent<T> = React.ForwardRefExoticComponent<
  MultiTriggerProps<T> & React.RefAttributes<HTMLButtonElement>
>;

type BaseProps<TItem extends SelectorItem> = {
  list: TItem[];
  /** Title shown above the list in the mobile drawer. */
  drawerTitle?: string;
  /** Text shown when the list has no match. */
  emptyLabel?: string;
  placeholder?: string;
  renderItem?: (item: TItem) => React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  popoverClassName?: string;
  listClassName?: string;
  itemClassName?: string;
};

export type ResponsiveSelectorProps<TItem extends SelectorItem> =
  BaseProps<TItem> & {
    selectedId: string | null;
    onSelect: (item: TItem) => void;
    TriggerComp?: TriggerComponent<TItem>;
    /** Trigger label used by the built-in trigger when nothing is selected. */
    label?: string;
    disabled?: boolean;
  };

export type ResponsiveMultiSelectorProps<TItem extends SelectorItem> =
  BaseProps<TItem> & {
    selectedIds: string[];
    onSelect: (items: TItem[]) => void;
    TriggerComp?: MultiTriggerComponent<TItem>;
    label?: string;
  };

/* ------------------------------------------------------- default triggers */

const triggerClass =
  'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-[14px] font-medium text-ink outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50';

export const SelectorTrigger = React.forwardRef<
  HTMLButtonElement,
  TriggerProps<SelectorItem> & { label?: string }
>(function SelectorTrigger({ className, selectedItem, label, ...props }, ref) {
  const { t } = useLayoutTranslation('common');
  return (
    <button
      className={cn(triggerClass, className)}
      aria-controls={undefined}
      aria-expanded={false}
      ref={ref}
      role="combobox"
      type="button"
      {...props}
    >
      <span className={cn('truncate', !selectedItem && 'text-sub/70')}>
        {selectedItem?.name ?? label ?? t('action.select')}
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-sub" />
    </button>
  );
});

const MultiSelectorTrigger = React.forwardRef<
  HTMLButtonElement,
  MultiTriggerProps<SelectorItem> & { label?: string }
>(function MultiSelectorTrigger(
  { className, selectedItems, label, ...props },
  ref,
) {
  const { t } = useLayoutTranslation('common');
  return (
    <button
      className={cn(triggerClass, className)}
      aria-controls={undefined}
      aria-expanded={false}
      ref={ref}
      role="combobox"
      type="button"
      {...props}
    >
      <span className={cn('truncate', selectedItems.length === 0 && 'text-sub/70')}>
        {selectedItems.length === 0
          ? (label ?? t('action.select'))
          : selectedItems.length === 1
            ? selectedItems[0]!.name
            : `${selectedItems[0]!.name} +${selectedItems.length - 1}`}
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-sub" />
    </button>
  );
});

/* ------------------------------------------------------------ shared list */

function SelectorCommand<TItem extends SelectorItem>({
  list,
  selectedIds,
  onPick,
  placeholder,
  emptyLabel,
  renderItem,
  listClassName,
  itemClassName,
}: {
  list: TItem[];
  selectedIds: string[];
  onPick: (item: TItem) => void;
  placeholder: string;
  emptyLabel: string;
  renderItem?: (item: TItem) => React.ReactNode;
  listClassName?: string;
  itemClassName?: string;
}) {
  return (
    <Command
      filter={(value, search) =>
        value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
      }
    >
      <CommandInput placeholder={placeholder} />
      <CommandList className={listClassName}>
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        <CommandGroup>
          {list.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <CommandItem
                className={itemClassName}
                key={item.id}
                onSelect={() => onPick(item)}
                value={item.name}
              >
                <Check
                  className={cn(
                    'size-4 shrink-0 text-brand',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {renderItem ? renderItem(item) : item.name}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/* -------------------------------------------------------- single selector */

/**
 * A searchable single-choice selector: popover on desktop, drawer on touch.
 * Pass `TriggerComp` to control how the current value is displayed.
 */
export function ResponsiveSelector<TItem extends SelectorItem>({
  list,
  selectedId,
  onSelect,
  TriggerComp,
  label,
  disabled,
  drawerTitle,
  emptyLabel,
  placeholder,
  renderItem,
  side = 'bottom',
  align = 'start',
  popoverClassName,
  listClassName,
  itemClassName,
}: ResponsiveSelectorProps<TItem>) {
  const { t } = useLayoutTranslation('common');
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedItem = list.find((item) => item.id === selectedId);
  const emptyText = emptyLabel ?? t('state.no_results');
  const searchText = placeholder ?? t('state.search_placeholder');

  const trigger = TriggerComp ? (
    <TriggerComp disabled={disabled} selectedItem={selectedItem} />
  ) : (
    <SelectorTrigger disabled={disabled} label={label} selectedItem={selectedItem} />
  );

  const body = (
    <SelectorCommand
      emptyLabel={emptyText}
      itemClassName={itemClassName}
      list={list}
      listClassName={listClassName}
      onPick={(item) => {
        onSelect(item);
        setIsOpen(false);
      }}
      placeholder={searchText}
      renderItem={renderItem}
      selectedIds={selectedId ? [selectedId] : []}
    />
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={setIsOpen} open={isOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent title={drawerTitle ?? label ?? t('action.select')}>
          <div className="overflow-hidden pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('w-(--radix-popover-trigger-width) min-w-56 p-0', popoverClassName)}
        side={side}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------------------------------------- multi selector */

/** Same interaction as {@link ResponsiveSelector}, but the list stays open. */
export function ResponsiveMultiSelector<TItem extends SelectorItem>({
  list,
  selectedIds,
  onSelect,
  TriggerComp,
  label,
  drawerTitle,
  emptyLabel,
  placeholder,
  renderItem,
  side = 'bottom',
  align = 'start',
  popoverClassName,
  listClassName,
  itemClassName,
}: ResponsiveMultiSelectorProps<TItem>) {
  const { t } = useLayoutTranslation('common');
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedItems = list.filter((item) => selectedIds.includes(item.id));
  const emptyText = emptyLabel ?? t('state.no_results');
  const searchText = placeholder ?? t('state.search_placeholder');

  const toggle = (item: TItem) => {
    const next = selectedIds.includes(item.id)
      ? selectedItems.filter((current) => current.id !== item.id)
      : [...selectedItems, item];
    onSelect(next);
  };

  const trigger = TriggerComp ? (
    <TriggerComp selectedItems={selectedItems} />
  ) : (
    <MultiSelectorTrigger label={label} selectedItems={selectedItems} />
  );

  const body = (
    <SelectorCommand
      emptyLabel={emptyText}
      itemClassName={itemClassName}
      list={list}
      listClassName={listClassName}
      onPick={toggle}
      placeholder={searchText}
      renderItem={renderItem}
      selectedIds={selectedIds}
    />
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={setIsOpen} open={isOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent title={drawerTitle ?? label ?? t('action.select')}>
          <div className="overflow-hidden pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('w-(--radix-popover-trigger-width) min-w-56 p-0', popoverClassName)}
        side={side}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
