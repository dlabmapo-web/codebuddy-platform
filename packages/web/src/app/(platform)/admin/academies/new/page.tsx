import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { BackLink } from '@/components/studio/back-link';
import { backTo } from '@/lib/back-to';

import { PlatformShell } from '../../_components/platform-shell';
import { CreateAcademyForm } from './_components/create-academy-form';

export default async function NewAcademyPage() {
  const { t } = await getServerTranslation(['platform']);

  return (
    <PlatformShell
      back={
        <BackLink href={backTo.platformAcademyNew()} label={t('shell.back')} />
      }
      bleed
      description={t('create.subtitle')}
      title={t('create.title')}
    >
      <div className="max-w-2xl">
        <CreateAcademyForm />
      </div>
    </PlatformShell>
  );
}
