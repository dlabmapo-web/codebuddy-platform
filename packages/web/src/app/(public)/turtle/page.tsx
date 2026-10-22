import type { Metadata } from 'next';
import { getLocale } from '@/i18n/server/get-locale';
import { initTranslations } from '@/i18n/init-translations';
import { TurtleTrial } from '@/components/turtle-trial/turtle-trial';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await initTranslations(await getLocale(), ['turtle-trial']);
  return { title: t('turtle-trial:page_title'), robots: { index: false, follow: false } };
}
export default async function TurtlePage() {
  return <TurtleTrial enabled={process.env.NEXT_PUBLIC_TURTLE_TRIAL_ENABLED === 'true'} />;
}
