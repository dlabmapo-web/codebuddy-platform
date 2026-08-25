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
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-brand-panel px-14 py-14 text-on-brand-panel lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(120% 80% at 15% 0%, rgba(255,255,255,0.16), transparent 60%)' }}
        />

        <p className="relative text-xl font-extrabold tracking-[-0.01em]">
          {t('common:brand.name')}
        </p>

        <div className="relative">
          <p className="text-[13px] font-medium text-on-brand-panel/75">{t('panel.eyebrow')}</p>
          <h2 className="mt-2 text-[2rem] font-extrabold leading-[1.35] tracking-[-0.02em]">
            {t('panel.headline_line1')}
            <br />
            {t('panel.headline_line2')}
          </h2>
          <p className="mt-3 max-w-md text-[14px] leading-6 text-on-brand-panel/70">
            {t('panel.subhead')}
          </p>
          <div className="mt-9">
            <CodePreview />
          </div>
        </div>

        <p className="relative text-[12px] text-on-brand-panel/50">{t('common:brand.copyright')}</p>
      </aside>

      {/* Form panel */}
      <section className="flex min-h-screen flex-col bg-card px-6 py-9 sm:px-10 lg:px-16 lg:py-12">
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

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="mx-auto w-full max-w-md">
            <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[2.3rem]">{title}</h1>
            <p className="mt-3 text-[16px] leading-7 text-sub sm:text-[17px]">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 text-[13px] text-sub/80">
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
