'use client';

import { useId, useState } from 'react';
import {
  codingInterestLimit,
  codingInterests,
  guardianRelationships,
  isKnownSchoolGrade,
  schoolGrades,
  teachingLanguageLimit,
  teachingLanguages,
  teachingSpecialties,
  teachingSpecialtyLimit,
  type CodingInterest,
  type GuardianRelationship,
  type TeachingLanguage,
  type TeachingSpecialty,
} from '@cove/shared';

import { Input } from '@/components/studio/primitives';
import { useTranslation } from 'react-i18next';

import {
  ChipField,
  Field,
  FieldRow,
  ReadOnlyField,
  SelectField,
  TextAreaField,
  TextField,
} from './fields';

/**
 * The field groups themselves, with no opinion about how they are saved.
 *
 * My Page wraps each one in its own independently saved section; the manager's
 * member route wraps the same groups in a single form. Sharing the fields and
 * not the save is deliberate: the two routes genuinely differ in how a save
 * behaves, and they must not differ at all in what a field means.
 */

export type CommonDraft = {
  academyDisplayName: string;
  contactPhone: string;
};

export type StudentDetailDraft = {
  dateOfBirth: string;
  schoolName: string;
  schoolGrade: string;
  guardianName: string;
  guardianRelationship: GuardianRelationship | '';
  guardianPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  studentNumber: string;
};

export type StudentExpressionDraft = {
  codingInterests: CodingInterest[];
  learningGoal: string;
};

export type StaffDraft = {
  bio: string;
  specialties: TeachingSpecialty[];
  teachingLanguages: TeachingLanguage[];
  academyTitle: string;
  employeeNumber: string;
};

export function CommonProfileFields({
  draft,
  set,
  globalDisplayName,
}: {
  draft: CommonDraft;
  set: (patch: Partial<CommonDraft>) => void;
  globalDisplayName: string | null;
}) {
  const { t } = useTranslation('profile');
  return (
    <FieldRow>
      <TextField
        help={t('field.academy_display_name_help')}
        label={t('field.academy_display_name')}
        maxLength={60}
        onChange={(value) => set({ academyDisplayName: value })}
        optional={t('field.optional')}
        placeholder={globalDisplayName ?? ''}
        value={draft.academyDisplayName}
      />
      <TextField
        help={t('field.academy_contact_phone_help')}
        inputMode="tel"
        label={t('field.academy_contact_phone')}
        maxLength={32}
        onChange={(value) => set({ contactPhone: value })}
        optional={t('field.optional')}
        value={draft.contactPhone}
      />
    </FieldRow>
  );
}

export function StudentDetailFields({
  draft,
  set,
  canEditStudentNumber,
}: {
  draft: StudentDetailDraft;
  set: (patch: Partial<StudentDetailDraft>) => void;
  /** The number is the academy's record. A student reads it and no more. */
  canEditStudentNumber: boolean;
}) {
  const { t } = useTranslation('profile');
  return (
    <>
      <FieldRow>
        <Field
          htmlFor="profile-date-of-birth"
          label={t('field.date_of_birth')}
          optional={t('field.optional')}
        >
          <Input
            id="profile-date-of-birth"
            // Bounded in the browser too, so a mis-keyed year is caught at the
            // control rather than after a round trip.
            max={new Date().toISOString().slice(0, 10)}
            min="1900-01-01"
            onChange={(event) => set({ dateOfBirth: event.target.value })}
            type="date"
            value={draft.dateOfBirth}
          />
        </Field>
        <TextField
          label={t('field.school_name')}
          maxLength={120}
          onChange={(value) => set({ schoolName: value })}
          optional={t('field.optional')}
          value={draft.schoolName}
        />
      </FieldRow>

      <SchoolGradeField
        onChange={(value) => set({ schoolGrade: value })}
        value={draft.schoolGrade}
      />

      <FieldRow>
        <TextField
          label={t('field.guardian_name')}
          maxLength={60}
          onChange={(value) => set({ guardianName: value })}
          optional={t('field.optional')}
          value={draft.guardianName}
        />
        <SelectField
          emptyLabel={t('field.none')}
          label={t('field.guardian_relationship')}
          onChange={(value) =>
            set({ guardianRelationship: (value ?? '') as GuardianRelationship | '' })}
          optional={t('field.optional')}
          options={guardianRelationships.map((code) => ({
            value: code,
            label: t(`relationship.${code}`),
          }))}
          value={draft.guardianRelationship || null}
        />
      </FieldRow>

      <FieldRow>
        <TextField
          inputMode="tel"
          label={t('field.guardian_phone')}
          maxLength={32}
          onChange={(value) => set({ guardianPhone: value })}
          optional={t('field.optional')}
          value={draft.guardianPhone}
        />
        <TextField
          label={t('field.emergency_contact_name')}
          maxLength={60}
          onChange={(value) => set({ emergencyContactName: value })}
          optional={t('field.optional')}
          value={draft.emergencyContactName}
        />
      </FieldRow>

      <FieldRow>
        <TextField
          inputMode="tel"
          label={t('field.emergency_contact_phone')}
          maxLength={32}
          onChange={(value) => set({ emergencyContactPhone: value })}
          optional={t('field.optional')}
          value={draft.emergencyContactPhone}
        />
        {canEditStudentNumber ? (
          <TextField
            label={t('field.student_number')}
            maxLength={40}
            onChange={(value) => set({ studentNumber: value })}
            optional={t('field.optional')}
            value={draft.studentNumber}
          />
        ) : (
          <ReadOnlyField
            emptyLabel={t('field.none')}
            label={t('field.student_number')}
            value={draft.studentNumber || null}
          />
        )}
      </FieldRow>
    </>
  );
}

