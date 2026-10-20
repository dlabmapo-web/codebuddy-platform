'use client';
import { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { PdfMetadata, PdfPlacement } from '@cove/shared';
import { pdfMaxUploadBytes } from '@cove/shared';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { ChoiceSelector } from '@/components/studio/choice-selector';
import { CheckCircle2, FileText, UploadCloud, X } from 'lucide-react';
import { pdfApi } from '@/lib/pdf-api';
import { PdfReader } from './pdf-reader';
function formatPdfFileSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function PdfAuthorDialog({
  target,
  material,
  editable,
  onClose,
  onSaved,
  initialPreview = false,
  initialPlacement = "MAIN",
  referringExercises = [],
}: {
  target: { academyId: string; courseId: string; lectureId: string };
  material?: { id: string; title: string; pdfDocument?: PdfMetadata | null };
  editable: boolean;
  initialPreview?: boolean;
  onClose: () => void;
  onSaved: (result: { materialId: string }) => Promise<unknown>;
  initialPlacement?: PdfPlacement;
  referringExercises?: Array<{ title: string }>;
}) {
  const { t } = useTranslation(['content', 'pdf-practice']);
  const [title, setTitle] = useState(material?.title ?? '');
  const [placement, setPlacement] = useState<PdfPlacement>(
    material?.pdfDocument?.placement ?? initialPlacement,
  );
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState(initialPreview);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canceledRef = useRef(false);
  useEffect(() => () => abortRef.current?.abort(), []);
  function cancel() {
    canceledRef.current = true;
    abortRef.current?.abort();
    onClose();
  }
  function choose(file?: File) {
    setError(undefined);
    setFile(undefined);
    if (!file) return;
    if (file.size > pdfMaxUploadBytes) {
      setError('PDF_TOO_LARGE');
      return;
    }
    if (!file.size || !/\.pdf$/i.test(file.name)) {
      setError('PDF_INVALID');
      return;
    }
    setFile(file);
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ''));
  }
  function chooseFiles(files?: FileList | null) {
    if (files && files.length > 1) {
      setFile(undefined);
      setError('PDF_INVALID');
      return;
    }
    choose(files?.[0]);
  }
  async function save() {
    abortRef.current = new AbortController();
    canceledRef.current = false;
    setBusy(true);
    setError(undefined);
    try {
      const asset = file
        ? await pdfApi.upload(
            target,
            file,
            setProgress,
            abortRef.current.signal,
          )
        : undefined;
      if (canceledRef.current) return;
      const result = await pdfApi.save({
        ...target,
        materialId: material?.id,
        revision: material?.pdfDocument?.revision,
        title,
        placement,
        assetId: asset?.assetId,
      });
      await onSaved(result);
      if (!canceledRef.current) onClose();
    } catch (e) {
      if (canceledRef.current) return;
      setError(e instanceof Error ? e.message : 'PDF_STORAGE_FAILED');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <ModalContent
        className={preview ? 'max-w-5xl h-[90vh]' : 'max-w-lg'}
        title={t(material ? 'pdf.edit' : 'pdf.add')}
        description={t('pdf.description')}
      >
        <button type="button" aria-label={t('pdf.cancel')} onClick={cancel} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"><X aria-hidden className="size-5" /></button>
        {preview && material ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <button
              className="self-end px-4 py-2 text-brand"
              onClick={() => setPreview(false)}
            >
              {t('pdf.back')}
            </button>
            <PdfReader
              academyId={target.academyId}
              materialId={material.id}
              preview
            />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6">
              {referringExercises.length ? <div role="status" className="text-sm text-sub"><p>{t("pdf-practice:in_use")}</p><ul className="list-disc pl-5">{referringExercises.map((exercise, index) => <li key={index}>{exercise.title}</li>)}</ul></div> : null}
              <label className="grid gap-2 text-sm font-semibold">
                {t('pdf.title')}
                <input
                  className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  maxLength={128}
                  required
                  value={title}
                  disabled={!editable || busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="grid gap-2">
                <p className="text-sm font-semibold">{t('pdf.placement')}</p>
                <ChoiceSelector
                  label={t('pdf.placement')}
                  className="bg-card"
                  selectedId={placement}
                  disabled={!editable || busy}
                  list={(['MAIN', 'SUPPLEMENTARY', 'BOTH'] as const).map((value) => ({
                    id: value, name: t(`pdf.placements.${value}`),
                    description: t(`pdf.upload_ui.placements.${value}`),
                    disabled: value === 'MAIN' && referringExercises.length > 0,
                  }))}
                  onSelect={(item) => setPlacement(item.id)}
                  renderItem={(item) => <span className="block"><span className="block font-medium">{item.name}</span><span className="mt-0.5 block text-xs leading-relaxed text-sub">{item.description}</span></span>}
                />
              </div>
              <div>
                <input
                  id={inputId}
                  ref={inputRef}
                  className="peer sr-only"
                  aria-label={t('pdf.file')}
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={!editable || busy}
                  onChange={(e) => chooseFiles(e.target.files)}
                />
                <label htmlFor={inputId}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand ${!editable || busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-brand/50 hover:bg-brand-soft/50'} ${dragging ? 'border-brand bg-brand-soft' : file ? 'border-success/40 bg-success/5' : 'border-brand/25 bg-brand-soft/30'}`}
                  onDragOver={(e) => { e.preventDefault(); if (editable && !busy) setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); if (editable && !busy) chooseFiles(e.dataTransfer.files); }}
                >
                  <span className={`mb-1 grid size-12 place-items-center rounded-xl ${file ? 'bg-success/10 text-success' : 'bg-brand-soft text-brand'}`}>
                    {file ? <CheckCircle2 aria-hidden className="size-6" /> : <UploadCloud aria-hidden className="size-6" />}
                  </span>
                  <span className="text-sm font-semibold text-ink">{t(material ? 'pdf.replace' : 'pdf.choose')}</span>
                  <span className="text-xs text-sub">{t('pdf.limit')}</span>
                  <span className="mt-2 rounded-lg border border-brand/20 bg-card px-3 py-2 text-sm font-semibold text-brand">{t('pdf.upload_ui.browse')}</span>
                </label>
                {file || material?.pdfDocument ? <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-canvas/60 p-3">
                  <FileText aria-hidden className="size-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file?.name ?? material?.pdfDocument?.originalFilename}</p><p className="text-xs text-sub">{formatPdfFileSize(file?.size ?? material?.pdfDocument?.byteSize ?? 0)}</p></div>
                  {file ? <button type="button" aria-label={t('pdf.remove_selection')} disabled={busy} onClick={() => { setFile(undefined); if (inputRef.current) inputRef.current.value = ''; }} className="grid size-8 place-items-center rounded-lg text-sub hover:bg-card hover:text-danger focus-visible:outline-2 focus-visible:outline-brand"><X aria-hidden className="size-4" /></button> : null}
                </div> : null}
              </div>
              {busy ? (
                <p role="status">
                  {progress < 100
                    ? t('pdf.uploading', { progress })
                    : t('pdf.validating')}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-danger">
                  {t(`pdf.errors.${error}`, {
                    defaultValue: t('pdf.unavailable'),
                  })}
                </p>
              ) : null}
            </div>
            {material ? (
              <p className="px-6 pb-4 text-xs text-sub">
                {t('pdf.replacement_notice')}
              </p>
            ) : null}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-canvas/60 px-6 py-4">
              {material ? (
                <button
                  type="button"
                  className="mr-auto text-brand"
                  onClick={() => setPreview(true)}
                >
                  {t('pdf.open')}
                </button>
              ) : null}
              <button
                type="button"
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand"
                onClick={cancel}
              >
                {t('pdf.cancel')}
              </button>
              {editable ? (
                <button
                  disabled={busy || !title.trim() || (!material && !file)}
                  className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
                  type="submit"
                >
                  {t('pdf.save')}
                </button>
              ) : null}
            </div>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
