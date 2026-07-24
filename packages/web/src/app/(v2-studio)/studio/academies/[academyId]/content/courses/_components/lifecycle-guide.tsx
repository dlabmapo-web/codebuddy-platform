import { useLayoutTranslation } from '@/i18n';

import { VersionChip } from '../../_components/version-marks';

export function LifecycleGuide() {
  const { t } = useLayoutTranslation('courses');
  const steps = [
    {
      id: 'draft',
      title: t('lifecycle.draft_title'),
      body: t('lifecycle.draft_body'),
      chip: <VersionChip state="draft" versionNumber={2} />,
    },
    {
      id: 'check',
      title: t('lifecycle.check_title'),
      body: t('lifecycle.check_body'),
      chip: null,
    },
    {
      id: 'publish',
      title: t('lifecycle.publish_title'),
      body: t('lifecycle.publish_body'),
      chip: <VersionChip state="published" versionNumber={2} />,
    },
  ];

  return (
    <section className="rounded-card border border-border bg-white p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-sub">
        {t('lifecycle.heading')}
      </h2>
      <ol className="mt-4 grid gap-5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li className="relative sm:pr-4" key={step.id}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[12px] font-bold text-brand">
                {index + 1}
              </span>
              <h3 className="text-[14.5px] font-bold">{step.title}</h3>
            </div>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-sub">
              {step.body}
            </p>
            {step.chip ? <div className="mt-2.5">{step.chip}</div> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
