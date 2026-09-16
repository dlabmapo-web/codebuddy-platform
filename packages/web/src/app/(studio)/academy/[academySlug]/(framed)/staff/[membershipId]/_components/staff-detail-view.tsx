'use client';

import { formatPhoneForDisplay, type StaffDetail } from '@cove/shared';
import {
  AtSign,
  BookOpen,
  GraduationCap,
  Presentation,
  SquarePen,
  Users,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '@/lib/routes';

import { compactDate } from '../../../_lib/compact-date';
import { highestRole, roleTones } from '../../../_lib/manager-view';
import {
  DetailActions,
  DetailLink,
  DetailSection,
  Field,
  FieldList,
  HeroFact,
  MemberHero,
  RecordRow,
} from '../../../_components/member-detail';
import { RoleChips } from '../../../_components/people-cells';

/**
 * A teacher as a Manager or a Team Lead sees them.
 *
 * ## What the page leads with
 *
 * The teaching load, not the paperwork. A colleague is looked up to answer
 * "which classes do they run, and can I reach them" — so the classes are the
 * first block and they are the coloured one, each chip carrying its course
 * identity so the reader can match it against a timetable or a student's page
 * without reading every name twice. Homeroom is solid and assisting is tinted,
 * which says which of the two a class is without a second label.
 *
 * One column, top to bottom. A rail down the right split two short blocks
 * across two reading paths and left whichever ran shorter trailing white
 * space beside the other.
 *
 * ## What the page withholds
 *
 * The only difference between the two readers is Contact, which simply does
 * not arrive for a Team Lead and is therefore not drawn. Nothing says a
 * section was withheld: a heading with a lock would tell a Team Lead which of
 * their colleagues have a number on file, which is the fact being withheld.
 */
export function StaffDetailView({
  academySlug,
  detail,
}: {
  academySlug: string;
  detail: StaffDetail;
}) {
  const { t, i18n } = useTranslation('member-detail');
  const { t: tManager } = useTranslation('manager');
  const empty = t('not_set');
  const { identity, classes, contact } = detail;
  // The band and the eyebrow both take the highest role held, so they agree
  // with each other and with the chips beneath them. The list that links here
  // is Teachers, but this page still answers for a manager opened by link,
  // and an eyebrow that called them a teacher would be the one wrong word on
  // an otherwise accurate record.
  const role = highestRole(detail.roles);
  const tone = roleTones[role];
  const teaching = classes.homeroom.length + classes.assistant.length;
  const numbers = new Intl.NumberFormat(i18n.language);

  return (
    <div className="space-y-4">
      <MemberHero
        chips={<RoleChips roles={detail.roles} />}
        eyebrow={tManager(`role.${role}`)}
        facts={
          <>
            <HeroFact empty={empty} label={t('staff.id')}>
              {identity.username}
            </HeroFact>
            <HeroFact empty={t('staff.not_joined')} label={t('staff.joined')}>
              {identity.joinedAt
                ? compactDate(identity.joinedAt, i18n.language)
                : null}
            </HeroFact>
            <HeroFact
              empty={t('staff.teaching_none')}
              label={t('staff.section_teaching')}
            >
              {teaching > 0 ? t('staff.class_count', { count: teaching }) : null}
            </HeroFact>
          </>
        }
        identity={identity}
        subtitle={detail.academyTitle ?? undefined}
        tone={tone}
      />

      <DetailSection
        icon={GraduationCap}
        title={t('staff.section_teaching')}
        tone="teal"
      >
        {teaching === 0 ? (
          <p className="text-[14px] text-sub">{t('staff.teaching_none')}</p>
        ) : (
          <div className="space-y-5">
            {(
              [
                ['homeroom', classes.homeroom],
                ['assistant', classes.assistant],
              ] as const
            ).map(([kind, list]) =>
              list.length === 0 ? null : (
                <div key={kind}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sub">
                    {t(`staff.${kind}`)}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-sub">
                    {t(`staff.${kind}_hint`)}
                  </p>
                  <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((entry) => (
                      <RecordRow
                        accentId={entry.id}
                        chips={entry.courses.map((course) => ({
                          id: course.courseId,
                          label: course.title,
                        }))}
                        facts={[
                          {
                            icon: Users,
                            label: t('staff.class_students'),
                            value: numbers.format(entry.studentCount),
                          },
                          {
                            icon: BookOpen,
                            label: t('staff.class_courses'),
                            value: numbers.format(entry.courses.length),
                          },
                        ]}
                        icon={kind === 'homeroom' ? Presentation : UsersRound}
                        key={entry.id}
                        name={entry.name}
                      />
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        )}
      </DetailSection>

      {/* Absent for a reader who may not manage members. Not hidden — the
          fields never arrived, so there is nothing here to draw. */}
      {contact ? (
        <DetailSection
          icon={AtSign}
          title={t('staff.section.contact')}
          tone={tone}
        >
          <FieldList>
            <Field empty={empty} label={t('staff.contact.email')}>
              {contact.email}
            </Field>
            <Field empty={empty} label={t('staff.contact.phone')}>
              {contact.contactPhone ? (
                <span className="font-mono text-[13px] tabular-nums">
                  {formatPhoneForDisplay(contact.contactPhone)}
                </span>
              ) : null}
            </Field>
            <Field empty={empty} label={t('staff.contact.employee_number')}>
              {contact.employeeNumber ? (
                <span className="font-mono text-[13px] tabular-nums">
                  {contact.employeeNumber}
                </span>
              ) : null}
            </Field>
          </FieldList>
        </DetailSection>
      ) : null}

      {detail.viewer.canManageMembers ? (
        <DetailActions>
          <DetailLink
            href={routes.academyPerson(academySlug, identity.membershipId)}
            icon={SquarePen}
            label={t('edit_profile')}
            tone="primary"
          />
        </DetailActions>
      ) : null}
    </div>
  );
}
