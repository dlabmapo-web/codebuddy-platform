'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import type { AcademyProfileResponse } from '@cove/shared';

import { useTranslation } from 'react-i18next';
import { orpc } from '@/lib/orpc';

import { useProfileSection } from '@/components/studio/profile/use-profile-section';
import {
  fromCommonDraft,
  fromStaffDraft,
  fromStudentDetailDraft,
  fromStudentExpressionDraft,
  toCommonDraft,
  toStaffDraft,
  toStudentDetailDraft,
  toStudentExpressionDraft,
} from '@/components/studio/profile/drafts';
import {
  CommonProfileFields,
  StaffProfileFields,
  StudentDetailFields,
  StudentExpressionFields,
} from '@/components/studio/profile/profile-fields';
import { SectionCard } from '@/components/studio/profile/section-card';

/**
 * The academy zone of My Page.
 *
 * Every section here is coloured by the role held in the selected academy and
 * saves on its own. A student who corrects their school and then gives up on
 * the guardian phone still keeps the school.
 */
export function AcademySections({
  academy,
  onSaved,
  onDirtyChange,
}: {
  academy: AcademyProfileResponse;
  onSaved: (response: AcademyProfileResponse) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const isStudent = academy.context.role === 'STUDENT';
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({});
  const reportDirty = useCallback((section: string, dirty: boolean) => {
    setDirtySections((current) => {
      if (current[section] === dirty) return current;
      return { ...current, [section]: dirty };
    });
  }, []);
  const dirty = Object.values(dirtySections).some(Boolean);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  return (
    <>
      <CommonSection academy={academy} onSaved={onSaved} reportDirty={reportDirty} />
      {isStudent ? (
        <>
          <StudentDetailsSection academy={academy} onSaved={onSaved} reportDirty={reportDirty} />
          <StudentExpressionSection academy={academy} onSaved={onSaved} reportDirty={reportDirty} />
        </>
      ) : (
        <StaffSection academy={academy} onSaved={onSaved} reportDirty={reportDirty} />
      )}
      <LearningContextSection academy={academy} />
    </>
  );
}

function CommonSection({
  academy,
  onSaved,
  reportDirty,
}: {
  academy: AcademyProfileResponse;
  onSaved: (response: AcademyProfileResponse) => void;
  reportDirty: DirtyReporter;
}) {
  const { t } = useTranslation('profile');
  const section = useProfileSection(
    toCommonDraft(academy),
    academy.common.updatedAt,
    useCallback(
      async (draft, expectedUpdatedAt) =>
        onSaved(
          await orpc.academyProfile.updateMine({
            academyId: academy.context.academyId,
            expectedUpdatedAt,
            ...fromCommonDraft(draft),
          }),
        ),
      [academy.context.academyId, onSaved],
    ),
  );
  useReportDirty('common', section.dirty, reportDirty);

  return (
    <SectionCard
      accented
      description={t('section.academy.description', {
        academy: academy.context.academyName,
      })}
      owner="shared"
      section={section}
      title={t('section.academy.title')}
    >
      <CommonProfileFields
        draft={section.draft}
        globalDisplayName={academy.context.globalDisplayName}
        set={section.set}
      />
      <p className="text-[12.5px] leading-[1.5] text-sub/85">
        {t('image.fallback_note')}
      </p>
    </SectionCard>
  );
}

function StudentDetailsSection({
  academy,
  onSaved,
  reportDirty,
}: {
  academy: AcademyProfileResponse;
  onSaved: (response: AcademyProfileResponse) => void;
  reportDirty: DirtyReporter;
}) {
  const { t } = useTranslation('profile');
  const section = useProfileSection(
    toStudentDetailDraft(academy),
    academy.student?.updatedAt ?? null,
    useCallback(
      async (draft, expectedUpdatedAt) =>
        onSaved(
          await orpc.academyProfile.updateStudentDetails({
            academyId: academy.context.academyId,
            expectedUpdatedAt,
            ...fromStudentDetailDraft(draft),
          }),
        ),
      [academy.context.academyId, onSaved],
    ),
  );
  useReportDirty('student-details', section.dirty, reportDirty);

  return (
    <SectionCard
      accented
      description={t('section.student_details.description')}
      owner="shared"
      section={section}
      title={t('section.student_details.title')}
    >
      <StudentDetailFields
        canEditStudentNumber={false}
        draft={section.draft}
        set={section.set}
      />
    </SectionCard>
  );
}

function StudentExpressionSection({
  academy,
  onSaved,
  reportDirty,
}: {
  academy: AcademyProfileResponse;
  onSaved: (response: AcademyProfileResponse) => void;
  reportDirty: DirtyReporter;
}) {
  const { t } = useTranslation('profile');
  const section = useProfileSection(
    toStudentExpressionDraft(academy),
    academy.student?.updatedAt ?? null,
    useCallback(
      async (draft, expectedUpdatedAt) =>
        onSaved(
          await orpc.academyProfile.updateStudentSelfExpression({
            academyId: academy.context.academyId,
            expectedUpdatedAt,
            ...fromStudentExpressionDraft(draft),
          }),
        ),
      [academy.context.academyId, onSaved],
    ),
  );
  useReportDirty('student-expression', section.dirty, reportDirty);

  return (
    <SectionCard
      accented
      description={t('section.student_expression.description')}
      owner="you"
      section={section}
      title={t('section.student_expression.title')}
    >
      <StudentExpressionFields draft={section.draft} set={section.set} />
    </SectionCard>
  );
}

function StaffSection({
  academy,
  onSaved,
  reportDirty,
}: {
  academy: AcademyProfileResponse;
  onSaved: (response: AcademyProfileResponse) => void;
  reportDirty: DirtyReporter;
}) {
  const { t } = useTranslation('profile');
  const section = useProfileSection(
    toStaffDraft(academy),
    academy.staff?.updatedAt ?? null,
    useCallback(
      async (draft, expectedUpdatedAt) =>
        onSaved(
          await orpc.academyProfile.updateStaffProfile({
            academyId: academy.context.academyId,
            expectedUpdatedAt,
            ...fromStaffDraft(draft),
          }),
        ),
      [academy.context.academyId, onSaved],
    ),
  );
  useReportDirty('staff', section.dirty, reportDirty);

  return (
    <SectionCard
      accented
      description={t('section.staff.description')}
      owner="shared"
      section={section}
      title={t('section.staff.title')}
    >
      <StaffProfileFields
        canEditEmployment={false}
        draft={section.draft}
        set={section.set}
      />
    </SectionCard>
  );
}

type DirtyReporter = (section: string, dirty: boolean) => void;

function useReportDirty(
  section: string,
  dirty: boolean,
  reportDirty: DirtyReporter,
) {
  useEffect(() => {
    reportDirty(section, dirty);
    return () => reportDirty(section, false);
  }, [dirty, reportDirty, section]);
}

/**
 * Where this person is, right now: classes for a student, assigned classes for
 * a teacher, an authority summary for a lead or manager.
 *
 * Read-only by construction. My Page shows enough to navigate from, and stops
 * well short of becoming a second dashboard.
 */
function LearningContextSection({
  academy,
}: {
  academy: AcademyProfileResponse;
}) {
  const { t } = useTranslation('profile');
  const isStudent = academy.context.role === 'STUDENT';
  const base = `/studio/academies/${academy.context.academyId}`;

  if (!isStudent && academy.classes.length === 0) {
    const role = academy.context.role;
    if (role === 'TEAM_LEAD' || role === 'MANAGER') {
      return (
        <SectionCard
          accented
          description={t('section.authority.description')}
          owner="read_only"
          title={t('section.authority.title')}
        >
          <p className="flex gap-3 text-[14px] leading-[1.6] text-ink">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-[color:var(--accent-hue)]"
              strokeWidth={1.75}
            />
            {t(`authority.${role}`)}
          </p>
          <div className="flex flex-wrap gap-2">
            <ContextLink href={`${base}/members`} label={t('action.manage_members')} />
            <ContextLink href={`${base}/classes`} label={t('action.manage_classes')} />
          </div>
          <p className="text-[12.5px] leading-[1.5] text-sub/85">
            {t('authority.note')}
          </p>
        </SectionCard>
      );
    }
  }

  return (
    <SectionCard
      accented
      description={
        isStudent
          ? t('section.learning.description')
          : t('section.teaching.description')
      }
      owner="read_only"
      title={isStudent ? t('section.learning.title') : t('section.teaching.title')}
    >
      {academy.classes.length === 0 ? (
        <p className="text-[14px] text-sub">
          {isStudent ? t('learning.classes_empty') : t('learning.teaching_empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {academy.classes.map((entry) => (
            <li key={entry.id}>
              <Link
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-[color:var(--accent-hue)]/60 hover:bg-[color:var(--accent-tint)]/60"
                href={
                  isStudent
                    ? `${base}/learn/classes`
                    : `${base}/teach/classes/${entry.id}`
                }
              >
                <GraduationCap
                  aria-hidden
                  className="size-4 shrink-0 text-[color:var(--accent-hue)]"
                  strokeWidth={2}
                />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                  {entry.name}
                </span>
                <span className="shrink-0 text-[12.5px] tabular text-sub">
                  {t('learning.class_meta', {
                    courses: entry.courseCount,
                    students: entry.studentCount,
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isStudent ? (
        <div className="space-y-2 border-t border-border pt-4">
          {academy.courses.length === 0 ? (
            <p className="text-[14px] text-sub">{t('learning.courses_empty')}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {academy.courses.map((course) => (
                <li key={`${course.id}-${course.className}`}>
                  <Link
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-[color:var(--accent-hue)]/60 hover:text-ink"
                    href={`${base}/learn/courses`}
                  >
                    <BookOpen
                      aria-hidden
                      className="size-3.5 text-[color:var(--accent-hue)]"
                      strokeWidth={2}
                    />
                    {course.title}
                    <span className="text-[11.5px] font-medium text-sub">
                      {t('learning.course_in', { className: course.className })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}

function ContextLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-[13px] font-semibold text-sub transition-colors hover:border-[color:var(--accent-hue)]/60 hover:text-ink"
      href={href}
    >
      {label}
    </Link>
  );
}
