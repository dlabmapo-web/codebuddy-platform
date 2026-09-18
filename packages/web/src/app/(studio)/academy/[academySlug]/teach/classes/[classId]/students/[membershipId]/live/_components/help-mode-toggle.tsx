'use client';

import { Eye, Pencil } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The control that makes a read-only workspace writable.
 *
 * A workspace opens read-only, and this is the only way out of that. It is
 * deliberately a request rather than a switch: pressing it asks the server,
 * and the label changes when the server agrees. The previous design had no
 * control at all — the first keystroke silently became "helping", which meant
 * a teacher scrolling through a student's code with the cursor in the editor
 * could change it by accident, and the student's indicator said help was
 * happening because a byte had moved rather than because anybody had decided
 * to help.
 *
 * Stepping back to reading is immediate on press. Granting permission may wait
 * for a round trip; withdrawing it must not.
 */
export function HelpModeToggle({
  busy,
  disabled,
  helping,
  onToggle,
}: {
  /** A request is in flight; the answer decides, so this only suppresses spam. */
  busy: boolean;
  /** No live, synchronized watch to grant permission on. */
  disabled: boolean;
  /** What the server has confirmed, never what was asked for. */
  helping: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { t } = useTranslation('monitoring');
  const Icon = helping ? Pencil : Eye;

  return (
    <button
      // The pressed state is the server's answer, so a screen reader is told
      // what is true rather than what was requested.
      title={t('help.edit_explanation')}
      aria-pressed={helping}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        helping
          ? 'bg-draft/15 text-draft hover:bg-draft/25'
          : 'bg-canvas text-sub hover:bg-border hover:text-ink'
      }`}
      disabled={disabled || busy}
      onClick={() => onToggle(!helping)}
      type="button"
    >
      <Icon className="size-3.5" />
      {t(helping ? 'help.edit_on' : 'help.edit_off')}
    </button>
  );
}
