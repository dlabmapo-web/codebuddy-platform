'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { PdfReadResult } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { routes } from '@/lib/routes';
import { pdfApi } from '@/lib/pdf-api';
import { PdfResourceLink } from './pdf-resource-link';
import { PdfReader } from './pdf-reader';
export function PdfLesson({
  academyId,
  materialId,
  classId,
}: {
  academyId: string;
  materialId: string;
  classId?: string;
}) {
  const slug = useAcademySlug();
  const { t } = useTranslation('content');
  const query = useQuery({
    queryKey: ['pdf', academyId, materialId, false],
    queryFn: () => pdfApi.read({ academyId, materialId }),
    retry: false,
    staleTime: 0,
  });
  const data = query.data;
  const failed = query.isError;
  const [drawer, setDrawer] = useState(false);
  const path = (row: PdfReadResult['materials'][number]) =>
    row.type === 'PDF_DOCUMENT'
      ? routes.academyLearnPdf(slug, row.materialId, { classId })
      : row.type === 'PROGRAMMING_EXERCISE' ? routes.academyLearnExercise(slug,row.materialId,{classId}) : routes.academyLearnManual(slug,row.materialId,{classId});
  if (!data)
    return (
      <main className="p-6" role={failed ? 'alert' : 'status'}>
        {t(failed ? 'pdf.unavailable' : 'pdf.loading')}
      </main>
    );
  const index = data.materials.findIndex((m) => m.materialId === materialId);
  const lectureMaterials = data.materials.filter(
    (m) => m.lectureId === data.lecture.id,
  );
  const lectureIndex = lectureMaterials.findIndex(
    (m) => m.materialId === materialId,
  );
  const previous = data.materials[index - 1];
  const next = index >= 0 ? data.materials[index + 1] : undefined;
  return (
    <main className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <Link
            className="text-xs text-brand"
            href={routes.academyLearnCourse(slug, data.course.id, {
              classId,
              lecture: data.lecture.id,
            })}
          >
            {t('pdf.course')}
          </Link>
          <h1 className="truncate text-sm font-bold">
            {data.lecture.title} · {data.title}
          </h1>
        </div>
        <button
          type="button"
          aria-expanded={drawer}
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => setDrawer((v) => !v)}
        >
          {t('pdf.contents')}
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <PdfReader
            key={materialId}
            academyId={academyId}
            materialId={materialId}
          />
        </div>
        {drawer ? (
          <aside className="absolute inset-y-0 right-0 z-20 w-72 overflow-auto border-l border-border bg-card p-4 shadow-lg sm:static">
            <h2 className="mb-3 font-bold">{data.course.title}</h2>
            <ul className="grid gap-2">
              {data.materials.map((row, i) => (
                <li key={row.materialId}>
                  <Link
                    aria-current={
                      row.materialId === materialId ? 'page' : undefined
                    }
                    className="block rounded-lg border border-border p-2 text-sm hover:text-brand"
                    href={path(row)}
                  >
                    {i + 1}.{' '}
                    {row.type === 'PDF_DOCUMENT' ? `${t('pdf.badge')} · ` : ''}
                    {row.title}
                  </Link>
                </li>
              ))}
            </ul>
            {data.resources.length ? (
              <>
                <h2 className="my-3 font-bold">{t('pdf.resources')}</h2>
                <ul className="grid gap-2">
                  {data.resources.map((document) => (
                    <PdfResourceLink
                      key={document.materialId}
                      academyId={academyId}
                      classId={classId ?? ''}
                      document={document}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
      <footer className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
        {previous ? (
          <Link className="text-sm text-brand" href={path(previous)}>
            {t('pdf.previous_lesson')}
            {previous.lectureId !== data.lecture.id ? (
              <span className="block max-w-36 truncate text-xs text-sub">
                {previous.title}
              </span>
            ) : null}
          </Link>
        ) : (
          <span />
        )}
        <span className="text-xs text-sub">
          {index >= 0
            ? t('pdf.lesson', {
                current: lectureIndex + 1,
                total: lectureMaterials.length,
              })
            : t('pdf.resources')}
        </span>
        {next ? (
          <Link className="text-sm text-brand" href={path(next)}>
            {t('pdf.next_lesson')}
            {next.lectureId !== data.lecture.id ? (
              <span className="block max-w-36 truncate text-xs text-sub">
                {next.title}
              </span>
            ) : null}
          </Link>
        ) : (
          <span />
        )}
      </footer>
    </main>
  );
}
