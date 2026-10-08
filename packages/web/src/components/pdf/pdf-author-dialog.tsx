'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PdfMetadata, PdfPlacement } from '@cove/shared';
import { pdfMaxUploadBytes } from '@cove/shared';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { pdfApi } from '@/lib/pdf-api';
import { PdfReader } from './pdf-reader';
export function PdfAuthorDialog({
  target,
  material,
  editable,
  onClose,
  onSaved,
  initialPreview = false,
}: {
  target: { academyId: string; courseId: string; lectureId: string };
  material?: { id: string; title: string; pdfDocument?: PdfMetadata | null };
  editable: boolean;
  initialPreview?: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { t } = useTranslation('content');
  const [title, setTitle] = useState(material?.title ?? '');
  const [placement, setPlacement] = useState<PdfPlacement>(
    material?.pdfDocument?.placement ?? 'MAIN',
  );
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState(initialPreview);
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
      await pdfApi.save({
        ...target,
        materialId: material?.id,
        revision: material?.pdfDocument?.revision,
        title,
        placement,
        assetId: asset?.assetId,
      });
      await onSaved();
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
            className="overflow-auto"
          >
            <div className="grid gap-4 p-6">
              <label className="grid gap-1 text-sm font-bold">
                {t('pdf.title')}
                <input
                  className="rounded-lg border border-border bg-card p-3"
                  maxLength={128}
                  required
                  value={title}
                  disabled={!editable || busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                {t('pdf.placement')}
                <select
                  className="rounded-lg border border-border bg-card p-3"
                  value={placement}
                  disabled={!editable || busy}
                  onChange={(e) => setPlacement(e.target.value as PdfPlacement)}
                >
                  {(['MAIN', 'SUPPLEMENTARY', 'BOTH'] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(`pdf.placements.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="grid gap-2 rounded-lg border-2 border-dashed border-border bg-canvas p-5 text-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (editable && !busy) chooseFiles(e.dataTransfer.files);
                }}
              >
                {t(material ? 'pdf.replace' : 'pdf.choose')}
                <input
                  ref={inputRef}
                  aria-label={t('pdf.file')}
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={!editable || busy}
                  onChange={(e) => chooseFiles(e.target.files)}
                />
                <span className="text-sub">
                  {file
                    ? `${file.name} · ${(file.size / 1e6).toFixed(2)} MB`
                    : (material?.pdfDocument?.originalFilename ??
                      t('pdf.limit'))}
                </span>
              </label>
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
            {file ? (
              <button
                type="button"
                disabled={busy}
                className="mx-6 mb-4 text-sm text-brand"
                onClick={() => {
                  setFile(undefined);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                {t('pdf.remove_selection')}
              </button>
            ) : null}
            {material ? (
              <p className="px-6 pb-4 text-xs text-sub">
                {t('pdf.replacement_notice')}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas p-4">
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
                className="rounded-lg border border-border px-4 py-2"
                onClick={cancel}
              >
                {t('pdf.cancel')}
              </button>
              {editable ? (
                <button
                  disabled={busy || !title.trim() || (!material && !file)}
                  className="rounded-lg bg-brand px-4 py-2 font-bold text-on-brand"
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
