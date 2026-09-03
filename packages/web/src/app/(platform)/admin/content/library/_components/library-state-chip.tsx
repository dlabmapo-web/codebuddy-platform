import type { LibraryCourseState, LibrarySyncState } from '@cove/shared';
import {
  Archive,
  ArrowUpCircle,
  CheckCircle2,
  PencilLine,
  Radio,
  PenLine,
  type LucideIcon,
} from 'lucide-react';

/**
 * What a master course is, in one chip.
 *
 * Three states and three existing tokens, which is not a coincidence: the
 * theme already carries `draft` and `retired` because the product already had
 * things that were unfinished and things that were over. A library course is
 * both of those and one more — offered — and `success` is the token that
 * already means live.
 *
 * Hue says what the thing is; nothing here is loud, because none of these
 * three is a fault. The loud colour on this page is reserved for the one
 * number that is: a master whose problems cannot grade.
 */
const courseStates: Record<
  LibraryCourseState,
  { icon: LucideIcon; tone: string }
> = {
  DRAFT: { icon: PenLine, tone: 'bg-draft-soft text-draft' },
  PUBLISHED: { icon: Radio, tone: 'bg-success/10 text-success' },
  RETIRED: { icon: Archive, tone: 'bg-retired-soft text-retired' },
};

export function LibraryStateChip({
  label,
  state,
}: {
  label: string;
  state: LibraryCourseState;
}) {
  const { icon: Icon, tone } = courseStates[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${tone}`}
    >
      <Icon className="size-3.5" strokeWidth={2.5} />
      {label}
    </span>
  );
}

/**
 * Where a branch's copy stands against its master.
 *
 * A separate axis from whether the branch has edited it, and drawn as a
 * separate chip for that reason — the two are independent, and the case that
 * matters most is both at once, where taking a fresh copy would throw the
 * branch's own work away. One merged label would need six strings and none of
 * them would scan.
 *
 * `UP_TO_DATE` is deliberately the quietest of the three. It is the ordinary
 * state of most rows, and a green tick on every line is a green tick nobody
 * reads.
 */
const syncStates: Record<LibrarySyncState, { icon: LucideIcon; tone: string }> =
  {
    UP_TO_DATE: { icon: CheckCircle2, tone: 'bg-canvas text-sub' },
    UPDATE_AVAILABLE: { icon: ArrowUpCircle, tone: 'bg-brand-soft text-brand' },
    SOURCE_RETIRED: { icon: Archive, tone: 'bg-retired-soft text-retired' },
  };

export function LibrarySyncChip({
  label,
  state,
  title,
}: {
  label: string;
  state: LibrarySyncState;
  title?: string;
}) {
  const { icon: Icon, tone } = syncStates[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${tone}`}
      title={title}
    >
      <Icon className="size-3.5" strokeWidth={2.5} />
      {label}
    </span>
  );
}

/**
 * That the branch has edited its copy.
 *
 * Violet, from the identity family rather than the status family, because
 * customization is not a state of health — it is what the copy *is*. It sits
 * beside the sync chip and never replaces it.
 */
export function CustomizedMark({
  label,
  title,
}: {
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-course-b-soft px-2.5 py-1 text-[12.5px] font-bold text-course-b"
      title={title}
    >
      <PencilLine className="size-3.5" strokeWidth={2.5} />
      {label}
    </span>
  );
}
