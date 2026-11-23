'use client';

import { Trash2 } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { BulkConfirmDialog } from './bulk-actions';

/**
 * Deletes one member from a roster row: the Members page's bulk delete for a
 * single person, so it previews what will happen and asks for the same
 * acknowledgement before anything changes.
 */
export function DeleteMemberButton({
  academyId,
  membershipId,
  name,
  onDeleted,
}: {
  academyId: string;
  membershipId: string;
  name: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('people-rosters');
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        aria-label={t('delete_member', { name })}
        title={t('delete_member', { name })}
        className="grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Trash2 className="size-4" />
      </button>
      {open ? (
        <BulkConfirmDialog
          academyId={academyId}
          classes={[]}
          initialOptions={{ kind: 'DELETE' }}
          onApplied={onDeleted}
          onClose={() => setOpen(false)}
          selection={{ mode: 'ids', membershipIds: [membershipId] }}
        />
      ) : null}
    </>
  );
}
