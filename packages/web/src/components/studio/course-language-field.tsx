'use client';

import { exerciseLanguages, type ExerciseLanguage } from '@cove/shared';

/** Proper names, the same in every locale. */
export const courseLanguageNames: Record<ExerciseLanguage, string> = {
  PYTHON: 'Python',
  C: 'C',
  CPP: 'C++',
};

/**
 * A course's programming language: every coding problem in the course is
 * written and graded in it. Chosen when the course is created; `locked` once
 * the course holds a problem, which the API enforces as well.
 *
 * The copy comes from the caller, whose page has its own namespace.
 */
export function CourseLanguageField({
  copy,
  locked = false,
  onChange,
  value,
}: {
  copy: { label: string; hint: string; locked: string };
  locked?: boolean;
  onChange: (language: ExerciseLanguage) => void;
  value: ExerciseLanguage;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[14px] font-bold">{copy.label}</span>
      <select
        aria-describedby="course-language-note"
        className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
        disabled={locked}
        onChange={(event) => onChange(event.target.value as ExerciseLanguage)}
        value={value}
      >
        {exerciseLanguages.map((language) => (
          <option key={language} value={language}>
            {courseLanguageNames[language]}
          </option>
        ))}
      </select>
      <span className="text-[12.5px] leading-5 text-sub" id="course-language-note">
        {locked ? copy.locked : copy.hint}
      </span>
    </label>
  );
}

/** The course's language beside its title, wherever courses are chosen. */
export function CourseLanguageBadge({ language }: { language: ExerciseLanguage }) {
  return (
    <span className="ml-2 inline-flex rounded border border-border bg-canvas px-1.5 py-px align-middle font-mono text-[11.5px] font-semibold text-sub">
      {courseLanguageNames[language]}
    </span>
  );
}
