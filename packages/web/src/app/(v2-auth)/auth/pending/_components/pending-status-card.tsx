import {
  Ban,
  CheckCircle2,
  CircleOff,
  Clock3,
  XCircle,
} from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import type { PendingApprovalState } from '../_hooks/use-pending-approval';
import {
  pendingIconKind,
  stateCopy,
  statusToneClass,
} from '../_lib/pending-presentation';

export function PendingStatusCard({
  manager,
}: {
  manager: PendingApprovalState;
}) {
  const { t } = useLayoutTranslation(['auth', 'common']);
  const copy = stateCopy[manager.view.state];

  return (
    <>
      <StateIcon
        kind={manager.state.kind}
        status={manager.application?.status}
      />
      <div>
        <h2 className="text-xl font-bold text-ink">{t(copy.heading)}</h2>
        <p className="mt-2 text-sm leading-6 text-sub">
          {t(copy.description, {
            academy: manager.view.academyName ?? '',
          })}
        </p>
        {manager.application?.status === 'REJECTED' &&
        manager.application.reviewReason ? (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {manager.application.reviewReason}
          </p>
        ) : null}
      </div>
      {manager.academy && copy.status ? (
        <div className="rounded-xl border border-border bg-canvas p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-sub">{t('pending.academy')}</span>
            <strong className="text-right text-ink">
              {manager.academy.name}
            </strong>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="text-sub">{t('pending.status')}</span>
            <strong className={statusToneClass(manager.view.statusTone)}>
              {t(copy.status)}
            </strong>
          </div>
          {manager.view.role ? (
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-sub">{t('pending.role')}</span>
              <strong className="text-right text-ink">
                {t(`common:role.${manager.view.role}`)}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function StateIcon({
  kind,
  status,
}: {
  kind: PendingApprovalState['state']['kind'];
  status?: PendingApprovalState['application'] extends infer Application
    ? Application extends { status: infer Status }
      ? Status
      : never
    : never;
}) {
  const iconKind = pendingIconKind(kind, status);
  if (iconKind === 'approved') {
    return <CheckCircle2 className="text-success" size={42} />;
  }
  if (iconKind === 'suspended') {
    return <Ban className="text-retired" size={42} />;
  }
  if (iconKind === 'none') {
    return <CircleOff className="text-retired" size={42} />;
  }
  if (iconKind === 'rejected') {
    return <XCircle className="text-danger" size={42} />;
  }
  return <Clock3 className="text-amber-600" size={42} />;
}
