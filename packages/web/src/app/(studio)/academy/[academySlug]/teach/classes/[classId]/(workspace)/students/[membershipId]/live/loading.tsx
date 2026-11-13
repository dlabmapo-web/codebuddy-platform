import { getServerTranslation } from '@/i18n/server/get-server-translation';

export default async function LoadingLiveStudent() {
  const { t } = await getServerTranslation(['monitoring']);
  return <main aria-busy="true" className="grid min-h-dvh place-items-center bg-canvas text-sm text-sub"><p role="status">{t('connection.connecting')}</p></main>;
}
