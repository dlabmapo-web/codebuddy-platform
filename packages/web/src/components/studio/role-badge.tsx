'use client';

import { GraduationCap, ShieldCheck, UserCog, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AcademyRole } from '@cove/shared';

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
  { chip: string; dot: string; icon: LucideIcon }
> = {
  STUDENT: {
    chip: 'bg-brand/10 text-brand',
    dot: 'bg-brand',
    icon: GraduationCap,
  },
  TEACHER: {
    chip: 'bg-peer/10 text-peer',
    dot: 'bg-peer',
    icon: UserRound,
  },
  TEAM_LEAD: {
    chip: 'bg-teal/10 text-teal',
    dot: 'bg-teal',
    icon: ShieldCheck,
  },
  MANAGER: {
    chip: 'bg-primary/10 text-primary',
    dot: 'bg-primary',
    icon: UserCog,
  },
};

/** The role's colour as a plain dot, for menus that align their own labels. */
export function roleDotClass(role: AcademyRole): string {
  return roleStyles[role].dot;
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
