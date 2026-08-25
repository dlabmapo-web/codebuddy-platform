'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { rememberExerciseNavigation } from '@/lib/workspace/exercise-history';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** A normal Next link that records the trusted same-tab page behind it. */
export function TrackedExerciseLink({ href, onNavigate, ...props }: Props) {
  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        rememberExerciseNavigation(window.sessionStorage, {
          destination: href,
          source: window.location.href,
          origin: window.location.origin,
        });
        onNavigate?.(event);
      }}
    />
  );
}

/** Use for non-anchor controls, such as a clickable data-table row. */
export function rememberProgrammaticExerciseNavigation(href: string): void {
  rememberExerciseNavigation(window.sessionStorage, {
    destination: href,
    source: window.location.href,
    origin: window.location.origin,
  });
}
