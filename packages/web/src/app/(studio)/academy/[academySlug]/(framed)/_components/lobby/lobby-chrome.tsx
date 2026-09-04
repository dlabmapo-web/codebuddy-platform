import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { HeaderControls } from '@/components/studio/header-controls';
import { NotificationsMount } from '@/components/studio/notifications/notifications-mount';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/studio/sidebar';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { lobbyNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { lobbyAcademy } from '@/lib/academy-route';
import { getAccount } from '@/lib/orpc-server';

import { LobbySidebar } from './lobby-sidebar';
import { LobbyWorkspace } from './lobby-workspace';

/**
 * The frame somebody waiting for approval reads the academy inside.
 *
 * Structurally identical to `StudioChrome` — the same sidebar provider, the
 * same sticky bar, the same header controls — because a lobby that looked like
 * a different product would defeat the point of having one. What differs is
 * what it can fetch: `lobby.academy` and `auth.me`, and nothing else. No
 * roster, no catalog, no counts, no feature reads through a membership that
 * does not exist.
 *
 * It renders the workspace itself rather than `children`. That is the load-
 * bearing decision: no page under `(framed)` executes for an applicant, so
 * safety comes from the structure of the tree rather than from thirty pages
 * each remembering to check who is reading them.
 */
export async function LobbyChrome({ academySlug }: { academySlug: string }) {
  // Memoised per request, and the route guard has already asked, so this is a
  // map lookup rather than a second round trip.
  const lobby = await lobbyAcademy(academySlug);
  // The guard resolved this same memoised read a moment ago, so a miss here
  // means the application was withdrawn or decided mid-render. 404 rather than
  // a blank frame: an empty page with a sidebar is the one outcome that looks
  // like a fault instead of an answer.
  if (!lobby) notFound();

  let viewer: {
    imageUrl: string | null;
    avatarUrl: string | null;
    name: string | null;
  } | null = null;
  try {
    const account = await getAccount();
    viewer = {
      imageUrl: account.user.imageUrl,
      avatarUrl: account.user.avatarUrl,
      name: account.user.displayName ?? account.user.username,
    };
  } catch {
    // The lobby is not worth a redirect to sign-in on a failed profile read:
    // the frame renders without an avatar and every other part still answers.
    viewer = null;
  }

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, lobbyNamespaces);
  const sidebarState = (await cookies()).get('cove_sidebar_state')?.value;

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={lobbyNamespaces}
      resources={resources}
    >
      <SidebarProvider defaultOpen={sidebarState !== 'false'}>
        <LobbySidebar
          academyName={lobby.name}
          academySlug={academySlug}
          hasPoints={lobby.hasPoints}
          requestedKind={lobby.application.requestedKind}
        />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
            <span className="truncate text-[14px] font-semibold text-sub">
              {lobby.name}
            </span>
            <HeaderControls
              account={viewer ?? undefined}
              className="ml-auto"
              notifications={<NotificationsMount />}
            />
          </header>
          <LobbyWorkspace
            academyName={lobby.name}
            academySlug={academySlug}
            appliedAt={lobby.application.createdAt}
            hasPoints={lobby.hasPoints}
            requestId={lobby.application.id}
            requestedKind={lobby.application.requestedKind}
          />
        </SidebarInset>
      </SidebarProvider>
    </PageTranslationsProvider>
  );
}
