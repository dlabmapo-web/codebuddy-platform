import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { HeaderControls } from '@/components/studio/header-controls';
import { CodePreview } from './code-preview';

export async function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { t } = await getServerTranslation(['auth', 'common']);
  return (
    <main className="min-h-screen w-full bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/*
        Brand panel — desktop only.

        Anchored to the top, not centered. The panel's height is whatever the
        form beside it needs, so a centered message drifted further from the
        wordmark every time the form grew — picking Staff adds an email field,
        a divider and the provider buttons, and the message sank by half of
        that. Fixed to the wordmark instead, the gap is the same on every auth
        screen and at every viewport height; the slack all falls above the
        copyright, which `mt-auto` keeps on the floor.
      */}
      <aside className="relative hidden overflow-hidden bg-brand-panel px-14 py-12 text-on-brand-panel lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(120% 80% at 15% 0%, rgba(255,255,255,0.16), transparent 60%)' }}
        />

        <p className="relative text-xl font-extrabold tracking-[-0.01em]">
          {t('common:brand.name')}
        </p>

        <div className="relative mt-40">
          {/*
            Set larger than the form's own scale. This type costs no page
            height — the panel is as tall as the form beside it either way —
            and at 2rem it read as a small block adrift in a wide column.
          */}
          <p className="text-[14px] font-medium tracking-wide text-on-brand-panel/75">
            {t('panel.eyebrow')}
          </p>
          <h2 className="mt-3 text-[2.6rem] font-extrabold leading-[1.15] tracking-[-0.025em]">
            {t('panel.headline_line1')}
            <br />
            {t('panel.headline_line2')}
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-on-brand-panel/70">
            {t('panel.subhead')}
          </p>
          <div className="mt-8">
            <CodePreview />
          </div>
        </div>

        <p className="relative mt-auto pt-12 text-[12px] text-on-brand-panel/50">
          {t('common:brand.copyright')}
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex min-h-screen flex-col bg-card px-6 py-8 sm:px-10 lg:px-16 lg:py-8">
        <header className="flex items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand wordmark, static asset */}
          <img alt={t('common:brand.wordmark_alt')} className="h-9 w-auto sm:h-10" src="/dlab-wordmark.svg" />
          <div className="flex items-center gap-3">
            <p className="font-mono text-[15px] tracking-wide text-sub">
              {t('common:brand.campus')}
            </p>
            {/* Someone who cannot read this page never reaches the studio
                header, so the auth screens carry the same pair. */}
            <HeaderControls />
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="mx-auto w-full max-w-[30rem]">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[2rem]">{title}</h1>
            <p className="mt-2 text-[15px] leading-6 text-sub sm:text-[16px]">{description}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-[30rem] flex-wrap items-center justify-between gap-2 text-[13px] text-sub/80">
          <span>{t('common:brand.footer')}</span>
          <span className="flex gap-4">
            <a className="transition-colors hover:text-ink" href="/terms">
              {t('common:legal.terms')}
            </a>
            <a className="transition-colors hover:text-ink" href="/privacy">
              {t('common:legal.privacy')}
            </a>
          </span>
        </footer>
      </section>
    </main>
  );
}
