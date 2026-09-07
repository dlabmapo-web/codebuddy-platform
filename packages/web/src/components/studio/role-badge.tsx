'use client';

import { GraduationCap, ShieldCheck, UserCog, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AcademyRole, JoinRequestKind } from '@cove/shared';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * The role palette, and the only copy of it outside the manager overview.
 *
 * The hues are not decorative and are not reassigned here. Students carry the
 * academy's blue because they are its subject and its largest population;
 * teachers violet, which is already the product's colour for "the other person
 * in the room"; team leads teal, the colour of measured work; managers the
 * action orange that marks everything a manager personally owns. Green stays
 * out of it — on the control tower green means growth, and a green role would
 * read as the good one.
 *
 * Written as whole class strings because Tailwind reads source text: a
 * composed `bg-${tone}/10` is a class that never ships.
 */
const roleStyles: Record<
  AcademyRole,
  { chip: string; dot: string; selected: string; icon: LucideIcon }
> = {
  STUDENT: {
    chip: 'bg-brand/10 text-brand',
    dot: 'bg-brand',
    selected:
      'data-[state=checked]:bg-brand/10 data-[state=checked]:text-brand data-[state=checked]:focus:bg-brand/15 data-[state=checked]:focus:text-brand',
    icon: GraduationCap,
  },
  TEACHER: {
    chip: 'bg-peer/10 text-peer',
    dot: 'bg-peer',
    selected:
      'data-[state=checked]:bg-peer/10 data-[state=checked]:text-peer data-[state=checked]:focus:bg-peer/15 data-[state=checked]:focus:text-peer',
    icon: UserRound,
  },
  TEAM_LEAD: {
    chip: 'bg-teal/10 text-teal',
    dot: 'bg-teal',
    selected:
      'data-[state=checked]:bg-teal/10 data-[state=checked]:text-teal data-[state=checked]:focus:bg-teal/15 data-[state=checked]:focus:text-teal',
    icon: ShieldCheck,
  },
  MANAGER: {
    chip: 'bg-primary/10 text-primary',
    dot: 'bg-primary',
    selected:
      'data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary data-[state=checked]:focus:bg-primary/15 data-[state=checked]:focus:text-primary',
    icon: UserCog,
  },
};

/** The role's colour as a plain dot, for menus that align their own labels. */
export function roleDotClass(role: AcademyRole): string {
  return roleStyles[role].dot;
}

/**
 * The chosen row of a role menu, wearing the role's colour rather than weight.
 *
 * A checked menu row states its state in bold ink, which is the right default
 * when the options are alternatives of the same kind — languages, themes. The
 * roles are not that: the reader is asking "which hat am I wearing right now",
 * and the answer has a colour they already know from the badge beside their
 * name and from every roster in the academy. Bold ink makes them read four
 * labels to find it; the colour is seen before any of them are read.
 *
 * Keyed off `data-[state=checked]` so the row keeps its resting and hover
 * styles from the menu primitive and only the chosen one is tinted. The
 * `focus` pair is not redundant: the primitive paints a highlighted row in
 * `accent`/`ink`, at the same specificity as a lone data variant, and which of
 * the two won would then come down to the order Tailwind happened to emit
 * them in. Stacked, the chosen row keeps its hue while the pointer is on it.
 */
export function roleSelectedClass(role: AcademyRole): string {
  return roleStyles[role].selected;
}

/**
 * A role, wearing its colour.
 *
 * The same chip the roster and the control tower's composition band use, so a
 * reader learns the four hues once and reads them everywhere. Sized in two
 * steps only: `sm` for dense rows, `md` where it stands alone.
 */
export function RoleBadge({
  className,
  role,
  size = 'sm',
  withIcon = false,
}: {
  className?: string;
  role: AcademyRole;
  size?: 'sm' | 'md';
  withIcon?: boolean;
}) {
  const { t } = useLayoutTranslation('common');
  const { chip, icon: Icon } = roleStyles[role];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-bold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]',
        chip,
        className,
      )}
    >
      {withIcon ? (
        <Icon aria-hidden className="size-3" strokeWidth={2.25} />
      ) : null}
      {t(`role.${role}`)}
    </span>
  );
}

/**
 * What an applicant asked to be, which is not yet a role.
 *
 * ## Why staff is a gradient
 *
 * Every other chip in this file is one flat hue, and this one deliberately is
 * not. "Staff" stands for three roles — teacher, team lead, manager — and
 * which of them this person should be is the entire question the reviewer is
 * about to answer. Painting the chip in any single staff hue would answer it
 * in the queue, before anybody decided: a violet chip reads as "teacher" to a
 * manager who has learned the palette from the roster.
 *
 * So it wears all three, left to right in the order the roles rank, over a
 * violet hairline. It is unmistakably staff, unmistakably colourful, and
 * unmistakably not any one of them — and it cannot be confused with a
 * `RoleBadge`, because no role badge is ever a gradient.
 *
 * The student chip stays flat brand blue. That answer is already whole: there
 * is one student role, and it is the academy's own colour.
 */
export function RequestedKindBadge({
  className,
  kind,
}: {
  className?: string;
  kind: JoinRequestKind;
}) {
  const { t } = useLayoutTranslation('common');
  const staff = kind === 'STAFF';
  const Icon = staff ? ShieldCheck : GraduationCap;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1 ring-inset',
        staff
          ? 'bg-gradient-to-r from-peer/20 via-teal/20 to-primary/20 text-ink ring-peer/25'
          : 'bg-brand/10 text-brand ring-brand/20',
        className,
      )}
    >
      {/* The icon takes the gradient's first stop rather than the label's ink,
          so the chip has a point of real colour to lead with at chip size. */}
      <Icon
        aria-hidden
        className={cn('size-3.5', staff && 'text-peer')}
        strokeWidth={2.25}
      />
      {t(`join_request_kind.${kind}`)}
    </span>
  );
}
