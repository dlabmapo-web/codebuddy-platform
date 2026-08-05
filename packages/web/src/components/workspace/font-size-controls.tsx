'use client';

import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { useEditorPreferences } from '@/lib/workspace/use-editor-preferences';

/**
 * The editor's font size, as a pair of steppers.
 *
 * Sits in whichever toolbar runs along the top of the editor — the student's
 * and the teacher's are different toolbars, but the preference is one person's
 * eyesight and is stored once for both.
 */
export function FontSizeControls({
  fontSize,
  increase,
  decrease,
  canIncrease,
  canDecrease,
}: ReturnType<typeof useEditorPreferences>) {
  const { t } = useLayoutTranslation('learn');

  return (
    <div className="flex items-center gap-0.5">
      <StepButton
        disabled={!canDecrease}
        label={t('workspace.font_smaller')}
        onClick={decrease}
      >
        <Minus className="size-3" />
      </StepButton>
      <span
        aria-live="polite"
        className="w-6 text-center font-mono text-[11.5px] text-[#a5a5a5]"
      >
        {fontSize}
      </span>
      <StepButton
        disabled={!canIncrease}
        label={t('workspace.font_larger')}
        onClick={increase}
      >
        <Plus className="size-3" />
      </StepButton>
    </div>
  );
}

function StepButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-6 place-items-center rounded text-[#a5a5a5] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
