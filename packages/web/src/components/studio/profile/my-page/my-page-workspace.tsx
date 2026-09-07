'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Modal, ModalContent, Skeleton } from '@/components/studio/primitives';
import { Button } from '@/components/studio/button';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useMyPage } from './use-my-page';
import { accentStyle } from '@/components/studio/profile/accent';
import { routes } from '@/lib/routes';
import { AcademySections } from './academy-sections';
import { AccountSections } from './account-sections';
import { IdentityCard } from './identity-card';

/**
 * One narrow reading column, in role order, at both of My Page's entrances.
 *
 * A student's academy profile comes before their account settings because
 * correcting a school name is what they came for; staff see their teaching
 * profile and assignments first for the same reason. Nothing is behind a tab —
 * someone looking for "where do I change my phone number" should find it by
 * scrolling.
 *
 * ## The two entrances
 *
 * `academyId` is the whole difference. Inside an academy — `/academy/{slug}/me`
 * — it names that academy, its profile sections render, and the strip of
 * academies at the foot of the identity card is a way across to the others.
 * At `/account` it is null: the reader is not standing in an academy, so no
 * academy profile is fetched and none is shown, and that same strip becomes
 * the way in.
 *
 * There is no third state where the page picks an academy for itself. It used
 * to — query, then local storage, then the first membership — and the cost was
 * a profile that opened on whichever academy the browser last remembered,
 * with no address to link to and nothing in the URL to say which one you were
 * editing.
 */
export function MyPageWorkspace({
  academy: scope,
}: {
  /**
   * The academy this page is for, or null at `/account`.
   *
   * The slug travels beside the id rather than being looked up from the
   * memberships list: the framed route has it from the URL segment before any
   * query resolves, and `AcademyProfileContext` does not carry one — which is
   * how the old workspace ended up reading it out of the selection it also
   * used to decide which academy to show.
   */
  academy: { id: string; slug: string } | null;
}) {
  const { t } = useTranslation('profile');
  const errorText = useErrorText();
  const router = useRouter();

  const academyId = scope?.id ?? null;
  const page = useMyPage({ academyId });
  const { profile, academy } = page;
  // Its own memo so the callback below has a stable dependency: a fresh `[]`
  // on every render made `goToAcademy` a new function on every render, which
  // is the whole thing `useCallback` is there to prevent.
  const memberships = useMemo(() => profile?.memberships ?? [], [profile]);
  const [academyDirty, setAcademyDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!academyDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [academyDirty]);

  /**
   * Moving to another academy is a navigation now, not a swap in place.
   *
   * Which is why the unsaved-changes question still has to be asked here. The
   * `beforeunload` guard above covers a reload or a closed tab; a client-side
   * push is invisible to it, and this used to be the one control that could
   * throw away a half-written academy profile without a word.
   */
  const goToAcademy = useCallback(
    (nextAcademyId: string) => {
      const membership = memberships.find(
        (candidate) => candidate.academyId === nextAcademyId,
      );
      if (!membership || nextAcademyId === academyId) return;
      const href = routes.academyMe(membership.academySlug);
      if (academyDirty) {
        setPendingHref(href);
        return;
      }
      router.push(href);
    },
    [academyDirty, academyId, memberships, router],
  );

  if (!profile) {
    if (page.loading) {
      return (
        <div aria-busy className="space-y-5">
          <span className="sr-only">{t('loading')}</span>
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
        </div>
      );
    }
    return (
      <p
        className="rounded-card border border-danger/25 bg-danger/5 px-5 py-4 text-[14px] font-semibold text-danger"
        role="alert"
      >
        {errorText(page.loadError, t('load_failed'))}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <IdentityCard
        academy={academy}
        image={{
          pending: page.image.pending,
          error: page.image.error,
          onSelect: (file) =>
            page.image.change(
              academyId
                ? { scope: 'ACADEMY', academyId, file }
                : { scope: 'GLOBAL', file },
            ),
          onRemove: () => {
            // Reported through `image.error`, so the rejection is handled and
            // does not surface as an unhandled promise.
            void page.image
              .change(
                academyId
                  ? { scope: 'ACADEMY', academyId, file: null }
                  : { scope: 'GLOBAL', file: null },
              )
              .catch(() => undefined);
          },
        }}
        memberships={memberships}
        onSelectAcademy={goToAcademy}
        profile={profile}
        selectedAcademyId={academyId}
      />

      {academyId ? (
        academy ? (
          // The accent lives on this wrapper and nowhere else, so every academy
          // section inherits one hue and the account zone below inherits none.
          <div className="space-y-5" style={accentStyle(academy.context.role)}>
            <AcademySections
              academy={academy}
              academySlug={scope!.slug}
              onDirtyChange={setAcademyDirty}
              onSaved={page.applyAcademy}
            />
          </div>
        ) : (
          <Skeleton className="h-64 w-full rounded-card" />
        )
      ) : memberships.length === 0 ? (
        <section className="rounded-card border border-dashed border-border bg-card px-6 py-6">
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">
            {t('identity.no_academy_title')}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.65] text-sub">
            {t('identity.no_academy_body')}
          </p>
        </section>
      ) : null}

      <AccountSections
        globalImage={academyId ? {
          pending: page.image.pending,
          error: page.image.error,
          onSelect: (file) => page.image.change({ scope: 'GLOBAL', file }),
          onRemove: () => {
            void page.image
              .change({ scope: 'GLOBAL', file: null })
              .catch(() => undefined);
          },
        } : null}
        onSaved={page.applyProfile}
        profile={profile}
      />

      <Modal
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
        open={pendingHref !== null}
      >
        <ModalContent
          description={t('identity.unsaved_body', {
            section: t('section.academy.title'),
          })}
          title={t('identity.unsaved_title')}
        >
          <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end">
            <Button
              onClick={() => setPendingHref(null)}
              type="button"
              variant="outline"
            >
              {t('identity.unsaved_stay')}
            </Button>
            <Button
              onClick={() => {
                const next = pendingHref;
                setPendingHref(null);
                setAcademyDirty(false);
                if (next) router.push(next);
              }}
              type="button"
              variant="danger"
            >
              {t('identity.unsaved_discard')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
