import { Eye, EyeOff } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import { useLayoutTranslation } from '@/i18n';

import { VisibilityToggle } from '../../../_components/visibility-toggle';

/** Shows an item's own flag while the tooltip explains inherited visibility. */
export function VisibilityIndicator({
  isVisible,
  effectivelyVisible,
}: {
  isVisible: boolean;
  effectivelyVisible: boolean;
}) {
  const { t } = useTranslation('content');
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

/**
 * A row's visibility: a toggle for someone who may change it, the read-only
 * eye for someone who may not.
 *
 * `onChange` decides what flipping does — hiding a chapter or lecture first
 * asks, because it takes everything under it away from students; showing
 * never needs to.
 *
 * The flag is shown flipped before the server answers, so there is no spinner
 * to wait on. `busy` only stops a second press on the same row from racing the
 * first write back to the server.
 */
export function RowVisibility({
  busy,
  editable,
  effectivelyVisible,
  isVisible,
  onChange,
  title,
}: {
  busy: boolean;
  editable: boolean;
  effectivelyVisible: boolean;
  isVisible: boolean;
  onChange: (next: boolean) => void;
  title: string;
}) {
  const { t } = useTranslation('content');
  if (!editable) {
    return (
      <VisibilityIndicator effectivelyVisible={effectivelyVisible} isVisible={isVisible} />
    );
  }
  return (
    <VisibilityToggle
      effectivelyVisible={effectivelyVisible}
      isVisible={isVisible}
      labels={{
        action: t('row.visibility_action', { title }),
        visible: t('row.state_visible'),
        hidden: t('row.state_hidden'),
        hiddenByParent: t('row.state_hidden_by_parent'),
        tooltip: isVisible
          ? effectivelyVisible
            ? t('row.visible_tooltip')
            : t('row.hidden_by_parent_tooltip')
          : t('row.hidden_tooltip'),
      }}
      onChange={(next) => {
        if (!busy) onChange(next);
      }}
    />
  );
}
