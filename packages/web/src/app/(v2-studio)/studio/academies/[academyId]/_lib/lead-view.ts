import type {
  BlockerKind,
  BlockerTarget,
  CalibrationVerdict,
  CurriculumAuditAction,
  CurriculumCatalog,
  ExerciseDifficulty,
  OverviewRange,
} from '@cove/shared';
import {
  BookX,
  CalendarClock,
  EyeOff,
  FileQuestion,
  FlaskConical,
  Layers,
  Repeat,
  ScrollText,
  UserRoundX,
  UserRoundSearch,
  type LucideIcon,
} from 'lucide-react';

import type { PanelTone } from '../_components/overview-ui/panel';

/**
 * How curriculum data becomes something on a screen.
 *
 * Presentation only. Every threshold, rate, verdict, and ordering is decided in
 * `@cove/shared` where it can be tested without a browser; what lives here is
 * genuinely about reading — which hue a defect wears, which link fixes it, how
 * a release state is drawn — and it is kept out of the components so a bar and
 * the table beside it cannot describe the same curriculum differently.
 *
 * ## Why this page is coloured the way it is
 *
 * `panel.tsx` sets the rule the four overviews share: a section owns a hue, and
 * the hue answers "which question is this". Orange asks what needs me, blue
 * asks how big this is, violet asks who worked, green asks who is furthest
 * along, teal asks how much effort, amber asks what is not ready, red asks what
 * is blocking them.
 *
 * This page uses all seven, and it does not invent an eighth. The catalog is
 * blue because it is a size. Blockers are red because they are blocking
 * students right now. Recent changes are violet because they are about who
 * worked. Hardest problems are amber because they are what students are not
 * ready for. Calibration is orange because it is the one panel asking the
 * reader to go and change something they wrote. Grind is teal because it counts
 * effort spent. Course reach is green because it is how far along a course is.
 *
 * The rule that does not bend, inherited unchanged: colour identifies a section
 * or a measurement, never a person. There is no student on this page to colour.
 */

/* ------------------------------------------------------------ the spine */

/**
 * The visibility spine: every authored exercise, split by what students can
 * actually reach.
 *
 * This is the page's one signature device, and it is drawn exactly once — at
 * the top, at the size of a claim. A Team Lead's whole job is deciding what is
 * released, and this is the only place in the product where the answer is
 * visible without opening a course.
 *
 * It used to repeat as a thin bar on every row of the course table too. One
 * bar is a subject; a dozen more inside a seven-column table are decoration
 * competing with the figures beside them, so the table prints the fraction and
 * leaves the picture to the top of the page.
 *
 * The three hues are the content-lifecycle tokens used for what they already
 * mean, rather than a severity ramp invented here:
 *
 * - **live** is `brand`, the product's colour for content that is in front of
 *   students.
 * - **hidden** is `retired` slate, and deliberately the calmest of the three.
 *   New content starts hidden by design, so hidden is the ordinary state of
 *   work in progress; painting it amber would have every academy permanently
 *   flagging its own drafts.
 * - **buried** is `draft` amber, because it is the only one of the three that
 *   is a *discrepancy*: the author set it visible and the tree still hides it.
 *   Amber says look at this without saying anything failed, which is exactly
 *   the claim — nothing is broken, something is not what its author thinks.
 */
export type SpineSegment = {
  key: 'live' | 'hidden' | 'buried';
  count: number;
  percent: number;
  fill: string;
  text: string;
};

export function visibilitySpine(exercises: {
  total: number;
  live: number;
  hidden: number;
  buried: number;
}): SpineSegment[] {
  const total = exercises.total;
  const share = (count: number) => (total > 0 ? (count / total) * 100 : 0);
  return [
    {
      key: 'live',
      count: exercises.live,
      percent: share(exercises.live),
      fill: 'bg-brand',
      text: 'text-brand',
    },
    {
      key: 'buried',
      count: exercises.buried,
      percent: share(exercises.buried),
      fill: 'bg-draft',
      text: 'text-draft',
    },
    {
      key: 'hidden',
      count: exercises.hidden,
      percent: share(exercises.hidden),
      fill: 'bg-retired',
      text: 'text-retired',
    },
  ];
}

/* ----------------------------------------------------------- blockers */

/**
 * The tone each defect wears.
 *
 * Two tiers, not seven. Red is reserved for the three defects that are
 * failing a student who is sitting in a class *today* — a course they cannot
 * see, a course with nothing in it, an exercise that cannot grade them. Amber
 * is for the four that are a class not yet ready to run: nobody is being let
 * down this minute, and somebody has to decide something.
 *
 * A seven-step severity ramp was the obvious alternative and it is worse: it
 * implies an ordering between "no teacher" and "no course" that nobody can
 * defend, and it spends the page's most urgent colour on the least urgent row
 * as soon as the list is sorted.
 */
