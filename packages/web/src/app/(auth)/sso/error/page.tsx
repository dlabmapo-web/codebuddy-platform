import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { AuthCard } from '../../_components/auth-card';

export default async function DlabLoginError() {
  const { t } = await getServerTranslation(['profile']);
  return <AuthCard title={t('dlab.error_title')}>
    <p className="text-sm text-sub">{t('dlab.error_description')}</p>
    <a href="/login" className="mt-5 block text-center underline">{t('dlab.back_to_login')}</a>
  </AuthCard>;
}
