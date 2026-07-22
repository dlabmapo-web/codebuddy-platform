import { CodePreview } from './code-preview';

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen w-full bg-warm-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-brand px-14 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(120% 80% at 15% 0%, rgba(255,255,255,0.16), transparent 60%)' }}
        />

        <p className="relative text-xl font-extrabold tracking-[-0.01em]">코브 스튜디오</p>

        <div className="relative">
          <p className="text-[13px] font-medium text-white/75">코딩 교육 플랫폼</p>
          <h2 className="mt-2 text-[2rem] font-extrabold leading-[1.35] tracking-[-0.02em]">
            함께 풀어서
            <br />더 빨리 느는 코딩
          </h2>
          <p className="mt-3 max-w-md text-[14px] leading-6 text-white/70">
            선생님과 1:1 실시간으로 함께 코드를 편집하며 배우는 가장 효과적인 방법
          </p>
          <div className="mt-9">
            <CodePreview />
          </div>
        </div>

        <p className="relative text-[12px] text-white/50">© 2026 Cove Studio. All rights reserved.</p>
      </aside>

      {/* Form panel */}
      <section className="flex min-h-screen flex-col bg-white px-6 py-9 sm:px-10 lg:px-16 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand wordmark, static asset */}
          <img alt="Cove Studio — DLAB Coding Academy" className="h-9 w-auto sm:h-10" src="/dlab-wordmark.svg" />
          <p className="font-mono text-[15px] tracking-wide text-sub">마포캠퍼스</p>
        </header>

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="mx-auto w-full max-w-md">
            <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[2.3rem]">{title}</h1>
            <p className="mt-3 text-[16px] leading-7 text-sub sm:text-[17px]">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 text-[13px] text-sub/80">
          <span>© Cove Studio · DLAB 마포캠퍼스</span>
          <span className="flex gap-4">
            <a className="transition-colors hover:text-ink" href="/terms">
              Terms
            </a>
            <a className="transition-colors hover:text-ink" href="/privacy">
              Privacy
            </a>
          </span>
        </footer>
      </section>
    </main>
  );
}
