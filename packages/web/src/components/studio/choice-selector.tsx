'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SelectorItem } from './selector';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './overlays';

/** Short, fixed choices share the Studio menus; longer searchable lists use ResponsiveSelector. */
export function ChoiceSelector<TItem extends SelectorItem & { disabled?: boolean }>({
  label, list, selectedId, onSelect, className, renderItem, disabled = false, onCloseAutoFocus, contentClassName, side,
}: {
  label: string;
  list: readonly TItem[];
  selectedId: string;
  onSelect: (item: TItem) => void;
  className?: string;
  contentClassName?: string;
  side?: React.ComponentProps<typeof DropdownMenuContent>['side'];
  renderItem?: (item: TItem) => React.ReactNode;
  disabled?: boolean;
  onCloseAutoFocus?: React.ComponentProps<typeof DropdownMenuContent>['onCloseAutoFocus'];
}) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const selected = list.find((item) => item.id === selectedId);
  return <DropdownMenu onOpenChange={(open) => {
    if (open) setContainer(document.fullscreenElement as HTMLElement | null);
  }}>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={label} disabled={disabled} className={cn(
        'group flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-3 text-left text-sm font-medium text-ink outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 data-[state=open]:border-brand data-[state=open]:ring-2 data-[state=open]:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50', className,
      )}>
        <span className="truncate">{selected?.name ?? label}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-sub transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent onCloseAutoFocus={onCloseAutoFocus} align="start" side={side} sideOffset={6} portalContainer={container} className={cn("w-(--radix-dropdown-menu-trigger-width) min-w-0 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto rounded-xl p-1.5 shadow-lg", contentClassName)}>
      <DropdownMenuRadioGroup aria-label={label} value={selectedId} onValueChange={(id) => {
        const item = list.find((candidate) => candidate.id === id);
        if (item && !item.disabled) onSelect(item);
      }}>
        {list.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id} disabled={item.disabled} className="min-h-11 gap-3 rounded-lg px-3 py-2.5 text-sm focus:bg-brand-soft focus:text-brand data-[state=checked]:bg-brand-soft data-[state=checked]:text-brand data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45">
          <span className="min-w-0 flex-1">{renderItem ? renderItem(item) : item.name}</span>
          {item.id === selectedId ? <Check aria-hidden className="size-4 shrink-0 text-brand" /> : null}
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
