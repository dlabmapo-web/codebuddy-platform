import { cookies } from 'next/headers';

import { HeaderControls } from '@/components/studio/header-controls';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/studio/sidebar';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { platformNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getAccount } from '@/lib/orpc-server';

import { PlatformSidebar } from './platform-sidebar';

/**
 * The frame every platform page sits in.
 *
 * Deliberately the same frame as `StudioShell`: the same sidebar furniture, the
 * same sticky header with the account controls at its right, the same
 * `max-w-6xl` column, the same heading block, the same `bleed` escape for a
 * page that lays out its own panels. An operator moving between the console and
 * an academy should feel one product, and a console that invented its own
 * chrome would read as a different application bolted on.
 *
 * What it does not share is the academy switcher, because there is no academy
 * to be in — and the `academyId` every studio surface is scoped by, because
 * this one is scoped to the platform.
 *
 * It owns the translation provider rather than leaving it to each page: the
 * sidebar needs the same namespace the pages do, and it renders outside them.
 */
export async function PlatformShell({
  title,
  description,
  actions,
  bleed = false,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Skip the white content card so a page can lay out its own panels. */
  bleed?: boolean;
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const [{ resources }, viewer, sidebarState] = await Promise.all([
    initTranslations(locale, platformNamespaces),
    readViewer(),
    cookies().then((store) => store.get('cove_sidebar_state')?.value),
  ]);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={platformNamespaces}
      resources={resources}
    >
      <SidebarProvider defaultOpen={sidebarState !== 'false'}>
        <PlatformSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
            <span className="truncate text-[14px] font-semibold text-sub">
              {title}
            </span>
            <HeaderControls account={viewer} className="ml-auto" />
          </header>

          <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[1.7rem] font-extrabold leading-tight">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 max-w-2xl text-[15px] leading-[1.65] text-sub">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="flex gap-2">{actions}</div> : null}
            </div>

            {bleed ? (
              children
            ) : (
              <section className="rounded-card border border-border bg-card p-6">
                {children}
              </section>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageTranslationsProvider>
  );
}

/**
 * The operator's own photo, for the header's My Page control.
 *
 * Always returns an account, even when the lookup fails. `HeaderControls` drops
 * the profile link entirely when handed nothing — so returning null on failure
 * cost an operator the way back to their account, which is exactly what this
 * was meant to protect. An empty shape costs them their initials instead, and
 * `ProfileAvatar` already draws a stand-in for that.
 */
async function readViewer(): Promise<{
  imageUrl: string | null;
  avatarUrl: string | null;
  name: string | null;
}> {
  try {
    const account = await getAccount();
    return {
      imageUrl: account.user.imageUrl,
      avatarUrl: account.user.avatarUrl,
      name: account.user.displayName ?? account.user.username,
    };
  } catch {
    return { imageUrl: null, avatarUrl: null, name: null };
  }
}
