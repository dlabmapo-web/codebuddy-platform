import type { CourseLanguage } from '@cove/shared';

export type MaterialCreationKind = 'explanation' | 'python' | 'pdfPractice' | 'pdf' | 'written' | 'turtle' | 'multipleChoice' | 'shortAnswer' | 'video';

/**
 * The kinds that are code to run. A web course's students code in their own
 * editor, so its picker shows these but does not let them be chosen; the API
 * refuses them as well.
 */
const codingKinds: readonly MaterialCreationKind[] = ['python', 'pdfPractice', 'turtle'];

/** The offered kinds a course of this type cannot hold. */
export function unavailableMaterialKinds(courseLanguage: CourseLanguage | undefined): readonly MaterialCreationKind[] {
  return courseLanguage === 'WEB' ? codingKinds : [];
}

export function availableMaterialKinds(options: {
  courseLanguage?: CourseLanguage;
  editable: boolean;
  exerciseEditable: boolean;
  guiEnabled: boolean;
  multipleChoiceEnabled: boolean;
  shortAnswerEnabled: boolean;
  videoEnabled: boolean;
}): MaterialCreationKind[] {
  const web = options.courseLanguage === 'WEB';
  const kinds: MaterialCreationKind[] = [];
  if (options.exerciseEditable) kinds.push('python');
  if (options.editable) {
    kinds.push('explanation', 'pdfPractice', 'pdf', options.guiEnabled ? 'turtle' : 'written');
    // Turtle stands in for the written response elsewhere. A web course
    // cannot use Turtle, so it keeps the written response beside it.
    if (web && options.guiEnabled) kinds.push('written');
    if (options.multipleChoiceEnabled) kinds.push('multipleChoice');
    if (options.shortAnswerEnabled) kinds.push('shortAnswer');
    if (options.videoEnabled) kinds.push('video');
  }
  // Nothing to offer when every kind left is one the course cannot hold.
  const unavailable = unavailableMaterialKinds(options.courseLanguage);
  return kinds.some((kind) => !unavailable.includes(kind)) ? kinds : [];
}
