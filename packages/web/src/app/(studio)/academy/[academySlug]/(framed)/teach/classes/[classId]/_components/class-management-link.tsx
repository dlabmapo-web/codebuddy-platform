'use client';

import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/studio/button';

/** Keep the Radix-backed Button outside the server component import graph. */
export function ClassManagementLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" className="border-brand/20 bg-brand-soft text-brand hover:border-brand/40 hover:bg-brand/15">
      <Link href={href}>
        <Pencil aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
