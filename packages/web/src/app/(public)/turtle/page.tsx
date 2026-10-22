import type { Metadata } from 'next';
import { getLocale } from '@/i18n/server/get-locale';
import { TurtleTrial } from '@/components/turtle-trial/turtle-trial';

export const metadata: Metadata = {
  title: 'Cove Turtle · 파이썬 거북이 체험',
  robots: { index: false, follow: false },
};
export default async function TurtlePage() {
  return <TurtleTrial enabled={process.env.NEXT_PUBLIC_TURTLE_TRIAL_ENABLED === 'true'} english={(await getLocale()) === 'en'} />;
}
