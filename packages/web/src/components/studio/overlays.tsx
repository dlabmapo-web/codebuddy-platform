'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive } from 'cmdk';
import { Check, ChevronRight, Search } from 'lucide-react';
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- popover */

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        className={cn(
          'cove-pop z-50 rounded-card border border-border bg-card shadow-lg outline-none',
          className,
        )}
        data-slot="popover-content"
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ----------------------------------------------------------------- drawer */

const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;

function DrawerContent({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & { title: string }) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <DrawerPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-modal border-t border-border bg-card outline-none',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border"
        />
        <DrawerPrimitive.Title className="px-4 py-3 text-[15px] font-bold">
          {title}
        </DrawerPrimitive.Title>
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

/* ---------------------------------------------------------------- command */

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn('flex w-full flex-col overflow-hidden rounded-card', className)}
      data-slot="command"
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 text-sub" />
      <CommandPrimitive.Input
        className={cn(
          'h-full w-full bg-transparent text-[14px] outline-none placeholder:text-sub/60 disabled:opacity-50',
          className,
        )}
        data-slot="command-input"
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-64 overflow-y-auto overflow-x-hidden p-1', className)}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandEmpty(
  props: React.ComponentProps<typeof CommandPrimitive.Empty>,
) {
  return (
    <CommandPrimitive.Empty
      className="px-3 py-6 text-center text-[13px] text-sub"
      data-slot="command-empty"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden text-ink [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-sub',
        className,
      )}
      data-slot="command-group"
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-[14px] outline-none data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      data-slot="command-item"
      {...props}
    />
  );
}

/* ---------------------------------------------------------- dropdown menu */

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={cn(
          'cove-pop z-50 min-w-[10rem] overflow-hidden rounded-card border border-border bg-card p-1 shadow-lg',
          className,
        )}
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[14px] outline-none focus:bg-accent focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      data-slot="dropdown-menu-item"
      {...props}
    />
  );
}

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

/**
 * A menu item that opens a nested panel of its own — a role picker inside a
 * row's action menu, rather than a second dialog. Carries a trailing chevron
 * so it reads as "more here" rather than as an ordinary item.
 */
function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[14px] outline-none focus:bg-accent focus:text-ink data-[state=open]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      data-slot="dropdown-menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRight aria-hidden className="ml-auto size-3.5 text-sub" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        className={cn(
          'cove-pop z-50 min-w-[9rem] overflow-hidden rounded-card border border-border bg-card p-1 shadow-lg',
          className,
        )}
        data-slot="dropdown-menu-sub-content"
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/**
 * A menu row that is one of a set, where the set is short enough to show every
 * option at once — theme, language.
 *
 * No indicator slot: with two or three rows a checkmark costs a column of
 * padding to say what weight and colour already say. Radix still reports
 * `aria-checked`, so nothing is lost to a screen reader.
 */
function DropdownMenuRadioItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md px-2.5 py-1.5 text-[14px] font-medium text-sub outline-none transition-colors',
        'focus:bg-accent focus:text-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink',
        className,
      )}
      data-slot="dropdown-menu-radio-item"
      {...props}
    />
  );
}

/**
 * A menu row that toggles rather than selects.
 *
 * Beside `RadioItem` rather than replacing it: a radio group answers "which
 * one of these", and there are still menus that mean that. This answers "which
 * of these", which is what a membership's roles are.
 *
 * The tick is rendered by the caller in the row's own content, as `RadioItem`
 * does, so a menu can put it wherever its layout wants.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md px-2.5 py-1.5 text-[14px] font-medium text-sub outline-none transition-colors',
        'focus:bg-accent focus:text-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
      data-slot="dropdown-menu-checkbox-item"
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="ml-auto">
        <Check aria-hidden className="size-3.5 text-brand" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 text-[12px] font-bold text-sub', className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
};
