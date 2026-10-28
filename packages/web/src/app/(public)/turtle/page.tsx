import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getLocale } from '@/i18n/server/get-locale';
import { initTranslations } from '@/i18n/init-translations';
import { TurtleTrial } from '@/components/turtle-trial/turtle-trial';
import { turtleBrowserConfig } from '@/lib/turtle-trial/browser-config';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await initTranslations(await getLocale(), ['turtle-trial']);
  return { title: t('turtle-trial:page_title'), robots: { index: false, follow: false } };
}
export default async function TurtlePage() {
  await connection();
  return <TurtleTrial enabled={process.env.NEXT_PUBLIC_TURTLE_TRIAL_ENABLED === 'true'} browserConfig={turtleBrowserConfig(process.env)} />;
}
