'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useLayoutTranslation } from '@/i18n';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { pdfApi } from '@/lib/pdf-api';
import { routes } from '@/lib/routes';
export function PdfResourceLink({
  academyId,
  classId,
  document,
}: {
  academyId: string;
  classId: string;
  document: {
    materialId: string;
    title: string;
    pdf?: { originalFilename: string; byteSize: number };
    originalFilename?: string;
    byteSize?: number;
  };
}) {
  const slug = useAcademySlug();
  const { t } = useLayoutTranslation('learn');
  const [failed, setFailed] = useState(false);
  async function download() {
    try {
      const result = await pdfApi.read({
        academyId,
        materialId: document.materialId,
        download: true,
      });
      const link = window.document.createElement('a');
      link.href = result.url;
      link.download = result.pdf.originalFilename;
      link.click();
    } catch {
      setFailed(true);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex-1 text-sm font-semibold">
        PDF · {document.title}
        <span className="block text-xs font-normal text-sub">
          {document.pdf?.originalFilename ?? document.originalFilename} ·{' '}
          {((document.pdf?.byteSize ?? document.byteSize ?? 0) / 1e6).toFixed(
            2,
          )}{' '}
          MB
        </span>
      </span>
      <Link
        className="text-sm text-brand"
        href={routes.academyLearnPdf(slug, document.materialId, { classId })}
      >
        {t('pdf.open')}
      </Link>
      <button
        className="text-sm text-brand"
        type="button"
        onClick={() => void download()}
      >
        {t('pdf.download')}
      </button>
      {failed ? (
        <span role="alert" className="text-sm text-danger">
          {t('pdf.unavailable')}
        </span>
      ) : null}
    </li>
  );
}
