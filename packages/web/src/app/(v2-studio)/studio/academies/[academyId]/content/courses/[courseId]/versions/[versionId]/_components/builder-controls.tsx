import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import type { MoveDirection } from '../_lib/course-tree';

export function EditableTitle({
  className,
  editable,
  onSave,
  value,
}: {
  className: string;
  editable: boolean;
  onSave: (title: string) => void;
  value: string;
}) {
  const { t } = useLayoutTranslation('content');
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable || draft === null) {
    return editable ? (
      <button
        className={`${className} block max-w-full truncate rounded text-left transition-colors hover:text-brand`}
        onClick={() => setDraft(value)}
        title={t('rename')}
        type="button"
      >
        {value}
      </button>
    ) : (
      <p className={`${className} truncate`}>{value}</p>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setDraft(null);
  };

  return (
    <input
      autoFocus
      className={`${className} w-full rounded border border-brand bg-white px-1.5 py-0.5 outline-none ring-2 ring-brand/20`}
      maxLength={200}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
      value={draft}
    />
  );
}

export function MoveButtons({
  canMoveDown,
  canMoveUp,
  moveDownLabel,
  moveUpLabel,
  onMove,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  moveDownLabel: string;
  moveUpLabel: string;
  onMove: (direction: MoveDirection) => void;
}) {
  const buttonClass =
    'grid size-7 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent';

  return (
    <>
      <button
        aria-label={moveUpLabel}
        className={buttonClass}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
        type="button"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        aria-label={moveDownLabel}
        className={buttonClass}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
        type="button"
      >
        <ChevronDown className="size-4" />
      </button>
    </>
  );
}

export function DeleteButton({
  ariaLabel,
  onDelete,
}: {
  ariaLabel: string;
  onDelete: () => void;
}) {
  const { t } = useLayoutTranslation('common');
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="flex items-center gap-1">
        <button
          className="h-7 rounded-md bg-danger px-2 text-[12px] font-bold text-white"
          onClick={() => {
            setArmed(false);
            onDelete();
          }}
          type="button"
        >
          {t('action.delete')}
        </button>
        <button
          className="h-7 px-1.5 text-[12px] font-semibold text-sub"
          onClick={() => setArmed(false)}
          type="button"
        >
          {t('action.keep')}
        </button>
      </span>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      className="grid size-7 place-items-center rounded-md text-sub transition-colors hover:bg-danger/10 hover:text-danger"
      onClick={() => setArmed(true)}
      type="button"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-canvas px-3 py-2.5">
      <dt className="text-[12px] font-semibold text-sub">{label}</dt>
      <dd className="font-mono text-[18px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}
