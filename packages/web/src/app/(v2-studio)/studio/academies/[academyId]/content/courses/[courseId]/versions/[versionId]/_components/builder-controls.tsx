import { EyeOff } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

/** Marks a row students cannot see. */
export function HiddenBadge() {
  const { t } = useLayoutTranslation('content');
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-retired-soft px-2 py-0.5 text-[11.5px] font-bold text-retired">
      <EyeOff className="size-2.5" />
      {t('row.hidden_badge')}
    </span>
  );
}
