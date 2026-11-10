'use client';
import { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { withPrivateImages } from '@/lib/lesson-images';
import { anchorProps, surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useExplanationTranslation } from './use-explanation-translation';

/** Shared by preview, the learner and the existing teacher observation shell. */
export function ExplanationContent({ title, body, images = {}, lectureTitle, onRetry }: {
  title: string; body: string; images?: Record<string, string | null>; lectureTitle?: string; onRetry?: () => void;
}) {
  const { t } = useExplanationTranslation();
  const codeLabels = useMemo(() => ({ copy: t('copy_code'), copied: t('copied'), copyFailed: t('copy_failed'), plainText: t('plain_text') }), [t]);
  const html = useMemo(() => withPrivateImages(body, new Map(Object.entries(images))), [body, images]);
  return <article {...surfaceProps('statement')} className="mx-auto my-5 w-full max-w-[1440px] rounded-2xl border border-border bg-card px-5 py-7 shadow-sm sm:my-8 sm:px-10 sm:py-10 lg:px-10 lg:py-10">
    <header className="mb-7 border-b border-border pb-6">
      <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-brand"><BookOpen aria-hidden className="size-4" />{t('type')}<span className="text-border">/</span><span className="text-sub">{t('ungraded')}</span></p>
      <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">{title}</h1>
      {lectureTitle ? <p className="mt-3 text-sm leading-6 text-sub">{lectureTitle}</p> : null}
    </header>
    {Object.values(images).some(value => value === null) ? <p role="status" className="mb-4 rounded-lg bg-warning/10 p-3 text-sm text-ink">{t('image_failed')}{onRetry ? <button type="button" className="ml-2 font-semibold text-brand underline" onClick={onRetry}>{t('retry')}</button> : null}</p> : null}
    <div {...anchorProps('statement:instructions')} className="min-w-0"><RichTextFrame content={html} title={title} minHeight={100} padding={0} codeExamples={codeLabels} /></div>
  </article>;
}
