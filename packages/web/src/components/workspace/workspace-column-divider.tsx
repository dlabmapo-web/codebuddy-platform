"use client";
import type { HTMLAttributes } from "react";
/** Shared pointer and keyboard separator for horizontal lesson panes. */
export function WorkspaceColumnDivider({
  label,
  size,
  resizeBy,
  dividerProps,
  className = "hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-brand/40 md:block",
  keyboard = true,
}: {
  label: string;
  size: number;
  resizeBy: (delta: number) => void;
  dividerProps: HTMLAttributes<HTMLDivElement>;
  className?: string;
  keyboard?: boolean;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={25}
      aria-valuemax={70}
      aria-valuenow={Math.round(size)}
      tabIndex={keyboard ? 0 : undefined}
      onKeyDown={(event) => {
        if (!keyboard || !["ArrowLeft", "ArrowRight"].includes(event.key))
          return;
        event.preventDefault();
        resizeBy(event.key === "ArrowLeft" ? -2 : 2);
      }}
      className={
        className +
        " touch-none focus-visible:outline-2 focus-visible:outline-brand"
      }
      {...dividerProps}
    />
  );
}
