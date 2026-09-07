import {
  BarChart3,
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Presentation,
  School,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { JoinRequestKind } from '@cove/shared';

import type { TranslationKey } from '@/i18n';
import { routes } from '@/lib/routes';

import type { PanelTone } from '../overview-ui/panel';

/**
 * Which section of the lobby a row leads to.
 *
 * The id is what the workspace matches a pathname against, so the two cannot
 * drift: a row that exists always has a page, and a page that exists is always
 * reachable from a row.
 */
export type LobbySectionId =
  | 'overview'
  | 'my_courses'
  | 'my_classes'
  | 'records'
  | 'my_points'
  | 'courses'
  | 'classes'
  | 'ranking';

export type LobbyNavItem = {
  id: LobbySectionId;
  /**
   * Always the academy root with a `section` query, never the member address
   * this section will eventually have.
   *
   * These were the member addresses, and every one of them answered 404 for
   * an applicant. Each of those pages calls `requireAcademyRoute`, which
   * refuses a non-member, and `notFound()` terminates the whole route segment
   * — so the framed layout discarding `children` and drawing the lobby was not
   * enough to keep those pages from deciding the response. (The academy root
   * did render, so the exact rule about when a discarded page still runs is
   * not one this code should depend on.)
   *
   * Keeping the lobby on one route removes the question. Exactly one page is
   * ever involved and it is the one the layout already answers for, and moving
   * between sections becomes a same-route navigation that re-resolves nothing
   * on the server.
   */
  href: string;
  icon: LucideIcon;
  /** The row's label, and the heading of the page it opens. */
  labelKey: TranslationKey<'lobby'>;
  /**
   * The hue this section will wear once it holds something.
   *
   * Deliberately the same one: the overview pages already give every section
   * an identity colour, and an applicant who learns that their classes are the
   * violet page should not have to learn it a second time on approval. It is
   * also what stops the lobby reading as seven grey apologies.
   */
  tone: PanelTone;
};

/**
 * What an applicant is shown while they wait, per kind.
 *
 * Two fixed lists rather than `studioNavGroups` with empty permissions. That
 * function's contract is "what may this role see", and an applicant has no
 * role — the request they are waiting on is precisely the decision about which
 * one they get. Passing it an empty set would produce an empty sidebar, which
 * is the fault this exists to avoid.
 *
 * The staff list is the widest staff shape, the one a Manager or Team Lead
 * receives. Somebody approved as a Teacher will find it narrows to theirs, and
 * that is correct: the lobby shows what this academy does, never a promise
 * about what this person will be allowed to do.
 *
 * `hasPoints` gates the two point rows exactly as the member sidebar gates
 * them. An academy that does not run points must not show a child a link to a
 * page about points they cannot earn — and a row that vanishes on approval is
 * worse than one that was never there.
 */
export function lobbyNav({
  academySlug,
  kind,
  hasPoints,
}: {
  academySlug: string;
  kind: JoinRequestKind;
  hasPoints: boolean;
}): LobbyNavItem[] {
  const section = (id: LobbySectionId) =>
    id === 'overview'
      ? routes.academy(academySlug)
      : routes.withQuery(routes.academy(academySlug), { section: id });

  const items: LobbyNavItem[] = [
    {
      id: 'overview',
      href: section('overview'),
      icon: LayoutDashboard,
      labelKey: 'section.overview.heading',
      tone: 'draft',
    },
    {
      id: 'my_courses',
      href: section('my_courses'),
      icon: GraduationCap,
      labelKey: 'section.my_courses.heading',
      tone: 'brand',
    },
  ];

  if (kind === 'STUDENT') {
    items.push({
      id: 'my_classes',
      href: section('my_classes'),
      icon: School,
      labelKey: 'section.my_classes.heading',
      tone: 'peer',
    });
    items.push({
      id: 'records',
      href: section('records'),
      icon: ClipboardList,
      labelKey: 'section.records.heading',
      tone: 'teal',
    });
    if (hasPoints) {
      items.push({
        id: 'my_points',
        href: section('my_points'),
        icon: Trophy,
        labelKey: 'section.my_points.heading',
        tone: 'warning',
      });
    }
    return items;
  }

  items.push({
    id: 'courses',
    href: section('courses'),
    icon: BookOpen,
    labelKey: 'section.courses.heading',
    tone: 'brand',
  });
  items.push({
    id: 'classes',
    href: section('classes'),
    icon: Presentation,
    labelKey: 'section.classes.heading',
    tone: 'peer',
  });
  if (hasPoints) {
    items.push({
      id: 'ranking',
      href: section('ranking'),
      icon: BarChart3,
      labelKey: 'section.ranking.heading',
      tone: 'warning',
    });
  }
  return items;
}

/**
 * Which section the `section` query names.
 *
 * An unknown or absent value resolves to the overview rather than to nothing:
 * it is the one page that answers for anybody, and it still says why
 * everything else is empty. A section this applicant's kind does not have —
 * `ranking` in a student's lobby, a hand-typed value — is not in `items` and
 * therefore falls back too, so the query can never select a page the sidebar
 * does not offer.
 */
export function lobbySectionFor(
  section: string | null,
  items: LobbyNavItem[],
): LobbyNavItem {
  return items.find((item) => item.id === section) ?? items[0]!;
}
