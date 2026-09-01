'use client';

import type { PlatformAcademyDetail } from '@cove/shared';
import {
  AlertTriangle,
  BookOpen,
  GraduationCap,
  LayoutGrid,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Panel } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';

/**
 * Whether this academy is working, above everything else on the page.
 *
 * The console used to answer "who belongs to this academy" and stop there,
 * which cannot tell a thriving campus from forty students with no class and no
 * published course. These four blocks answer the question an operator actually
 * arrives with — is it running, and if not what is missing — before any of the
 * administrative detail below.
 *
 * Two rules hold the design together. Every number that can be zero says what
 * zero *means* rather than printing a bare 0, because "0 classes" is a finding
 * and `0` is a shrug. And nothing is red unless somebody should act on it: the
 * three faults in the strip below are the only saturated things on the page,
 * so colour keeps meaning trouble.
 */
export function AcademyVitals({
  academy,
}: {
  academy: PlatformAcademyDetail;
}) {
  const { t } = useTranslation('platform');
  const counts = academy.memberCounts;
  const { classes, content } = academy;

  const faults = [
    classes.withoutTeacher > 0 && {
      key: 'vitals.fault.classes_without_teacher' as const,
      count: classes.withoutTeacher,
      href: `/admin/content/classes?academy=${academy.id}`,
    },
    classes.withoutCourse > 0 && {
      key: 'vitals.fault.classes_without_course' as const,
      count: classes.withoutCourse,
      href: `/admin/content/classes?academy=${academy.id}`,
    },
    content.problemsWithoutTests > 0 && {
      key: 'vitals.fault.problems_without_tests' as const,
      count: content.problemsWithoutTests,
      href: `/admin/content/problems?academy=${academy.id}`,
    },
  ].filter(Boolean) as {
    key:
      | 'vitals.fault.classes_without_teacher'
      | 'vitals.fault.classes_without_course'
      | 'vitals.fault.problems_without_tests';
    count: number;
    href: string;
  }[];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          detail={
            counts.total === 0
              ? t('vitals.people_empty')
              : t('vitals.enrolments', { count: academy.enrolments })
          }
          href={`/admin/users?academy=${academy.id}`}
          icon={Users}
          label={t('vitals.people')}
          value={counts.total}
        />
        <Stat
          detail={
            classes.total === 0
              ? t('vitals.classes_empty')
              : t('vitals.classes_detail', {
                  active: classes.active,
                  archived: classes.archived,
                })
          }
          href={`/admin/content/classes?academy=${academy.id}`}
          icon={LayoutGrid}
          label={t('vitals.classes')}
          value={classes.active}
        />
        <Stat
          detail={
            content.courses === 0
              ? t('vitals.courses_empty')
              : t('vitals.courses_detail', {
                  published: content.publishedCourses,
                  total: content.courses,
                })
          }
          href={`/admin/content/courses?academy=${academy.id}`}
          icon={BookOpen}
          label={t('vitals.courses')}
          value={content.courses}
        />
        <Stat
          detail={
            content.problems === 0
              ? t('vitals.problems_empty')
              : t('vitals.lectures', { count: content.lectures })
          }
          href={`/admin/content/problems?academy=${academy.id}`}
          icon={GraduationCap}
          label={t('vitals.problems')}
          value={content.problems}
        />
      </div>

      {faults.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {faults.map((fault) => (
            <li key={fault.key}>
              <Link
                className="inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-3 py-1.5 text-[13px] font-bold text-danger transition-colors hover:bg-danger hover:text-white"
                href={fault.href}
              >
                <AlertTriangle aria-hidden className="size-3.5" />
                {t(fault.key, { count: fault.count })}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Panel icon={Users} title={t('vitals.roles')}>
        <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
          {(
            [
              ['managers', counts.managers],
              ['team_leads', counts.teamLeads],
              ['teachers', counts.teachers],
              ['students', counts.students],
            ] as const
          ).map(([role, value]) => (
            <Link
              className="group px-4 py-3.5 transition-colors hover:bg-canvas"
              href={`/admin/users?academy=${academy.id}`}
              key={role}
            >
              <span className="block text-[12px] font-semibold uppercase tracking-wide text-sub">
                {t(`role_label.${role}`)}
              </span>
              <span
                className={`mt-0.5 block font-mono text-[24px] font-bold tabular-nums ${
                  // A campus with no manager is the one count on this row that
                  // is a finding rather than a fact.
                  value === 0 && role === 'managers'
                    ? 'text-danger'
                    : value === 0
                      ? 'text-sub/40'
                      : 'text-ink group-hover:text-brand'
                }`}
              >
                {value}
              </span>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Stat({
  detail,
  href,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Link
      className="group rounded-card border border-border bg-card p-4 transition-colors hover:border-brand"
      href={href}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-sub">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span
        className={`mt-1 block font-mono text-[30px] font-bold leading-none tabular-nums ${
          value === 0 ? 'text-sub/40' : 'text-ink group-hover:text-brand'
        }`}
      >
        {value}
      </span>
      <span className="mt-1.5 block text-[12.5px] leading-5 text-sub">
        {detail}
      </span>
    </Link>
  );
}
