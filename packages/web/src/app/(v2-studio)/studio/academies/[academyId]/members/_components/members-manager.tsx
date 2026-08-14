'use client';

import { Skeleton } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useMembersManager } from '../_hooks/use-members-manager';
import { MembersTable } from './members-table';

export function MembersManager({ academyId }: { academyId: string }) {
  const { t } = useLayoutTranslation('members');
  const errorText = useErrorText();
  const manager = useMembersManager(academyId);

  if (manager.loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton className="h-14 w-full" key={row} />
        ))}
      </div>
    );
  }

  if (manager.loadError) {
    return (
      <p className="text-[14px] font-semibold text-danger">
        {errorText(manager.loadError, t('forbidden'))}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <MembersTable academyId={academyId} manager={manager} />
      {manager.updateError ? (
        <p className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
          {errorText(manager.updateError, t('update_failed'))}
        </p>
      ) : null}
    </div>
  );
}