export const blockerTones: Record<BlockerKind, PanelTone> = {
  hidden_course_assigned: 'danger',
  empty_visible_course: 'danger',
  ungradeable_exercise: 'danger',
  unfinished_exercise: 'warning',
  class_without_teacher: 'warning',
  class_teacher_unavailable: 'warning',
  class_without_course: 'warning',
};

/**
 * One icon per defect, so the seven are told apart before they are read.
 *
 * Each draws what the defect literally is — a struck-through eye for a course
 * students cannot see, an empty stack for a course with nothing in it, a flask
 * for an exercise that cannot be graded, a question mark for one with nothing
 * written. §15 requires colour to be accompanied by shape or text; this is the
 * shape half and the count beside it is the text half.
 */
export const blockerIcons: Record<BlockerKind, LucideIcon> = {
  hidden_course_assigned: EyeOff,
  empty_visible_course: Layers,
  ungradeable_exercise: FlaskConical,
  unfinished_exercise: FileQuestion,
  class_without_teacher: UserRoundX,
  class_teacher_unavailable: UserRoundSearch,
  class_without_course: BookX,
};

/**
 * Where a blocker row goes when it is opened.
 *
 * Every row on this page links to the editor that fixes *that* row, never to a
 * list the reader has to search. The target carries every id the route could
 * need and the most specific one wins: an exercise opens its own editor, a
 * course opens its curriculum, a class opens its settings.
 *
 * Returns null rather than a plausible-looking guess when the ids for a route
 * are not all present, so a link that cannot land is not rendered at all.
 */
export function blockerHref(
  academyId: string,
  target: BlockerTarget,
): string | null {
  const base = `/studio/academies/${academyId}`;
  if (target.materialId && target.courseId && target.lectureId) {
    return `${base}/content/courses/${target.courseId}/lectures/${target.lectureId}/exercises/${target.materialId}`;
  }
  if (target.classId) return `${base}/classes/${target.classId}`;
  if (target.courseId) return `${base}/content/courses/${target.courseId}`;
  return null;
}

/** The exercise editor, for the effectiveness panels' drill-downs. */
export function exerciseHref(
  academyId: string,
  courseId: string,
  materialId: string,
): string {
  // The lecture is not in the effectiveness payload — the course route resolves
  // the exercise from its own tree, so the reader still lands on the problem.
  return `/studio/academies/${academyId}/content/courses/${courseId}#exercise-${materialId}`;
}

export function courseHref(academyId: string, courseId: string): string {
  return `/studio/academies/${academyId}/content/courses/${courseId}`;
}

/** One class's settings, where its teacher and its courses are assigned. */
export function classHref(academyId: string, classId: string): string {
  return `/studio/academies/${academyId}/classes/${classId}`;
}

/* -------------------------------------------------------- effectiveness */

/**
 * The two calibration verdicts, as tones.
 *
 * Neither is red. A mislabelled problem is not blocking anybody — it is a
 * description that has drifted from the thing it describes, and the fix is one
 * field. Orange for a problem harder than it claims, because that is the one
 * students meet unprepared; slate for one that is easier, which costs nothing
 * but a wrong expectation.
 */
export const calibrationTones: Record<CalibrationVerdict, PanelTone> = {
  harder_than_labelled: 'primary',
  easier_than_labelled: 'brand',
};

/** The authored difficulty label, wherever it is printed. */
export const difficultyTones: Record<ExerciseDifficulty, string> = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-draft/10 text-draft',
  HARD: 'bg-danger/10 text-danger',
};

/* ------------------------------------------------------------- changes */

/**
 * What kind of act each audited change was, for the icon beside it.
 *
 * Three shapes rather than eighteen: something was written, something was
 * reordered, or something's visibility moved. That is the distinction a Team
 * Lead scanning their own history actually makes, and eighteen icons would be
 * eighteen things to learn for a panel that holds five rows.
 */
export function changeShape(
  action: CurriculumAuditAction,
): 'visibility' | 'order' | 'edit' {
  if (action.endsWith('visibility_changed')) return 'visibility';
  if (action.endsWith('reordered')) return 'order';
  return 'edit';
}

export const changeIcons: Record<
  ReturnType<typeof changeShape>,
  LucideIcon
> = {
  visibility: EyeOff,
  order: Repeat,
  edit: ScrollText,
};

export const changeTimeIcon: LucideIcon = CalendarClock;

/* -------------------------------------------------------------- shared */

/** The ranges this page offers, in the order they widen. */
export const leadRanges: readonly OverviewRange[] = ['7d', '30d', 'all'];

/**
 * Whether the catalog has anything in it at all.
 *
 * An academy with no courses is not a broken page and not a defect: it is a
 * Team Lead's first day. The workspace uses this to choose between the empty
 * invitation and the seven analytical sections, none of which can say anything
 * about a curriculum that does not exist yet.
 */
export function catalogIsEmpty(catalog: CurriculumCatalog): boolean {
  return catalog.courses.total === 0;
}
