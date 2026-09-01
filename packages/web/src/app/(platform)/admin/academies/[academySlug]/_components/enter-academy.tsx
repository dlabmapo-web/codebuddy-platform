'use client';

import type { PlatformAcademyDetail, PlatformViewRole } from '@cove/shared';
import { platformViewRoles } from '@cove/shared';
import {
  BookMarked,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { routes } from '@/lib/routes';

import { enterAcademyAs } from '../../../_lib/enter-academy';

const roleIcons: Record<
  PlatformViewRole,
  React.ComponentType<{ className?: string }>
> = {
  MANAGER: LayoutDashboard,
  TEAM_LEAD: BookMarked,
  TEACHER: GraduationCap,
};

const roleTones: Record<PlatformViewRole, string> = {
  MANAGER: 'bg-course-a-soft text-course-a',
  TEAM_LEAD: 'bg-course-b-soft text-course-b',
  TEACHER: 'bg-course-c-soft text-course-c',
};

/**
 * A diagnostic trip into the academy's own studio as one of its roles.
 *
 * Course and class administration never uses this selection: those links stay
 * in the console and its RPC clients deliberately ignore this role cookie.
 */
export function EnterAcademyPanel({
  academy,
}: {
  academy: PlatformAcademyDetail;
}) {
  const { t } = useTranslation('platform-support');
  const [role, setRole] = React.useState<PlatformViewRole>('MANAGER');

  if (academy.status === 'ARCHIVED') return null;

  return (
    <section className="rounded-card border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[15px] font-bold text-ink">{t('enter.title')}</h2>
          <p className="mt-1 text-[13.5px] leading-6 text-sub">
            {t('enter.description')}
          </p>
        </div>
        <Button
          onClick={() =>
            enterAcademyAs(role, routes.academy(academy.slug))
          }
          variant="outline"
        >
          <DoorOpen className="size-4" />
          {t('enter.cta')}
        </Button>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[12px] font-semibold uppercase tracking-wide text-sub">
          {t('enter.as')}
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {platformViewRoles.map((option) => {
            const Icon = roleIcons[option];
            const active = role === option;
            return (
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  active
                    ? 'border-brand bg-brand-soft'
                    : 'border-border hover:border-brand/50'
                }`}
                key={option}
              >
                <input
                  checked={active}
                  className="sr-only"
                  name="view-role"
                  onChange={() => setRole(option)}
                  type="radio"
                />
                <span
                  aria-hidden
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${roleTones[option]}`}
                >
                  <Icon className="size-[1.05rem]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold text-ink">
                    {t(`role_view.${option}`)}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
                    {t(`role_view_hint.${option}`)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3.5 text-[13px]">
        <span className="text-sub">{t('enter.session_hint')}</span>
        <Link
          className="font-bold text-brand hover:underline"
          href={`/admin/access/new?academy=${academy.id}`}
        >
          {t('enter.open_session')}
        </Link>
        <Link
          className="inline-flex items-center gap-1.5 text-sub hover:text-brand"
          href={`/admin/audit?academy=${academy.id}`}
        >
          <ScrollText className="size-3.5" />
          {t('detail.activity')}
        </Link>
      </div>
    </section>
  );
}
