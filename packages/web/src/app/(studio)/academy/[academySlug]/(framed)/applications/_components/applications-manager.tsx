'use client';

import { approvableRoles, type AcademyRole } from '@cove/shared';
import { useState } from 'react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import {
  useApplicationsManager,
  type ApplicationRequest,
} from '../_hooks/use-applications-manager';
import { ApplicationsTable } from './applications-table';
import { ReviewModal } from './review-modal';

export function ApplicationsManager({
  academyId,
  role,
}: {
  academyId: string;
  role: AcademyRole;
}) {
  const { t } = useLayoutTranslation('applications');
  const errorText = useErrorText();
  const manager = useApplicationsManager(academyId);
  const [reviewing, setReviewing] = useState<ApplicationRequest | null>(null);

  if (manager.loading) {
    return <p className="text-[14px] text-sub">{t('loading')}</p>;
  }
  if (manager.loadError) {
    return (
      <p className="text-[14px] font-semibold text-danger">
        {errorText(manager.loadError, t('forbidden'))}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ApplicationsTable manager={manager} onReview={setReviewing} />

      <ReviewModal
        disabled={manager.reviewPending}
        onApprove={(role, reason) => {
          if (!reviewing) return;
          manager.approve(reviewing.id, role, reason);
          setReviewing(null);
        }}
        onClose={() => setReviewing(null)}
        onReject={(reason) => {
          if (!reviewing) return;
          manager.reject(reviewing.id, reason);
          setReviewing(null);
        }}
        request={reviewing}
        roles={approvableRoles(role)}
      />

      {manager.reviewError ? (
        <p className="text-[14px] font-semibold text-danger">
          {errorText(manager.reviewError, t('review_failed'))}
        </p>
      ) : null}
    </div>
  );
}
