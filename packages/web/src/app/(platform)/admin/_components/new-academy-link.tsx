'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/studio/button';
import { cn } from '@/lib/utils';

/**
 * The one way into the create flow, as a Client Component.
 *
 * It exists as its own file because `Button` cannot be reached from a Server
 * Component at all — not even for its `buttonVariants`. The module imports
 * Radix's `Slot`, which calls `createContext` while the module is evaluated, so
 * merely importing anything from it puts React context in the RSC graph. Every
 * other server page in Cove avoids this by never importing `Button`; this is
 * the same avoidance, with the button styling still coming from one place.
 */
export function NewAcademyLink({
  label,
  size = 'sm',
  variant = 'outline',
  className,
}: {
  label: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ink';
  className?: string;
}) {
  return (
    <Button asChild className={cn(className)} size={size} variant={variant}>
      <Link href="/admin/academies/new">
        <Plus aria-hidden className="size-4" />
        {label}
      </Link>
    </Button>
  );
}
