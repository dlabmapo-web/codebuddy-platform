import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ApplicationsManagerState } from '../_hooks/use-applications-manager';
import { ApplicationCard } from './application-card';

export function ApplicationsList({
  manager,
}: {
  manager: ApplicationsManagerState;
}) {
  const { t } = useLayoutTranslation('applications');
  const errorText = useErrorText();

  if (manager.loading) {
    return <p className="text-sm text-sub">{t('loading')}</p>;
  }
  if (manager.loadError) {
    return (
      <p className="text-sm text-danger">
        {errorText(manager.loadError, t('forbidden'))}
      </p>
    );
  }
  if (manager.requests.length === 0) {
    return <p className="text-sm text-sub">{t('empty')}</p>;
  }

  return (
    <div className="space-y-4">
      {manager.requests.map((request) => (
        <ApplicationCard
          disabled={manager.reviewPending}
          key={request.id}
          onApprove={(role, reason) =>
            manager.approve(request.id, role, reason)
          }
          onReject={(reason) => manager.reject(request.id, reason)}
          request={request}
        />
      ))}
      {manager.reviewError ? (
        <p className="text-sm text-danger">
          {errorText(manager.reviewError, t('review_failed'))}
        </p>
      ) : null}
    </div>
  );
}
