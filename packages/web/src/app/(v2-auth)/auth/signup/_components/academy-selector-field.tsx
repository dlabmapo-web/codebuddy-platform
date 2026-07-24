import { ChevronsUpDown, School } from 'lucide-react';
import { forwardRef } from 'react';

import {
  ResponsiveSelector,
  type SelectorItem,
  type TriggerProps,
} from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { SignupAcademiesState } from '../_hooks/use-signup-academies';

const AcademyTrigger = forwardRef<HTMLButtonElement, TriggerProps<SelectorItem>>(
  function AcademyTrigger({ className, selectedItem, ...props }, ref) {
    const { t } = useLayoutTranslation('auth');
    const placeholder =
      props.disabled && !selectedItem
        ? t('field.academy_loading')
        : t('field.academy_choose');
    return (
      <button
        aria-controls={undefined}
        aria-expanded={false}
        className={`flex h-14 w-full items-center gap-3 rounded-xl border border-border bg-white px-4 text-left text-[16px] text-ink outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
        ref={ref}
        role="combobox"
        type="button"
        {...props}
      >
        <School className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
        <span
          className={`min-w-0 flex-1 truncate ${
            selectedItem ? '' : 'text-sub/60'
          }`}
        >
          {selectedItem?.name ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-sub" />
      </button>
    );
  },
);

export function AcademySelectorField({
  academies,
  socialError,
}: {
  academies: SignupAcademiesState;
  socialError?: string;
}) {
  const { t } = useLayoutTranslation('auth');
  const errorText = useErrorText();

  return (
    <div className="mb-5">
      <span className="mb-2 block text-[15px] font-semibold text-ink">
        {t('field.academy')}
      </span>
      <ResponsiveSelector
        disabled={academies.loading || Boolean(academies.error) || academies.locked}
        drawerTitle={t('field.academy_choose')}
        list={academies.academies}
        onSelect={(academy) => academies.selectAcademy(academy.id)}
        placeholder={t('field.academy_search')}
        selectedId={academies.academyId || null}
        TriggerComp={AcademyTrigger}
      />
      {academies.error ? (
        <p className="mt-2 text-[14px] text-danger">
          {errorText(academies.error, t('error.academies_unavailable'))}
        </p>
      ) : null}
      {socialError ? (
        <p className="mt-2 text-[14px] text-danger">{socialError}</p>
      ) : null}
    </div>
  );
}
