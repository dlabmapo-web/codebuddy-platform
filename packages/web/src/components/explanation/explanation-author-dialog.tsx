'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Check, Eye, EyeOff, LoaderCircle, PencilLine, X } from 'lucide-react';
import { explanationBodyMaxLength, hasExplanationContent } from '@cove/shared';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { RichEditor } from '@/components/editor/RichEditor';
import { PrivateImageContext } from '@/components/editor/private-image-context';
import { explanationApi } from '@/lib/explanation-api';
import { manualApi } from '@/lib/manual-api';
import { ExplanationContent } from './explanation-content';
import { useExplanationTranslation } from './use-explanation-translation';

export function ExplanationAuthorDialog({ target, material, editable = true, initialPreview = false, onClose, onSaved }: {
  target: { academyId: string; courseId: string; lectureId: string };
  material?: { id: string; title: string }; editable?: boolean; initialPreview?: boolean;
  onClose: () => void; onSaved: (result: { materialId: string }) => Promise<unknown>;
}) {
  const { t } = useExplanationTranslation();
  const [title, setTitle] = useState(material?.title ?? '');
  const [body, setBody] = useState('');
  const [isVisible, setVisible] = useState(false);
  const [revision, setRevision] = useState<number>();
  const [baseline, setBaseline] = useState(JSON.stringify([material?.title ?? '', '', false]));
  const [preview, setPreview] = useState(initialPreview || !editable);
  const [saving, setSaving] = useState(false);
  const [imageState, setImageState] = useState({ pending: false, error: false });
  const [error, setError] = useState<string>();
  const [localImages, setImages] = useState<Record<string, string>>({});
  const urls = useRef<string[]>([]);
  const loaded = useRef(false);
  const savedId = useRef<string | undefined>(undefined);
  const inputId = useId();
  const query = useQuery({ queryKey: ['explanation-author', target.academyId, material?.id], enabled: Boolean(material), retry: false,
    queryFn: () => explanationApi.read({ academyId: target.academyId, materialId: material!.id, preview: true }) });
  useEffect(() => {
    if (!query.data || loaded.current) return;
    loaded.current = true;
    const value = query.data;
    setTitle(value.title); setBody(value.body); setVisible(value.isVisible); setRevision(value.revision);
    setBaseline(JSON.stringify([value.title, value.body, value.isVisible]));
  }, [query.data]);
  const dirty = JSON.stringify([title, body, isVisible]) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);
  const images = useMemo(() => ({ ...query.data?.images, ...localImages }), [query.data?.images, localImages]);
  const resolve = useCallback(async (src: string) => { const url = images[src.replace('cove-asset:', '').toLowerCase()]; if (!url) throw new Error('Image unavailable'); return url; }, [images]);
  const close = () => { if (!saving && !imageState.pending && (!dirty || window.confirm(t('discard')))) onClose(); };
  async function upload(file: File) {
    const asset = await manualApi.upload(target, file);
    const url = URL.createObjectURL(file); urls.current.push(url);
    setImages(values => ({ ...values, [asset.assetId]: url }));
    return `cove-asset:${asset.assetId}`;
  }
  async function save() {
    if (saving || imageState.pending || imageState.error) return;
    if (!title.trim() || !hasExplanationContent(body)) { setError(t('invalid')); return; }
    if (body.length > explanationBodyMaxLength) { setError(t('too_long')); return; }
    setSaving(true); setError(undefined);
    let persisted = false;
    try {
      const result = await explanationApi.save({ ...target, materialId: material?.id ?? savedId.current, expectedRevision: revision, title, body, isVisible });
      persisted = true; savedId.current = result.materialId; setRevision(result.revision);
      setBaseline(JSON.stringify([title, body, isVisible]));
      await onSaved(result); onClose();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(t(persisted ? 'refresh_failed' : code === 'CONTENT_EDIT_CONFLICT' ? 'conflict' : code === 'CONTENT_VALIDATION_FAILED' ? 'invalid' : 'error'));
    } finally { setSaving(false); }
  }
  const ready = !material || revision !== undefined;
  return <Modal open onOpenChange={open => { if (!open) close(); }}><ModalContent title={t(material ? 'edit' : 'add')} description={t('description')} className="h-[92dvh] max-w-5xl">
    <button type="button" aria-label={t('close')} disabled={saving || imageState.pending} onClick={close} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand"><X aria-hidden className="size-5" /></button>
    {!ready ? <div className="grid flex-1 place-content-center gap-4 p-8 text-center"><p role={query.isError ? 'alert' : 'status'} className="text-sm text-sub">{t(query.isError ? 'unavailable' : 'loading')}</p>{query.isError ? <button type="button" className="text-brand" onClick={() => void query.refetch()}>{t('retry')}</button> : null}</div> : <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div role="tablist" aria-label={t('type')} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
          tabs[next]?.focus(); tabs[next]?.click();
        }} className="flex rounded-lg bg-canvas p-1">
          {editable ? <button role="tab" tabIndex={preview ? -1 : 0} aria-selected={!preview} aria-controls={`${inputId}-sheet`} type="button" onClick={() => setPreview(false)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-brand ${!preview ? 'bg-card text-brand shadow-sm' : 'text-sub'}`}><PencilLine aria-hidden className="size-4" />{t('write')}</button> : null}
          <button role="tab" tabIndex={!preview && editable ? -1 : 0} aria-selected={preview} aria-controls={`${inputId}-sheet`} type="button" onClick={() => setPreview(true)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-brand ${preview ? 'bg-card text-brand shadow-sm' : 'text-sub'}`}><Eye aria-hidden className="size-4" />{t('preview')}</button>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sub">{isVisible ? <Eye aria-hidden className="size-3.5" /> : <EyeOff aria-hidden className="size-3.5" />}{t(isVisible ? 'visible' : 'hidden')}</span>
      </div>
      <div id={`${inputId}-sheet`} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto bg-canvas px-3 sm:px-6">
        {preview ? <><p className="mx-auto mt-5 max-w-4xl text-xs text-sub">{t('preview_hint')}</p>{hasExplanationContent(body) ? <ExplanationContent title={title || t('title')} body={body} images={images} /> : <div className="mx-auto my-6 grid min-h-72 max-w-4xl place-content-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sub"><BookOpen aria-hidden className="mx-auto size-8 text-brand" /><p className="text-sm">{t('empty_preview')}</p></div>}</> : <div className="mx-auto my-5 max-w-4xl rounded-2xl border border-border bg-card p-5 shadow-sm sm:my-6 sm:p-8">
          <label htmlFor={inputId} className="mb-2 block text-xs font-semibold text-sub">{t('title')}</label>
          <input id={inputId} autoFocus={!material} value={title} maxLength={200} disabled={saving} placeholder={t('title_placeholder')} onChange={event => setTitle(event.target.value)} className="mb-7 w-full border-0 border-b border-border bg-transparent pb-4 text-2xl font-bold tracking-tight text-ink outline-none placeholder:text-sub/50 focus:border-brand sm:text-3xl" />
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-sub"><BookOpen aria-hidden className="size-4 text-brand" />{t('content')}</div>
          <PrivateImageContext.Provider value={resolve}><RichEditor value={body} onChange={setBody} placeholder={t('placeholder')} minHeight={320} onImageUpload={upload} onImageUploadStateChange={setImageState} editable={!saving} /></PrivateImageContext.Provider>
          <p className="mt-4 text-xs leading-5 text-sub">{t('images_hint')}<span className="mt-1 block text-sub/80">{t('image_formats')}</span></p>
        </div>}
      </div>
      <footer className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-6">
        {error ? <p role="alert" className="mb-3 rounded-lg bg-danger/10 p-3 text-sm leading-6 text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0 text-xs text-sub">{material && editable ? <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={isVisible} disabled={saving} onChange={event => setVisible(event.target.checked)} className="size-4 accent-brand" />{t('visibility')}</label> : <span>{t('new_hidden')}</span>}
            <p role="status" className="mt-1.5 flex items-center gap-1.5 text-[11px]">{imageState.pending ? <LoaderCircle aria-hidden className="size-3 animate-spin" /> : !dirty ? <Check aria-hidden className="size-3" /> : null}{t(imageState.pending ? 'uploading' : dirty ? 'unsaved' : 'saved')}</p>
          </div>
          <button type="button" disabled={saving} onClick={close} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand">{t(editable ? 'cancel' : 'close')}</button>
          {editable ? <button type="button" disabled={saving || imageState.pending || imageState.error || !title.trim() || !hasExplanationContent(body)} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40">{saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}{t(saving ? 'saving' : 'save')}</button> : null}
        </div>
      </footer>
    </>}
  </ModalContent></Modal>;
}
