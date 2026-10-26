import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export const videoActionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-ink transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

export function VideoAuthorSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-4 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        {hint ? (
          <span className="text-xs font-normal text-sub">{hint}</span>
        ) : null}
        <ChevronDown
          aria-hidden
          className="size-4 text-sub transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="min-w-0 border-t border-border p-4">{children}</div>
    </details>
  );
}
