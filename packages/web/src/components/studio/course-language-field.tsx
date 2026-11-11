'use client';

import {
  courseLanguages,
  type CourseLanguage,
  type ExerciseLanguage,
} from '@cove/shared';
import { Check } from 'lucide-react';
import * as React from 'react';

import { LanguageIcon } from '@/components/studio/language-icon';

/** Proper names, the same in every locale. */
export const courseLanguageNames: Record<CourseLanguage, string> = {
  PYTHON: 'Python',
  C_CPP: 'C / C++',
};

const courseTone: Record<CourseLanguage, string> = {
  PYTHON: 'bg-lang-python-soft text-lang-python',
  C_CPP: 'bg-lang-cpp-soft text-lang-cpp',
};
/** A course's languages, as marks: Python's, or C's beside C++'s. */
const courseIcons: Record<CourseLanguage, ExerciseLanguage[]> = { PYTHON: ['PYTHON'], C_CPP: ['C', 'CPP'] };

export type CourseLanguageCopy = {
  label: string;
  locked: string;
  options: Record<CourseLanguage, { title: string; description: string }>;
};

/**
 * A course's programming language, as two cards: Python, or C / C++. A C/C++
 * course mixes the two, each problem choosing C or C++. Chosen when the course
 * is created; `locked` once the course holds a problem, which the API enforces
 * as well. The copy comes from the caller, whose page has its own namespace.
 */
export function CourseLanguageField({
  copy,
  locked = false,
  onChange,
  value,
}: {
  copy: CourseLanguageCopy;
  locked?: boolean;
  onChange: (language: CourseLanguage) => void;
  value: CourseLanguage;
}) {
  const name = React.useId();
  return (
    <fieldset className="grid gap-1.5" disabled={locked}>
      <legend className="mb-1.5 text-[14px] font-bold">{copy.label}</legend>
      <div className="grid gap-2">
        {courseLanguages.map((language) => {
          const selected = language === value;
          return (
            <label
              className={`relative flex items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30 ${
                selected ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:border-brand/40'
              } ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              key={language}
            >
              <input
                checked={selected}
                className="sr-only"
                name={name}
                onChange={() => onChange(language)}
                type="radio"
                value={language}
              />
              <span
                aria-hidden
                className={`flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 ${courseTone[language]}`}
              >
                {courseIcons[language].map((icon) => <LanguageIcon className="size-5" key={icon} language={icon} />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-ink">
                  {copy.options[language].title}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
                  {copy.options[language].description}
                </span>
              </span>
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                  selected ? 'border-brand bg-brand text-on-brand' : 'border-border bg-card'
                }`}
              >
                {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
            </label>
          );
        })}
      </div>
      {locked ? <p className="text-[12.5px] leading-5 text-sub">{copy.locked}</p> : null}
    </fieldset>
  );
}

/** The course's language as a badge: beside a title, or in a table's column. */
export function CourseLanguageBadge({ language, className = 'ml-2' }: { language: CourseLanguage; className?: string }) {
  return (
    <span
      className={`${className} inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px align-middle font-mono text-[11.5px] font-bold ${courseTone[language]}`}
    >
      {courseIcons[language].map((icon) => <LanguageIcon className="size-3" key={icon} language={icon} />)}
      {courseLanguageNames[language]}
    </span>
  );
}

const exerciseTone: Record<ExerciseLanguage, string> = {
  PYTHON: 'bg-lang-python-soft text-lang-python',
  C: 'bg-lang-c-soft text-lang-c',
  CPP: 'bg-lang-cpp-soft text-lang-cpp',
};

/** A problem's language on a light surface: Python, C or C++. */
export function ExerciseLanguageBadge({ language, label }: { language: ExerciseLanguage; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${exerciseTone[language]}`}>
      <LanguageIcon className="size-3" language={language} />
      {label}
    </span>
  );
}

/**
 * C or C++ for one problem of a C/C++ course: two segments, coloured as the
 * editor colours each language.
 */
export function ProblemLanguageToggle({
  disabled = false,
  labels,
  onChange,
  value,
}: {
  disabled?: boolean;
  labels: { C: string; CPP: string };
  onChange: (language: 'C' | 'CPP') => void;
  value: ExerciseLanguage;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-canvas p-1">
      {(['C', 'CPP'] as const).map((language) => {
        const selected = value === language;
        return (
          <button
            aria-pressed={selected}
            className={`inline-flex min-w-20 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected ? exerciseTone[language] : 'text-sub hover:text-ink'
            }`}
            disabled={disabled}
            key={language}
            onClick={() => onChange(language)}
            type="button"
          >
            <LanguageIcon className="size-4" language={language} />
            {labels[language]}
          </button>
        );
      })}
    </div>
  );
}

const PythonFacetIcon = ({ className }: { className?: string }) => <LanguageIcon className={className} language="PYTHON" />;
const CCppFacetIcon = ({ className }: { className?: string }) => <LanguageIcon className={className} language="CPP" />;

/** A course table's Language filter: Python, or C / C++. */
export const courseLanguageFacetOptions = [
  { label: courseLanguageNames.PYTHON, value: 'PYTHON', icon: PythonFacetIcon },
  { label: courseLanguageNames.C_CPP, value: 'C_CPP', icon: CCppFacetIcon },
];
