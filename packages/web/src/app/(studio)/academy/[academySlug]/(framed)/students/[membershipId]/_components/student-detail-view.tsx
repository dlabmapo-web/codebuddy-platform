'use client';

import { formatPhoneForDisplay, type StudentDetail } from '@cove/shared';
import {
  BookOpen,
  Clock,
  GraduationCap,
  HeartPulse,
  SquarePen,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '@/lib/routes';

import { compactDate } from '../../../_lib/compact-date';
import { rankMarker } from '../../../points/_lib/points-view';
import {
  DetailActions,
  DetailSection,
  Field,
  FieldList,
  HeroFact,
  DetailLink,
  MemberHero,
  RecordAction,
  RecordRow,
  StandingCard,
  StatTile,
} from '../../../_components/member-detail';
import { solutionStatusPath } from '../../../_lib/overview-url';

/**
 * A student as a Manager, a Team Lead, or their teacher sees them.
 *
 * ## What the page leads with
 *
 * Where they stand. Every reader of this page — the manager checking on a
 * child, the team lead comparing classes, the teacher before a lesson — is
 * looking for the same thing first, so the standing board is the first section
 * under the name and the only one carrying a medal. Gold, silver and bronze
 * appear on a first, second and third place and nowhere else, so five classes
 * can be swept at a glance instead of read one number at a time; a student
 * with no position gets no medal, because not being placed is a different
 * fact from placing last.
 *
 * The learning record follows, then the classes they sit in, then the courses
 * those classes teach. Guardian details sit last: only one of the three
 * readers has them, and they are a record rather than a reason to open the
 * page.
 *
 * One column, in that order. A rail down the right split the reading into two
 * paths and left whichever one ran short trailing white space beside the
 * other; there is one story to tell here and it is told top to bottom.
 *
 * What is deliberately not here: a school, a student number, a coding
 * interest, a learning goal. Those are written on the manager's editor and
 * read there. None of them answered a question these three readers open this
 * page with, and each was a labelled em dash taking up a row.
 *
 * A section the reader may not have never arrives, so it is never drawn — no
 * heading, no placeholder. See `member-detail.tsx` for why that is the only
 * honest rendering.
 */
export function StudentDetailView({
  academySlug,
  canOpenClassProgress,
  detail,
}: {
  academySlug: string;
  /**
   * Whether this reader may open Solution status for the classes listed here.
   *
   * True only for a teacher, who reached this page by teaching the student and
   * is therefore shown their own classes and no others. Solution status is a
   * teaching surface bounded by assignment: a Manager or a Team Lead may read
   * every class on this page and open none of them, so drawing the link for
   * them would be a button that answers with a not-found.
   */
  canOpenClassProgress: boolean;
  detail: StudentDetail;
}) {
  const { t, i18n } = useTranslation('member-detail');
  const empty = t('not_set');
  const { identity, classes, guardian, standing, work } = detail;
  const numbers = new Intl.NumberFormat(i18n.language);

  return (
    <div className="space-y-4">
      <MemberHero
        eyebrow={t('student.eyebrow')}
        facts={
          <>
            <HeroFact empty={empty} label={t('student.id')}>
              {identity.username}
            </HeroFact>
            <HeroFact
              empty={t('student.not_joined')}
              label={t('student.joined')}
            >
              {identity.joinedAt
                ? compactDate(identity.joinedAt, i18n.language)
                : null}
            </HeroFact>
          </>
        }
        identity={identity}
        tone="brand"
      />

      {/* Its own full-width section rather than a rail beside the name. Five
          classes in a column two cards wide truncated every one of their
          names, and two classes whose names differ in their last digits became
          the same label twice. */}
      {standing && standing.length > 0 ? (
        <DetailSection
          icon={Trophy}
          title={t('student.section_standing')}
          tone="warning"
        >
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {standing.map((entry) => (
              <StandingCard
                className={entry.className}
                key={entry.classId}
                marker={
                  entry.position ? rankMarker(entry.position) : { kind: 'plain' }
                }
                points={numbers.format(entry.points)}
                pointsLabel={t('student.standing.points')}
                position={
                  entry.position ? `#${numbers.format(entry.position)}` : undefined
                }
                positionLabel={t('student.unranked_hint')}
              />
            ))}
          </div>
        </DetailSection>
      ) : null}

      {/* The four measurements, read across rather than down: they are one
          picture of how much work this child has done, and a two-column field
          list made the reader assemble it. */}
      <DetailSection icon={Target} title={t('student.section.work')} tone="brand">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t('student.work.solved')}
            value={numbers.format(work.solvedProblems)}
          />
          <StatTile
            label={t('student.work.submissions')}
            value={numbers.format(work.submissions)}
          />
          <StatTile
            label={t('student.work.active_time')}
            value={formatActiveTime(work.activeSeconds, i18n.language)}
          />
          <StatTile
            hint={
              work.lastActivityAt
                ? undefined
                : t('student.work.never')
            }
            label={t('student.work.last_active')}
            value={
              work.lastActivityAt
                ? compactDate(work.lastActivityAt, i18n.language)
                : empty
            }
          />
        </div>
        {standing ? (
          <DetailActions>
            <DetailLink
              href={routes.academyStudentPoints(
                academySlug,
                identity.membershipId,
              )}
              icon={Trophy}
              label={t('student.standing.ledger')}
              // The amber the standing board wears: this is where those
              // points came from, so it is the same subject.
              tone="warning"
            />
          </DetailActions>
        ) : null}
      </DetailSection>

      <DetailSection
        icon={Users}
        title={t('student.section.classes')}
        tone="teal"
      >
        {classes.length === 0 ? (
          <p className="text-[14px] text-sub">{t('student.classes.empty')}</p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((entry) => {
              const progress = canOpenClassProgress
                ? solutionStatusPath({
                    academySlug,
                    classId: entry.id,
                    membershipId: identity.membershipId,
                  })
                : null;
              return (
                <RecordRow
                  accentId={entry.id}
                  action={
                    progress ? (
                      <RecordAction
                        href={progress}
                        label={t('student.classes.view_progress')}
                      />
                    ) : null
                  }
                  chips={entry.courses.map((course) => ({
                    id: course.courseId,
                    label: course.title,
                  }))}
                  facts={[
                    {
                      icon: Users,
                      label: t('student.classes.students'),
                      value: numbers.format(entry.studentCount),
                    },
                    {
                      icon: BookOpen,
                      label: t('student.classes.courses'),
                      value: numbers.format(entry.courses.length),
                    },
                  ]}
                  icon={GraduationCap}
                  key={entry.id}
                  meta={entry.teacherName ?? t('student.classes.no_teacher')}
                  name={entry.name}
                />
              );
            })}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        icon={BookOpen}
        title={t('student.section_courses')}
        tone="success"
      >
        {detail.courses.length === 0 ? (
          <p className="text-[14px] text-sub">{t('student.courses_none')}</p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {detail.courses.map((course) => (
              <RecordRow
                accentId={course.courseId}
                chips={course.classNames.map((name) => ({
                  id: name,
                  label: name,
                }))}
                facts={[
                  {
                    icon: Clock,
                    label: t('student.courses_time'),
                    value: formatActiveTime(course.activeSeconds, i18n.language),
                  },
                ]}
                icon={BookOpen}
                key={course.courseId}
                meta={t('student.courses_taught_in', {
                  count: course.classNames.length,
                })}
                name={course.title}
              />
            ))}
          </ul>
        )}
      </DetailSection>

      {/* Academy-private. Absent for a Team Lead and a Teacher, so this whole
          card is absent for them — see `studentAcademyProfileSchema`. */}
      {guardian ? (
        <DetailSection
          icon={HeartPulse}
          title={t('student.section.guardian')}
          tone="primary"
        >
          <FieldList>
            <Field empty={empty} label={t('student.guardian.name')}>
              {guardian.guardianName}
            </Field>
            <Field empty={empty} label={t('student.guardian.relationship')}>
              {guardian.guardianRelationship}
            </Field>
            <Field empty={empty} label={t('student.guardian.phone')}>
              {guardian.guardianPhone ? (
                <span className="font-mono text-[13px] tabular-nums">
                  {formatPhoneForDisplay(guardian.guardianPhone)}
                </span>
              ) : null}
            </Field>
            <Field empty={empty} label={t('student.guardian.emergency_name')}>
              {guardian.emergencyContactName}
            </Field>
            <Field empty={empty} label={t('student.guardian.emergency_phone')}>
              {guardian.emergencyContactPhone ? (
                <span className="font-mono text-[13px] tabular-nums">
                  {formatPhoneForDisplay(guardian.emergencyContactPhone)}
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
            // A manager's own surface, in a manager's own colour.
            tone="primary"
          />
        </DetailActions>
      ) : null}
    </div>
  );
}

/**
 * Active time as hours and minutes, never as a bare number of seconds.
 *
 * Rounded to the minute because that is the resolution the measurement has any
 * claim to — the accumulator counts intervals, not stopwatch time — and a page
 * that printed "3,847 seconds" would be asking the reader to do the division.
 */
function formatActiveTime(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return new Intl.NumberFormat(locale).format(minutes) + 'm';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const number = new Intl.NumberFormat(locale);
  return rest === 0
    ? `${number.format(hours)}h`
    : `${number.format(hours)}h ${rest}m`;
}
