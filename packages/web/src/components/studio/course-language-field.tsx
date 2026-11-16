'use client';

import {
  courseLanguages,
  type CourseLanguage,
  type ExerciseLanguage,
} from '@cove/shared';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';

import { LanguageIcon } from '@/components/studio/language-icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/studio/overlays';

/** Proper names, the same in every locale. */
export const courseLanguageNames: Record<CourseLanguage, string> = {
  PYTHON: 'Python',
  C_CPP: 'C / C++',
  WEB: 'Web',
};

const courseTone: Record<CourseLanguage, string> = {
  PYTHON: 'bg-lang-python-soft text-lang-python',
  C_CPP: 'bg-lang-cpp-soft text-lang-cpp',
  WEB: 'bg-lang-web-soft text-lang-web',
};
/** A course's languages, as marks: Python's, or C's beside C++'s. */
const courseIcons: Record<CourseLanguage, ExerciseLanguage[]> = { PYTHON: ['PYTHON'], C_CPP: ['C', 'CPP'], WEB: [] };

export type CourseLanguageCopy = {
  label: string;
  locked: string;
  options: Record<CourseLanguage, { title: string; description: string }>;
};

/** The type's mark on its tinted tile: the menu's rows and the closed field share it. */
function CourseTypeMark({ language }: { language: CourseLanguage }) {
  return (
    <span
      aria-hidden
      className={`flex h-8 w-[4.25rem] shrink-0 items-center justify-center gap-1 rounded-md ${courseTone[language]}`}
    >
      {language === 'WEB' ? <WebMarks /> : null}
      {courseIcons[language].map((icon) => <LanguageIcon className="size-4" key={icon} language={icon} />)}
    </span>
  );
}

/**
 * A course's type, as one dropdown: Python, C / C++ or Web. The closed field
 * names the choice and the line under it says what that choice means; the menu
 * explains all three. A C/C++ course mixes the two, each problem choosing C or
 * C++. Chosen when the course is created; `locked` once the course holds a
 * problem, which the API enforces as well. The copy comes from the caller,
 * whose page has its own namespace.
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
  const id = React.useId();
  return (
    <div className="grid gap-1.5">
      <span className="text-[14px] font-bold" id={`${id}-label`}>{copy.label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-describedby={`${id}-hint`}
            aria-labelledby={`${id}-label ${id}-value`}
            className="group flex h-12 w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-card pl-2 pr-3 text-left outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 data-[state=open]:border-brand data-[state=open]:ring-2 data-[state=open]:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
            disabled={locked}
            type="button"
          >
            <CourseTypeMark language={value} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink" id={`${id}-value`}>
              {copy.options[value].title}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-sub transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-0 overflow-y-auto rounded-xl p-1.5 shadow-lg"
          sideOffset={6}
        >
          <DropdownMenuRadioGroup
            aria-labelledby={`${id}-label`}
            onValueChange={(next) => onChange(next as CourseLanguage)}
            value={value}
          >
            {courseLanguages.map((language) => (
              <DropdownMenuRadioItem
                className="items-start gap-3 rounded-lg px-2 py-2.5 focus:bg-brand-soft data-[state=checked]:bg-brand-soft"
                key={language}
                value={language}
              >
                <CourseTypeMark language={language} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold text-ink">{copy.options[language].title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">{copy.options[language].description}</span>
                </span>
                {language === value ? <Check aria-hidden className="mt-1.5 size-4 shrink-0 text-brand" strokeWidth={3} /> : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-[12.5px] leading-5 text-sub" id={`${id}-hint`}>
        {locked ? copy.locked : copy.options[value].description}
      </p>
    </div>
  );
}

/** The course's language as a badge: beside a title, or in a table's column. */
export function CourseLanguageBadge({ language, className = 'ml-2' }: { language: CourseLanguage; className?: string }) {
  return (
    <span
      className={`${className} inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px align-middle font-mono text-[11.5px] font-bold ${courseTone[language]}`}
    >
      {language === 'WEB' ? <WebMarks /> : null}{courseIcons[language].map((icon) => <LanguageIcon className="size-3" key={icon} language={icon} />)}
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

const WebFacetIcon = ({ className }: { className?: string }) => <span className={className} aria-hidden>&lt;/&gt;</span>;
function WebMarks() { return <span aria-hidden className="inline-flex gap-0.5 font-mono text-[9px] font-bold"><span>HTML</span><span>CSS</span><span>JS</span></span>; }

/** A course table's Language filter: Python, or C / C++. */
export const courseLanguageFacetOptions = [
  { label: courseLanguageNames.PYTHON, value: 'PYTHON', icon: PythonFacetIcon },
  { label: courseLanguageNames.C_CPP, value: 'C_CPP', icon: CCppFacetIcon },
  { label: courseLanguageNames.WEB, value: 'WEB', icon: WebFacetIcon },
];
