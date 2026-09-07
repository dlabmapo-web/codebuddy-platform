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

/*
 * Re-exported rather than defined here: the loading shapes live together in
 * `skeletons.tsx`, and this keeps the existing `from '@/components/studio/
 * primitives'` imports working while they inherit the shared sweep.
 */
export { Skeleton } from './skeletons';

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
          /*
           * The academy's blue, not the web's default black bubble.
           *
           * A tooltip here is almost always naming a collapsed sidebar icon —
           * the reader has hidden the labels and is asking for one back. Brand
           * is what the product already uses to mean "this is the thing you
           * are pointing at": the active sidebar item, the primary button, the
           * links in the table. A near-black bubble belonged to no design in
           * particular, and a plain card read as a second, quieter panel
           * floating over the first.
           *
           * The pale end of the blue, not the solid one. A label is a hint,
           * and a saturated chip carries the weight of a primary button — next
           * to the sidebar's own active item it competed with the thing it was
           * describing. `--brand-soft` behind `--brand` is the same pairing
           * the product uses wherever blue has to be quiet, and it inverts on
           * its own: soft is a near-white wash in light and a deep navy in
           * dark, with `--brand` lightening to stay legible against it.
           */
          'cove-pop z-50 w-fit rounded-lg border border-brand/25 bg-brand-soft px-2.5 py-1.5 text-[13px] font-semibold text-brand shadow-[var(--shadow-card)]',
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
 * The control that opens a `Modal`.
 *
 * Worth using rather than an ordinary button with an `onClick`: Radix returns
 * focus to the element it knows as the trigger when the dialog closes, and a
 * button it has never been told about leaves the caret on `body` — which drops
 * a keyboard reader out of the page at exactly the moment they came back to it.
 */
const ModalTrigger = DialogPrimitive.Trigger;

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
  ModalTrigger,
  Separator,
  Sheet,
  SheetContent,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
};
