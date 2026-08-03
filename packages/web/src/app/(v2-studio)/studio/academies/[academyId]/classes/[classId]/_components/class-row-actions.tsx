'use client';

import { MoreHorizontal, type LucideIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';

/**
 * The row action for both panels.
 *
 * A bare ✕ says nothing about what it removes or from where — and on a row
 * that revokes a student's access, guessing is the wrong thing to ask of
 * anyone. This is the same labeled menu the Courses and Classes tables use, so
 * a removal reads the same wherever it appears, and the menu has room for the
 * teacher-assignment actions that land here later.
 */
export function ClassRowActions({
  disabled = false,
  icon: Icon,
  menuAriaLabel,
  onRemove,
  removeLabel,
  title,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  menuAriaLabel: string;
  onRemove: () => void;
  removeLabel: string;
  /** Names the row inside the menu, so the action is never detached from it. */
  title: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={menuAriaLabel}
          className="grid size-8 shrink-0 place-items-center rounded-md text-sub outline-none transition-colors hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40 data-[state=open]:bg-canvas data-[state=open]:text-ink"
          disabled={disabled}
          type="button"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[13rem] text-[14.5px]">
        <DropdownMenuLabel className="truncate text-[12.5px]">
          {title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger focus:bg-danger/10 focus:text-danger"
          onSelect={onRemove}
        >
          <Icon />
          {removeLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