/**
 * A grade is a localized choice with a free-text escape.
 *
 * A student at an international school, on a gap year, or taking a university
 * course has a real answer that no Korean grade list contains, and refusing it
 * would only teach them to leave the field blank.
 */
function SchoolGradeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('profile');
  const customId = useId();
  const storedIsCustom = value !== '' && !isKnownSchoolGrade(value);
  // Held separately from the value so that choosing "Something else" opens an
  // empty box rather than requiring a placeholder value nobody typed.
  const [wantsCustom, setWantsCustom] = useState(storedIsCustom);
  const isCustom = storedIsCustom || wantsCustom;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        emptyLabel={t('field.none')}
        label={t('field.school_grade')}
        onChange={(next) => {
          setWantsCustom(next === 'CUSTOM');
          onChange(next === 'CUSTOM' ? '' : next ?? '');
        }}
        optional={t('field.optional')}
        options={[
          ...schoolGrades.map((code) => ({
            value: code as string,
            label: t(`grade.${code}`),
          })),
          { value: 'CUSTOM', label: t('field.school_grade_custom') },
        ]}
        value={isCustom ? 'CUSTOM' : value || null}
      />
      {isCustom ? (
        <Field htmlFor={customId} label={t('field.school_grade_custom')}>
          <Input
            id={customId}
            maxLength={40}
            onChange={(event) => onChange(event.target.value)}
            value={value}
          />
        </Field>
      ) : null}
    </div>
  );
}

export function StudentExpressionFields({
  draft,
  set,
  readOnly,
}: {
  draft: StudentExpressionDraft;
  set: (patch: Partial<StudentExpressionDraft>) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation('profile');
  return (
    <>
      <ChipField
        help={readOnly ? undefined : t('field.coding_interests_help', {
          count: codingInterestLimit,
        })}
        label={t('field.coding_interests')}
        limit={codingInterestLimit}
        onChange={(value) => set({ codingInterests: value })}
        options={codingInterests.map((code) => ({
          value: code,
          label: t(`interest.${code}`),
        }))}
        readOnly={readOnly}
        value={draft.codingInterests}
      />
      {readOnly ? (
        <ReadOnlyField
          emptyLabel={t('field.none')}
          label={t('field.learning_goal')}
          value={draft.learningGoal || null}
        />
      ) : (
        <TextAreaField
          label={t('field.learning_goal')}
          maxLength={280}
          onChange={(value) => set({ learningGoal: value })}
          optional={t('field.optional')}
          placeholder={t('field.learning_goal_placeholder')}
          remainingLabel={(remaining) =>
            t('field.characters_left', { count: remaining })}
          value={draft.learningGoal}
        />
      )}
    </>
  );
}

export function StaffProfileFields({
  draft,
  set,
  canEditEmployment,
}: {
  draft: StaffDraft;
  set: (patch: Partial<StaffDraft>) => void;
  /** Title and employee number are the academy's record, not the person's. */
  canEditEmployment: boolean;
}) {
  const { t } = useTranslation('profile');
  return (
    <>
      <TextAreaField
        label={t('field.bio')}
        maxLength={280}
        onChange={(value) => set({ bio: value })}
        optional={t('field.optional')}
        placeholder={t('field.bio_placeholder')}
        remainingLabel={(remaining) =>
          t('field.characters_left', { count: remaining })}
        value={draft.bio}
      />
      <ChipField
        label={t('field.specialties')}
        limit={teachingSpecialtyLimit}
        onChange={(value) => set({ specialties: value })}
        options={teachingSpecialties.map((code) => ({
          value: code,
          label: t(`specialty.${code}`),
        }))}
        value={draft.specialties}
      />
      <ChipField
        label={t('field.teaching_languages')}
        limit={teachingLanguageLimit}
        onChange={(value) => set({ teachingLanguages: value })}
        options={teachingLanguages.map((code) => ({
          value: code,
          label: t(`teaching_language.${code}`),
        }))}
        value={draft.teachingLanguages}
      />
      <FieldRow>
        {canEditEmployment ? (
          <>
            <TextField
              label={t('field.academy_title')}
              maxLength={80}
              onChange={(value) => set({ academyTitle: value })}
              optional={t('field.optional')}
              value={draft.academyTitle}
            />
            <TextField
              label={t('field.employee_number')}
              maxLength={40}
              onChange={(value) => set({ employeeNumber: value })}
              optional={t('field.optional')}
              value={draft.employeeNumber}
            />
          </>
        ) : (
          <>
            <ReadOnlyField
              emptyLabel={t('field.none')}
              label={t('field.academy_title')}
              value={draft.academyTitle || null}
            />
            <ReadOnlyField
              emptyLabel={t('field.none')}
              label={t('field.employee_number')}
              value={draft.employeeNumber || null}
            />
          </>
        )}
      </FieldRow>
    </>
  );
}
