'use client';

import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Show or hide one piece of curriculum from students, right on its row.
 *
 * On an outline row it is the eye that was always there, made pressable: the
 * same place, the same size, the colour saying the state. A curriculum outline
 * is dense, and a switch or a labelled chip beside every chapter, lecture and
 * problem turned the page into controls. In the course list, whose column
 * needs the word, it is the compact pill that list already used.
 *
 * It shows what is true now; pressing it does the opposite. On hover
 * and focus the eye flips to the state a press would produce, which is the
 * signal that it is clickable and what the click will do. Only the icon
 * changes, never the width, so a row does not jostle under the pointer.
 *
 * When the row's own flag is on but an ancestor is hidden, it says so in
 * amber instead of claiming "visible": the flag is honestly on, students
 * honestly cannot see it, and both facts need to be on screen.
 *
 * Copy comes from the caller, which already holds its page's namespace.
 */
export function VisibilityToggle({
  busy = false,
  className,
  disabled = false,
  effectivelyVisible,
  isVisible,
  labels,
  onChange,
  variant = 'icon',
}: {
  busy?: boolean;
  className?: string;
  disabled?: boolean;
  /** Visible to students once ancestors are counted; defaults to `isVisible`. */
  effectivelyVisible?: boolean;
  isVisible: boolean;
  labels: {
    /** Read to assistive technology, e.g. "Show “Loops” to students". */
    action: string;
    visible: string;
    hidden: string;
    /** On, but an ancestor is hidden. */
    hiddenByParent?: string;
    /** Tooltip explaining the current state. */
    tooltip?: string;
  };
  onChange: (next: boolean) => void;
  /**
   * `icon` for outline rows, where the eye alone is the state and a word on
   * every row is noise. `label` where a table column needs the word.
   */
  variant?: 'icon' | 'label';
}) {
  const inherited = isVisible && effectivelyVisible === false;
  const word = !isVisible
    ? labels.hidden
    : inherited
      ? (labels.hiddenByParent ?? labels.hidden)
      : labels.visible;
  const Current = isVisible ? Eye : EyeOff;
  const Next = isVisible ? EyeOff : Eye;
  const tone = !isVisible ? 'hidden' : inherited ? 'inherited' : 'visible';
  const iconSize = variant === 'icon' ? 'size-4' : 'size-3.5';

  return (
    <button
      aria-busy={busy}
      aria-checked={isVisible}
      aria-label={labels.action}
      className={cn(
        'group/visibility inline-flex shrink-0 items-center justify-center transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
        variant === 'icon'
          ? cn(
              'size-7 rounded-md',
              tone === 'visible' && 'text-success hover:bg-success/10',
              tone === 'inherited' && 'text-warning hover:bg-warning/10',
              tone === 'hidden' && 'text-retired hover:bg-retired-soft',
            )
          : cn(
              'h-6 gap-1 rounded-full px-2 text-[12px] font-bold',
              tone === 'visible' && 'bg-success/10 text-success hover:bg-success/15',
              tone === 'inherited' && 'bg-warning/10 text-warning hover:bg-warning/15',
              tone === 'hidden' && 'bg-retired-soft text-retired hover:text-ink',
            ),
        disabled || busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
      data-slot="visibility-toggle"
      data-state={tone}
      disabled={disabled || busy}
      onClick={() => onChange(!isVisible)}
      role="switch"
      title={labels.tooltip ?? word}
      type="button"
    >
      <span aria-hidden className={cn('relative grid shrink-0 place-items-center', iconSize)}>
        {busy ? (
          <span className="cove-spinner block size-3 rounded-full border-2 border-current/25 border-t-current" />
        ) : (
          <>
            <Current className={cn(iconSize, 'transition-opacity duration-150 group-hover/visibility:opacity-0 group-focus-visible/visibility:opacity-0 motion-reduce:transition-none')} />
            <Next className={cn(iconSize, 'absolute inset-0 opacity-0 transition-opacity duration-150 group-hover/visibility:opacity-100 group-focus-visible/visibility:opacity-100 motion-reduce:transition-none')} />
          </>
        )}
      </span>
      {variant === 'label' ? <span aria-hidden>{word}</span> : null}
    </button>
  );
}
