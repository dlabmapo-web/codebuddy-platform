'use client';

import { ArrowUpDown, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { useLayoutTranslation } from '@/i18n';

/**
 * Rename, show/hide, delete — behind one dots trigger. The menu names what it
 * acts on in its own header, so a menu opened on a lecture can never be
 * mistaken for one opened on a problem inside it.
 */
export function RowMenu({
  isVisible,
  kindLabel,
  label,
  onDelete,
  onMove,
  onRename,
  onToggleVisible,
  tone = 'default',
}: {
  isVisible: boolean;
  /** "Lecture", "Problem" — shown above the actions. */
  kindLabel: string;
  label: string;
  onDelete: () => void;
  /**
   * Absent when the row has no sibling to move among. A list offering one
   * destination — the place the item already occupies — is noise.
   */
  onMove?: () => void;
  onRename: () => void;
  onToggleVisible: (next: boolean) => void;
  /** `strong` marks the group-level menu so it reads apart from child rows. */
  tone?: 'default' | 'strong';
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('row.menu_aria', { kind: kindLabel, title: label })}
          className={`grid size-8 shrink-0 place-items-center rounded-md transition-colors data-[state=open]:bg-canvas data-[state=open]:text-ink ${
            tone === 'strong'
              ? 'text-ink hover:bg-canvas'
              : 'text-sub hover:bg-canvas hover:text-ink'
          }`}
          type="button"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[13rem] text-[14.5px]">
        {/* Names the target, so the wrong menu is obvious before you click. */}
        <DropdownMenuLabel className="truncate text-[12.5px]">
          {kindLabel} · {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="text-sub" />
          {t('row.rename')}
        </DropdownMenuItem>
        {onMove ? (
          <DropdownMenuItem onSelect={onMove}>
            <ArrowUpDown className="text-sub" />
            {t('row.move')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => onToggleVisible(!isVisible)}>
          {isVisible ? (
            <EyeOff className="text-sub" />
          ) : (
            <Eye className="text-sub" />
          )}
          {isVisible ? t('row.hide') : t('row.show')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger focus:bg-danger/10 focus:text-danger"
          onSelect={onDelete}
        >
          <Trash2 />
          {t('row.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
