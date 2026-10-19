'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Minus,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { pdfApi } from '@/lib/pdf-api';
import 'react-pdf/dist/Page/TextLayer.css';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
const options = {
  isEvalSupported: false,
  enableXfa: false,
  stopAtErrors: true,
};
const button =
  'grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink hover:bg-canvas disabled:opacity-40';
export function PdfCanvas({
  academyId,
  materialId,
  preview = false,
  exerciseMaterialId,
}: {
  academyId: string;
  materialId: string;
  preview?: boolean;
  exerciseMaterialId?: string;
}) {
  const { t } = useTranslation('content');
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ['pdf', academyId, materialId, preview, ...(exerciseMaterialId ? [exerciseMaterialId] : [])],
    queryFn: () => pdfApi.read({ academyId, materialId, preview, exerciseMaterialId }),
    retry: false,
    staleTime: 0,
  });
  const data = query.data;
  const [error, setError] = useState<string>();
  const [inputError, setInputError] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState<'width' | 'page' | null>('width');
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [original, setOriginal] = useState({ width: 612, height: 792 });
  const [fallback, setFallback] = useState(false);
  const renewed = useRef(false);
  const load = () => query.refetch();
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      // Hidden mobile/reference tabs retain their renderer and last valid geometry.
      if (node.clientWidth > 32 && node.clientHeight > 32)
        setSize({ width: node.clientWidth - 32, height: node.clientHeight - 32 });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data]);
  const file = useMemo(() => (data ? { url: data.url } : undefined), [data]);
  const scale =
    fit === 'width'
      ? size.width / original.width
      : fit === 'page'
        ? Math.min(size.width / original.width, size.height / original.height)
        : zoom / 100;
  const shownZoom = Math.round(scale * 100);
  async function download() {
    try {
      const result = await pdfApi.read({
        academyId,
        materialId,
        preview,
        exerciseMaterialId,
        download: true,
      });
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.pdf.originalFilename;
      link.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF_STORAGE_FAILED');
    }
  }
  async function fullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fallback) {
      setFallback(false);
      return;
    }
    try {
      await root.current?.requestFullscreen();
    } catch {
      setFallback(true);
    }
  }
  const changeZoom = (value: number) => {
    if (Number.isFinite(value)) {
      setFit(null);
      setZoom(Math.min(300, Math.max(25, value)));
    }
  };
  if (!data || query.isError)
    return (
      <div
        role={error || query.isError ? 'alert' : 'status'}
        className="p-6 text-sub"
      >
        {error || query.isError
          ? t(`pdf.errors.${error}`, { defaultValue: t('pdf.unavailable') })
          : t('pdf.loading')}
        {query.isError ? (
          <button onClick={() => void load()} className="ml-3 underline">
            {t('pdf.retry')}
          </button>
        ) : null}
      </div>
    );
  return (
    <div
      ref={root}
      className={
        fallback
          ? 'fixed inset-0 z-[100] flex flex-col bg-canvas'
          : 'flex h-full min-h-0 flex-col bg-canvas'
      }
      data-testid="pdf-reader"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card p-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            className={button}
            aria-label={t('pdf.previous_page')}
            disabled={page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <label className="flex items-center gap-1 text-sm">
            <span className="sr-only">{t('pdf.page')}</span>
            <input
              aria-label={t('pdf.page')}
              className="w-14 rounded border border-border bg-card p-1 text-center"
              type="number"
              min={1}
              max={data.pdf.pageCount}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= data.pdf.pageCount && Number.isInteger(n)) {
                  setPage(n);
                  setInputError(false);
                } else setInputError(true);
              }}
            />
            <span>/ {data.pdf.pageCount}</span>
          </label>
          <button
            className={button}
            aria-label={t('pdf.next_page')}
            disabled={page >= data.pdf.pageCount}
            onClick={() => setPage((n) => n + 1)}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            className={button}
            aria-label={t('pdf.zoom_out')}
            onClick={() => changeZoom(shownZoom - 25)}
          >
            <Minus className="size-4" />
          </button>
          <input
            aria-label={t('pdf.zoom')}
            className="w-16 rounded border border-border bg-card p-1 text-center text-sm"
            type="number"
            min={25}
            max={300}
            value={shownZoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
          <span className="text-sm">%</span>
          <button
            className={button}
            aria-label={t('pdf.zoom_in')}
            onClick={() => changeZoom(shownZoom + 25)}
          >
            <Plus className="size-4" />
          </button>
          <button
            className="rounded border border-border px-2 py-1 text-xs"
            aria-pressed={fit === 'width'}
            onClick={() => setFit('width')}
          >
            {t('pdf.fit_width')}
          </button>
          <button
            className="rounded border border-border px-2 py-1 text-xs"
            aria-pressed={fit === 'page'}
            onClick={() => setFit('page')}
          >
            {t('pdf.fit_page')}
          </button>
          <button
            className={button}
            aria-label={t('pdf.download')}
            onClick={() => void download()}
          >
            <Download className="size-4" />
          </button>
          <button
            className={button}
            aria-label={t('pdf.fullscreen')}
            onClick={() => void fullscreen()}
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </div>
      {inputError ? (
        <p role="alert" className="p-2 text-sm text-danger">
          {t('pdf.invalid_page', { total: data.pdf.pageCount })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="p-2 text-danger">
          {t('pdf.unavailable')}
          <button onClick={() => void load()} className="ml-3 underline">
            {t('pdf.retry')}
          </button>
        </p>
      ) : null}
      <div ref={viewport} className="min-h-0 flex-1 overflow-auto p-4">
        <Document
          file={file}
          options={options}
          error={<p role="alert">{t('pdf.unavailable')}</p>}
          onLoadSuccess={(document) => {
            setPage(current => Math.min(current, document.numPages));
            setError(undefined);
          }}
          loading={<p role="status">{t('pdf.loading')}</p>}
          onLoadError={() => {
            if (!renewed.current) {
              renewed.current = true;
              void load();
            } else setError('PDF_NOT_AVAILABLE');
          }}
        >
          <Page
            key={page}
            className="mx-auto w-fit shadow-sm"
            pageNumber={page}
            scale={Math.max(0.1, scale)}
            renderTextLayer
            renderAnnotationLayer={false}
            error={<p role="alert">{t('pdf.unavailable')}</p>}
            onLoadError={() => setError('PDF_NOT_AVAILABLE')}
            onRenderError={() => setError('PDF_NOT_AVAILABLE')}
            onLoadSuccess={(p) => {
              const view = p.getViewport({ scale: 1 });
              setOriginal({ width: view.width, height: view.height });
            }}
            loading={<p role="status">{t('pdf.loading')}</p>}
          />
        </Document>
      </div>
    </div>
  );
}
