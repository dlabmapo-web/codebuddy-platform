import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

export async function AcademyOverview({ academyId }: { academyId: string }) {
  const { t } = await getServerTranslation(['academy', 'common']);
  let membership;
  try {
    const account = await createServerORPCClient().auth.me({});
    membership = account.user.memberships.find(
      (item) => item.academy.id === academyId && item.status === 'ACTIVE',
    );
  } catch {
    membership = undefined;
  }
  if (!membership) {
    return <p className="text-sm text-danger">{t('no_access')}</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sub">
        {t('signed_in_as', { academy: membership.academy.name })}
      </p>
      <p className="text-sm text-sub">
        {t('role')}: <strong className="text-ink">
          {t(`common:role.${membership.role}`)}
        </strong>
      </p>
      {membership.role === 'MANAGER' ? (
        <p className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          {t('manager_hint')}
        </p>
      ) : (
        <p className="rounded-xl bg-muted p-4 text-sm text-ink">
          {t('member_hint')}
        </p>
      )}
    </div>
  );
}
