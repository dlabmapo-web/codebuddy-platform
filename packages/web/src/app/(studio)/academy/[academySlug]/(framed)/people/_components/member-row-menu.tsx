'use client';

import { Ellipsis, Trash2, UserPen } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';

import { BulkConfirmDialog } from './bulk-actions';

/**
 * A roster row's actions behind "⋯", as on the Members page: the profile for
 * every reader and, for one who may manage members, Delete. Delete is the
 * Members bulk delete for one person, so it previews what happens and asks
 * for the same acknowledgement before anything changes.
 */
export function MemberRowMenu({
  academyId,
  membershipId,
  name,
  profileHref,
  canDelete,
  onDeleted,
}: {
  academyId: string;
  membershipId: string;
  name: string;
  profileHref: string;
  /** Manager, and not the reader's own row (the server refuses that). */
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('manager');
  const [deleting, setDeleting] = React.useState(false);
  return (
    <div className="flex justify-end">
      {deleting ? (
        <BulkConfirmDialog
          academyId={academyId}
          classes={[]}
          initialOptions={{ kind: 'DELETE' }}
          onApplied={onDeleted}
          onClose={() => setDeleting(false)}
          selection={{ mode: 'ids', membershipIds: [membershipId] }}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`${t('people.action.menu')}: ${name}`}
            className="grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink data-[state=open]:bg-accent data-[state=open]:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            type="button"
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={profileHref}>
              <UserPen className="text-sub" />
              {t('people.action.profile')}
            </Link>
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleting(true)}>
                <Trash2 className="text-danger" />
                {t('people.action.delete')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
