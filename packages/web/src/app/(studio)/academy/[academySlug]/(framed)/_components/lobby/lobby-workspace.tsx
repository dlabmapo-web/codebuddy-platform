'use client';

import type { JoinRequestKind } from '@cove/shared';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { EmptyState, Panel } from '../overview-ui/panel';
import { lobbyNav, lobbySectionFor } from './lobby-nav';
import { StatusPlate } from './status-plate';

/**
 * What an applicant reads, whichever of their addresses they are standing on.
 *
 * One client component on one route, rather than a page per section.
 *
 * The whole lobby lives at the academy root and the `section` query says which
 * part of it to draw. The alternative — rows pointing at the member addresses
 * these sections will eventually have — answered 404: those pages call
 * `requireAcademyRoute`, which refuses an applicant, and this layout
 * discarding `children` did not stop them deciding the response.
 *
 * One route also means moving between sections re-renders nothing on the
 * server, and no member page can be reached by an applicant following a link
 * the lobby gave them.
 *
 * Every section but the overview is a `Panel` wearing the hue that section
 * will have once it holds something, with a single sentence inside it. No
 * skeletons: a skeleton that never resolves is a page pretending to load. No
 * disabled buttons: an absent control is honest where a greyed one is a tease.
 */
export function LobbyWorkspace({
  academyName,
  academySlug,
  appliedAt,
  hasPoints,
  requestId,
  requestedKind,
}: {
  academyName: string;
  academySlug: string;
  appliedAt: string;
  hasPoints: boolean;
  requestId: string;
  requestedKind: JoinRequestKind;
}) {
  const { t } = useTranslation('lobby');
  const searchParams = useSearchParams();
  const items = lobbyNav({ academySlug, kind: requestedKind, hasPoints });
  const section = lobbySectionFor(searchParams.get('section'), items);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-7">
      <div className="grid gap-5">
        {/* The plate leads every section, not only the overview. Whatever page
            an applicant lands on, the first thing it answers is why the page
            below it is empty — which is the question they actually have. */}
        <StatusPlate
          academyName={academyName}
          appliedAt={appliedAt}
          requestId={requestId}
          requestedKind={requestedKind}
        />

        {section.id === 'overview' ? null : (
          <Panel
            icon={section.icon}
            title={t(`section.${section.id}.heading` as 'section.my_courses.heading')}
            tone={section.tone}
          >
            <EmptyState
              body={t(`section.${section.id}.body` as 'section.my_courses.body')}
              icon={section.icon}
              title={t(
                `section.${section.id}.title` as 'section.my_courses.title',
              )}
              tone={section.tone}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
