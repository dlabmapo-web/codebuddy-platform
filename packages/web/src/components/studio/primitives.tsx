'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ input */

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-sub/60',
        'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- textarea */

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full min-w-0 resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[14px] leading-[1.6] text-ink outline-none transition-colors placeholder:text-sub/60',
        'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

/* -------------------------------------------------------------- separator */

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- skeleton */

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-accent', className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- tooltip */

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          // `text-canvas` inverts with `bg-ink`, so the tooltip stays readable
          // in dark, where `ink` is the near-white end of the scale.
          'z-50 w-fit rounded-md bg-ink px-2.5 py-1.5 text-[13px] font-medium text-canvas',
          className,
        )}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Tooltip with the provider bundled, so callers pass content and a child. */
function Tooltip({
  children,
  content,
  side = 'right',
  hidden = false,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  hidden?: boolean;
}) {
  if (hidden) return <>{children}</>;
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}

/* ------------------------------------------------------------------ sheet */

const Sheet = DialogPrimitive.Root;

function SheetContent({
  className,
  children,
  side = 'left',
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right';
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="cove-overlay fixed inset-0 z-50 bg-ink/40" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex h-full w-72 flex-col bg-sidebar shadow-xl',
          side === 'left' ? 'cove-sheet-left left-0' : 'cove-sheet-right right-0',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          {description ?? title}
        </DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ------------------------------------------------------------------ modal */

const Modal = DialogPrimitive.Root;

/**
 * A centered dialog for focused edits — naming a course, renaming a lecture,
 * confirming a delete. Distinct from `Sheet`, which docks to a screen edge.
 */
function ModalContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="cove-overlay fixed inset-0 z-50 bg-ink/45" />
      <DialogPrimitive.Content
        className={cn(
          'cove-pop fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-modal bg-card shadow-2xl',
          className,
        )}
        {...props}
      >
        <div className="border-b border-border px-6 py-5">
          <DialogPrimitive.Title className="text-[17px] font-extrabold tracking-[-0.02em]">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1.5 text-[14px] leading-[1.55] text-sub">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>
          )}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export {
  Input,
  Modal,
  ModalContent,
  Separator,
  Sheet,
  SheetContent,
  Skeleton,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
};
