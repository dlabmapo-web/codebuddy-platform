'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Modal, ModalContent, Skeleton } from '@/components/studio/primitives';
import { Button } from '@/components/studio/button';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useMyPage } from '../_hooks/use-my-page';
import { myPagePath } from '../_lib/academy-selection';
import {
  rememberAcademy,
  useRememberedAcademy,
} from '../_lib/remembered-academy';
import { accentStyle } from '@/components/studio/profile/accent';
import { AcademySections } from './academy-sections';
import { AccountSections } from './account-sections';
import { IdentityCard } from './identity-card';

/**
 * One narrow reading column, in role order.
 *
 * A student's academy profile comes before their account settings because
 * correcting a school name is what they came for; staff see their teaching
 * profile and assignments first for the same reason. Nothing is behind a tab —
 * someone looking for "where do I change my phone number" should find it by
 * scrolling.
 */
export function MyPageWorkspace() {
  const { t } = useTranslation('profile');
  const errorText = useErrorText();
  const router = useRouter();
  const requested = useSearchParams().get('academy');

  // A convenience, never a correctness input: the server still authorizes
  // whichever academy this resolves to.
  const remembered = useRememberedAcademy();

  const page = useMyPage({ requested, remembered });
  const { academyId, profile, academy, selection } = page;
  // The academy zone links into that academy's studio routes, and My Page is
  // not one of them, so the slug travels with the selection rather than being
  // read from a route the page never entered.
  const selectedAcademySlug = selection.selected?.academySlug ?? null;
  const [academyDirty, setAcademyDirty] = useState(false);
  const [pendingAcademyId, setPendingAcademyId] = useState<string | null>(null);

  useEffect(() => {
    if (academyId) rememberAcademy(academyId);
  }, [academyId]);

  useEffect(() => {
    // Design §6.1: an academy the caller may not select is removed with replace
    // navigation, so the back button does not walk into it again.
    if (profile && selection.shouldReplaceUrl) {
      router.replace(myPagePath(academyId));
    }
  }, [academyId, profile, router, selection.shouldReplaceUrl]);

  useEffect(() => {
    if (!academyDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [academyDirty]);

  const navigateToAcademy = useCallback(
    (nextAcademyId: string) => router.replace(myPagePath(nextAcademyId)),
    [router],
  );

  const select = useCallback(
    (nextAcademyId: string) => {
      if (nextAcademyId === academyId) return;
      if (academyDirty) {
        setPendingAcademyId(nextAcademyId);
        return;
      }
      navigateToAcademy(nextAcademyId);
    },
    [academyDirty, academyId, navigateToAcademy],
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
        memberships={selection.options}
        onSelectAcademy={select}
        profile={profile}
        selectedAcademyId={academyId}
      />

      {academy && selectedAcademySlug ? (
        // The accent lives on this wrapper and nowhere else, so every academy
        // section inherits one hue and the account zone below inherits none.
        <div className="space-y-5" style={accentStyle(academy.context.role)}>
          <AcademySections
            academy={academy}
            academySlug={selectedAcademySlug}
            onDirtyChange={setAcademyDirty}
            onSaved={page.applyAcademy}
          />
        </div>
      ) : selection.options.length === 0 ? (
        <section className="rounded-card border border-dashed border-border bg-card px-6 py-6">
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">
            {t('identity.no_academy_title')}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.65] text-sub">
            {t('identity.no_academy_body')}
          </p>
        </section>
      ) : (
        <Skeleton className="h-64 w-full rounded-card" />
      )}

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
          if (!open) setPendingAcademyId(null);
        }}
        open={pendingAcademyId !== null}
      >
        <ModalContent
          description={t('identity.unsaved_body', {
            section: t('section.academy.title'),
          })}
          title={t('identity.unsaved_title')}
        >
          <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end">
            <Button
              onClick={() => setPendingAcademyId(null)}
              type="button"
              variant="outline"
            >
              {t('identity.unsaved_stay')}
            </Button>
            <Button
              onClick={() => {
                const next = pendingAcademyId;
                setPendingAcademyId(null);
                setAcademyDirty(false);
                if (next) navigateToAcademy(next);
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
