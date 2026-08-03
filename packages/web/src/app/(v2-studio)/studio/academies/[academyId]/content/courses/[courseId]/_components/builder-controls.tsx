import { Eye, EyeOff } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

/** Shows an item's own flag while the tooltip explains inherited visibility. */
export function VisibilityIndicator({
  isVisible,
  effectivelyVisible,
}: {
  isVisible: boolean;
  effectivelyVisible: boolean;
}) {
  const { t } = useLayoutTranslation('content');
  const label = isVisible
    ? effectivelyVisible
      ? t('row.visible_tooltip')
      : t('row.hidden_by_parent_tooltip')
    : t('row.hidden_tooltip');
  return (
    <span
      aria-label={label}
      className={`grid size-7 shrink-0 place-items-center rounded-md ${
        isVisible ? 'text-success' : 'text-retired'
      }`}
      title={label}
    >
      {isVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </span>
  );
}
