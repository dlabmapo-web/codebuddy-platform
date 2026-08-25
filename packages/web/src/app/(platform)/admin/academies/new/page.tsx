import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { PlatformShell } from '../../_components/platform-shell';
import { CreateAcademyForm } from './_components/create-academy-form';

export default async function NewAcademyPage() {
  const { t } = await getServerTranslation(['platform']);

  return (
    <PlatformShell bleed description={t('create.subtitle')} title={t('create.title')}>
      <div className="max-w-2xl">
        <CreateAcademyForm />
      </div>
    </PlatformShell>
  );
}
