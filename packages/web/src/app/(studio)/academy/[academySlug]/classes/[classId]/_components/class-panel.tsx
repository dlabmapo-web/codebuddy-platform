'use client';

import type { ReactNode } from 'react';

/** The shared frame for the Courses and Students panels. */
export function ClassPanel({
  action,
  body,
  children,
  count,
  heading,
}: {
  action?: ReactNode;
  body: string;
  children: ReactNode;
  count: number;
  heading: string;
}) {
  return (
    <section className="rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
            {heading}
            <span className="font-mono text-[13px] font-bold text-sub tabular-nums">
              {count}
            </span>
          </h2>
          <p className="mt-1 text-[13.5px] leading-5 text-sub">{body}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ClassPanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-5 py-10 text-center text-[14px] leading-6 text-sub">
      {children}
    </p>
  );
}
