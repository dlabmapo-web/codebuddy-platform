'use client';

import type { AppErrorCode } from '@cove/shared/errors';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useErrorCode } from '@/i18n/client/use-error-text';

export function ExamFailure({ code, backHref }: { code: string; backHref: string }) {
  const { t } = useTranslation('exam');
  const message = useErrorCode();
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <CircleAlert aria-hidden className="mx-auto size-9 text-sub" />
        <p className="mt-4 text-[15px] font-semibold text-ink">{message(code as AppErrorCode)}</p>
        <Link href={backHref} className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
          <ArrowLeft aria-hidden className="size-4" /> {t('back')}
        </Link>
      </div>
    </main>
  );
}
