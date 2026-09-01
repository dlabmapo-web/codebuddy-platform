'use client';

import type {
  AcademyRole,
  DirectoryComposition,
  ResolvedListPlatformUsersInput,
} from '@cove/shared';
import { academyRoles } from '@cove/shared';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { useErrorText } from '@/i18n/client/use-error-text';
import { cn } from '@/lib/utils';

import { downloadUserExport } from '../_lib/download-export';
import { roleChipStyles, roleTones, toneStyles } from '../_lib/user-view';

/**
 * The directory, as a spreadsheet.
 *
 * A split button: pressing it exports the view as filtered, and the caret
 * offers one role instead. The shortcut exists because "just the students" is
 * the request this feature was built for, and reaching it by setting a chip
 * first is a detour on the way to a file.
 *
 * This is not the lens rail returning. It sets no state, changes nothing on
 * screen, and is gone the moment the file is written — and the counts beside
 * each role are `composition`, the same numbers already on the summary strip,
 * computed under every other facet with the role narrowing dropped. So the
 * number beside "Students" is the number of accounts the file will hold.
 *
 * A picked role *replaces* the filter's roles rather than intersecting with
 * them. An intersection of two disagreeing role sets is an empty file, and an
 * empty spreadsheet is the least debuggable answer a download can give.
 */
export function UserExportButton({
  composition,
  query,
}: {
  composition: DirectoryComposition | undefined;
  query: ResolvedListPlatformUsersInput;
}) {
  const { t, i18n } = useTranslation('platform-users');
  const errorText = useErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const run = React.useCallback(
    async (role: AcademyRole | null) => {
      setPending(true);
      setError(null);
      try {
        await downloadUserExport({ query, role, locale: i18n.language });
      } catch (caught) {
        setError(caught);
      } finally {
        setPending(false);
      }
    },
    [i18n.language, query],
  );

  const counts: Record<AcademyRole, number> | undefined = composition && {
    STUDENT: composition.students,
    TEACHER: composition.teachers,
    TEAM_LEAD: composition.teamLeads,
    MANAGER: composition.managers,
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex">
        <button
          className="inline-flex h-10 items-center gap-1.5 rounded-l-lg border border-r-0 border-border bg-card px-3.5 text-[13.5px] font-bold text-ink transition-colors hover:bg-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          disabled={pending}
          onClick={() => void run(null)}
          type="button"
        >
          {pending ? (
            <Loader2
              aria-hidden
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Download aria-hidden className="size-4" strokeWidth={2.25} />
          )}
          {pending ? t('export.working') : t('export.download')}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t('export.choose')}
              className="grid h-10 w-8 place-items-center rounded-r-lg border border-border bg-card text-sub transition-colors hover:bg-accent hover:text-ink data-[state=open]:bg-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={pending}
              type="button"
            >
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t('export.label')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void run(null)}>
              <Download className="text-sub" />
              <span className="flex-1">{t('export.everything')}</span>
              <Count value={composition?.total} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {academyRoles.map((role) => {
              const { icon: Icon } = roleChipStyles(role);
              return (
                <DropdownMenuItem
                  key={role}
                  onSelect={() => void run(role)}
                >
                  <Icon className={toneStyles[roleTones[role]].text} />
                  <span className="flex-1">{t(`role.${role}`)}</span>
                  <Count value={counts?.[role]} />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error ? (
        <p className="max-w-xs text-right text-[12px] text-danger" role="alert">
          {errorText(error)}
        </p>
      ) : null}
    </div>
  );
}

/** The row count, or nothing while the first page is still in flight. */
function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  return (
    <span className={cn('font-mono text-[12px] tabular-nums text-sub')}>
      {value}
    </span>
  );
}
