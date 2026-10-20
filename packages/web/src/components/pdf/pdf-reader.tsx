'use client';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
function PdfLoading() {
  const { t } = useTranslation('content');
  return <p role="status" className="p-6 text-sm text-sub">{t('pdf.loading')}</p>;
}
export const PdfReader = dynamic(
  () => import('./pdf-canvas').then((m) => m.PdfCanvas),
  { ssr: false, loading: PdfLoading },
);
