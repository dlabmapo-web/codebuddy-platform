'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, ChevronLeft, Info } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AcademyProfileResponse } from '@cove/shared';

import { Button } from '@/components/studio/button';
import { avatarSourceOf } from '@/components/studio/profile-avatar';
import { Skeleton } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { toApiError } from '@/lib/api-errors';
import { ImagePicker } from '@/app/(v2-studio)/studio/my-page/_components/image-picker';
import { uploadProfileImage } from '@/app/(v2-studio)/studio/my-page/_lib/upload-image';

import { accentStyle } from '@/components/studio/profile/accent';
import {
  fromCommonDraft,
  fromStaffDraft,
  fromStudentDetailDraft,
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

/**
 * A manager correcting one member's academy profile.
 *
 * Deliberately not My Page with an ID in it. The two routes differ in what
 * they may touch — there is no account, no password, and no preferences here —
 * and in how a save behaves: this is one form, one transaction, and one audit
 * record, because a manager fixing a phone number and a school name is doing
 * one thing.
 *
 * Field ownership is stated at the top rather than implied by which inputs
 * happen to be disabled.
 */
export function MemberProfileEditor({
  academyId,
  membershipId,
}: {
  academyId: string;
  membershipId: string;
}) {
  const { t } = useTranslation('profile');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const queryKey = ['profile', 'managed', academyId, membershipId] as const;

  const profileQuery = useQuery<AcademyProfileResponse>({
    queryKey,
    queryFn: () =>
      orpc.academyProfile.getForManager({ academyId, membershipId }),
    retry: false,
  });

  if (profileQuery.isPending) {
    return (
      <div aria-busy className="space-y-4">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <p
        className="rounded-card border border-danger/25 bg-danger/5 px-5 py-4 text-[14px] font-semibold text-danger"
        role="alert"
      >
        {errorText(profileQuery.error, t('manager.not_allowed'))}
      </p>
    );
  }

  return (
    <MemberProfileForm
      onSaved={(response) => queryClient.setQueryData(queryKey, response)}
      profile={profileQuery.data}
    />
  );
}

function MemberProfileForm({
  profile,
  onSaved,
}: {
  profile: AcademyProfileResponse;
  onSaved: (response: AcademyProfileResponse) => void;
}) {
  const { t } = useTranslation('profile');
  const router = useRouter();
  const errorText = useErrorText();
  const isStudent = profile.context.role === 'STUDENT';
  const [common, setCommon] = useState(() => toCommonDraft(profile));
  const [student, setStudent] = useState(() => toStudentDetailDraft(profile));
  const [staff, setStaff] = useState(() => toStaffDraft(profile));
  const [conflict, setConflict] = useState(false);

  const save = useMutation({
    mutationFn: async () =>
      orpc.academyProfile.updateForManager({
        academyId: profile.context.academyId,
        membershipId: profile.context.membershipId,
        common: fromCommonDraft(common),
        commonUpdatedAt: profile.common.updatedAt,
        // Only the block matching the membership's role is sent. The server
        // rejects the other one outright rather than ignoring it, which is what
        // makes a client bug here visible instead of silent.
        student: isStudent
          ? {
            ...fromStudentDetailDraft(student),
            studentNumber: student.studentNumber,
          }
          : null,
        studentUpdatedAt: isStudent ? profile.student?.updatedAt ?? null : null,
        staff: isStudent
          ? null
          : {
            ...fromStaffDraft(staff),
            academyTitle: staff.academyTitle,
            employeeNumber: staff.employeeNumber,
          },
        staffUpdatedAt: isStudent ? null : profile.staff?.updatedAt ?? null,
      }),
    onSuccess: (response) => {
      setConflict(false);
      onSaved(response);
    },
    onError: (error) =>
      setConflict(toApiError(error).code === 'PROFILE_CHANGED'),
  });

  const image = useMutation({
    mutationFn: (file: File | null) =>
      file
        ? uploadProfileImage<AcademyProfileResponse>(file, {
          academyId: profile.context.academyId,
          membershipId: profile.context.membershipId,
        })
        : orpc.academyProfile.removeImage({
          academyId: profile.context.academyId,
          membershipId: profile.context.membershipId,
        }),
    onSuccess: (response) => {
      onSaved(response);
      router.refresh();
    },
  });

  function reload(response: AcademyProfileResponse) {
    setCommon(toCommonDraft(response));
    setStudent(toStudentDetailDraft(response));
    setStaff(toStaffDraft(response));
    setConflict(false);
    save.reset();
  }

  const name = profile.common.academyDisplayName ??
    profile.context.globalDisplayName ??
    profile.context.username ??
    profile.context.email ??
    '';
  const avatar = {
    academyImageUrl: profile.common.image?.url ?? null,
    name,
  };

  return (
    <div className="space-y-5" style={accentStyle(profile.context.role)}>
      {/* Who this is, and what a manager may not touch about them. Stated once,
          at the top, because it is the single most common misunderstanding. */}
      <section className="relative overflow-hidden rounded-card border border-border bg-card px-6 py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[color:var(--accent-tint)] [mask-image:linear-gradient(135deg,black,transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-start gap-5">
          <ImagePicker
            avatar={avatar}
            canRemove={Boolean(profile.common.image)}
            error={image.error}
            name={name}
            onRemove={() => image.mutate(null)}
            onSelect={(file) => image.mutateAsync(file)}
            pending={image.isPending}
            sourceKind={avatarSourceOf(avatar).kind}
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1.55rem] font-extrabold leading-tight tracking-[-0.03em]">
              {name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em]"
                style={{
                  background: 'var(--accent-hue)',
                  color: 'var(--accent-ink)',
                }}
              >
                {t(`role.${profile.context.role}`)}
              </span>
              <span className="text-[13px] text-sub">
                {t(`membership_status.${profile.context.status}`)}
              </span>
              {profile.context.email ? (
                <span className="truncate text-[13px] text-sub">
                  {profile.context.email}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="relative mt-4 flex gap-2.5 border-t border-border pt-4 text-[13px] leading-[1.6] text-sub">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {t('manager.ownership_note')}
        </p>
      </section>

      <ManagedSection title={t('section.academy.title')}>
        <CommonProfileFields
          draft={common}
          globalDisplayName={profile.context.globalDisplayName}
          set={(patch) => setCommon((current) => ({ ...current, ...patch }))}
        />
      </ManagedSection>

      {isStudent ? (
        <>
          <ManagedSection title={t('section.student_details.title')}>
            <StudentDetailFields
              canEditStudentNumber
              draft={student}
              set={(patch) => setStudent((current) => ({ ...current, ...patch }))}
            />
          </ManagedSection>

          {/* Read-only by construction: there is no field here to write, so a
              manager cannot rewrite a student's own words even by accident. */}
          <ManagedSection
            description={t('manager.expression_read_only')}
            title={t('section.student_expression.title')}
          >
            <StudentExpressionFields
              draft={toStudentExpressionDraft(profile)}
              readOnly
              set={() => undefined}
            />
          </ManagedSection>
        </>
      ) : (
        <ManagedSection title={t('section.staff.title')}>
          <StaffProfileFields
            canEditEmployment
            draft={staff}
            set={(patch) => setStaff((current) => ({ ...current, ...patch }))}
          />
        </ManagedSection>
      )}

      {conflict ? (
        <div
          className="rounded-card border border-warning/30 bg-warning/8 px-6 py-4"
          role="alert"
        >
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-warning">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.25} />
            {t('conflict.title')}
          </p>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-sub">
            {t('conflict.body')}
          </p>
          <Button
            className="mt-3"
            onClick={() =>
              void orpc.academyProfile
                .getForManager({
                  academyId: profile.context.academyId,
                  membershipId: profile.context.membershipId,
                })
                .then((response) => {
                  onSaved(response);
                  reload(response);
                })}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('action.reload')}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p aria-live="polite" className="mr-auto text-[13px] font-semibold">
          {save.isSuccess ? (
            <span className="text-success">{t('action.saved')}</span>
          ) : null}
          {save.isError && !conflict ? (
            <span className="text-danger">{errorText(save.error)}</span>
          ) : null}
        </p>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/studio/academies/${profile.context.academyId}/members`}>
            <ChevronLeft aria-hidden strokeWidth={2} />
            {t('manager.back')}
          </Link>
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => save.mutate()}
          type="button"
        >
          {save.isPending ? t('action.saving') : t('action.save')}
        </Button>
      </div>
    </div>
  );
}

function ManagedSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-card border border-border bg-card before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--accent-hue)] before:content-['']">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-[16px] font-extrabold tracking-[-0.02em]">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-[1.6] text-sub">
            {description}
          </p>
        ) : null}
      </header>
      <div className="space-y-5 px-6 py-5">{children}</div>
    </section>
  );
}
