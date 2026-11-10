'use client';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  PencilLine,
} from 'lucide-react';
import {
  explanationBodyMaxLength,
  hasExplanationContent,
  type ExplanationAuthorContext,
  type ExplanationDocument,
} from '@cove/shared';
import { RichEditor } from '@/components/editor/RichEditor';
import { PrivateImageContext } from '@/components/editor/private-image-context';
import { explanationApi } from '@/lib/explanation-api';
import { manualApi } from '@/lib/manual-api';
import { ExplanationContent } from './explanation-content';
import { useExplanationTranslation } from './use-explanation-translation';

/** A routed authoring workspace. Initial content and image metadata are read on the server. */
export function ExplanationAuthorWorkspace({
  target,
  context,
  initial,
  backHref,
  authorBaseHref,
  editable = true,
}: {
  target: { academyId: string; courseId: string; lectureId: string };
  context: ExplanationAuthorContext;
  initial?: ExplanationDocument | null;
  backHref: string;
  authorBaseHref: string;
  editable?: boolean;
}) {
  const { t } = useExplanationTranslation();
  const router = useRouter();
  const cache = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [isVisible, setVisible] = useState(initial?.isVisible ?? false);
  const [revision, setRevision] = useState(initial?.revision);
  const [savedId, setSavedId] = useState(initial?.materialId);
  const [baseline, setBaseline] = useState(
    JSON.stringify([
      initial?.title ?? '',
      initial?.body ?? '',
      initial?.isVisible ?? false,
    ]),
  );
  const [preview, setPreview] = useState(!editable);
  const [saving, setSaving] = useState(false);
  const [imageState, setImageState] = useState({
    pending: false,
    error: false,
  });
  const [error, setError] = useState<string>();
  const [localImages, setImages] = useState<Record<string, string>>({});
  const urls = useRef<string[]>([]);
  const inputId = useId();
  const dirty = JSON.stringify([title, body, isVisible]) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const guardLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        'a[href]',
      );
      if (
        !link ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        link.href === location.href
      )
        return;
      if (!window.confirm(t('discard'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLink, true);
    };
  }, [dirty, t]);
  useEffect(
    () => () => urls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  const images = useMemo(
    () => ({ ...initial?.images, ...localImages }),
    [initial?.images, localImages],
  );
  const resolve = useCallback(
    async (src: string) => {
      const url = images[src.replace('cove-asset:', '').toLowerCase()];
      if (!url) throw new Error('Image unavailable');
      return url;
    },
    [images],
  );
  function back() {
    if (
      !saving &&
      !imageState.pending &&
      (!dirty || window.confirm(t('discard')))
    )
      router.push(backHref);
  }
  async function upload(file: File) {
    const asset = await manualApi.upload(target, file);
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setImages((values) => ({ ...values, [asset.assetId]: url }));
    return `cove-asset:${asset.assetId}`;
  }
  async function save() {
    if (saving || !editable || imageState.pending || imageState.error) return;
    if (!title.trim() || !hasExplanationContent(body)) {
      setError(t('invalid'));
      return;
    }
    if (body.length > explanationBodyMaxLength) {
      setError(t('too_long'));
      return;
    }
    setSaving(true);
    setError(undefined);
    let persisted = false;
    try {
      const creating = !savedId;
      const result = await explanationApi.save({
        ...target,
        materialId: savedId,
        expectedRevision: revision,
        title,
        body,
        isVisible,
      });
      persisted = true;
      setSavedId(result.materialId);
      setRevision(result.revision);
      setBaseline(JSON.stringify([title, body, isVisible]));
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['academy', target.academyId, 'course', target.courseId],
        }),
        cache.invalidateQueries({ queryKey: ['explanation'] }),
        cache.invalidateQueries({ queryKey: ['material-navigation'] }),
      ]);
      if (creating)
        router.replace(`${authorBaseHref}/${result.materialId}`, {
          scroll: false,
        });
      else router.refresh();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(
        t(
          persisted
            ? 'refresh_failed'
            : code === 'CONTENT_EDIT_CONFLICT'
              ? 'conflict'
              : code === 'CONTENT_VALIDATION_FAILED'
                ? 'invalid'
                : 'error',
        ),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="flex min-h-[calc(100dvh-3.5rem)] w-full flex-col bg-canvas text-ink"
      aria-label={t(initial ? (editable ? 'edit' : 'type') : 'add')}
    >
      <header className="sticky top-14 z-20 border-b border-border bg-card/95 px-4 py-4 backdrop-blur-sm sm:px-7">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3">
          <button
            type="button"
            aria-label={t('back_to_course')}
            onClick={back}
            disabled={saving || imageState.pending}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40"
          >
            <ArrowLeft aria-hidden className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-sub">
              {context.course.title} / {context.lecture.title}
            </p>
            <h1 className="mt-1 text-lg font-bold tracking-tight">
              {t(initial ? (editable ? 'edit' : 'type') : 'add')}
            </h1>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-sub">
            {isVisible ? (
              <Eye aria-hidden className="size-3.5" />
            ) : (
              <EyeOff aria-hidden className="size-3.5" />
            )}
            {t(isVisible ? 'visible' : 'hidden')}
          </span>
          {editable ? (
            <button
              type="button"
              disabled={
                saving ||
                imageState.pending ||
                imageState.error ||
                !title.trim() ||
                !hasExplanationContent(body)
              }
              onClick={() => void save()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
              ) : (
                <Check aria-hidden className="size-4" />
              )}
              {t(saving ? 'saving' : 'save')}
            </button>
          ) : null}
        </div>
        <div className="mx-auto mt-4 flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label={t('type')}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const tabs = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role=tab]',
                ),
              ];
              const index = tabs.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index +
                        (event.key === 'ArrowLeft' ? -1 : 1) +
                        tabs.length) %
                      tabs.length;
              tabs[next]?.focus();
              tabs[next]?.click();
            }}
            className="flex rounded-lg bg-canvas p-1"
          >
            {editable ? (
              <button
                role="tab"
                tabIndex={preview ? -1 : 0}
                aria-selected={!preview}
                aria-controls={`${inputId}-sheet`}
                type="button"
                onClick={() => setPreview(false)}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand ${!preview ? 'bg-card text-brand shadow-sm' : 'text-sub'}`}
              >
                <PencilLine aria-hidden className="size-4" />
                {t('write')}
              </button>
            ) : null}
            <button
              role="tab"
              tabIndex={!preview && editable ? -1 : 0}
              disabled={imageState.pending}
              aria-selected={preview}
              aria-controls={`${inputId}-sheet`}
              type="button"
              onClick={() => setPreview(true)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand ${preview ? 'bg-card text-brand shadow-sm' : 'text-sub'}`}
            >
              <Eye aria-hidden className="size-4" />
              {t('preview')}
            </button>
          </div>
          <p
            role="status"
            className="flex items-center gap-1.5 text-xs text-sub"
          >
            {imageState.pending ? (
              <LoaderCircle aria-hidden className="size-3 animate-spin" />
            ) : !dirty && Boolean(savedId) ? (
              <Check aria-hidden className="size-3" />
            ) : null}
            {t(
              imageState.pending
                ? 'uploading'
                : dirty
                  ? 'unsaved'
                  : savedId
                    ? 'saved'
                    : 'ready',
            )}
          </p>
        </div>
      </header>
      {error ? (
        <p
          role="alert"
          className="mx-4 mt-4 rounded-xl bg-danger/10 p-4 text-sm leading-6 text-danger sm:mx-7"
        >
          {error}
        </p>
      ) : null}
      <div
        id={`${inputId}-sheet`}
        role="tabpanel"
        aria-label={t(preview ? 'preview' : 'write')}
        className="min-w-0 flex-1 px-3 pb-8 sm:px-7"
      >
        {preview ? (
          <>
            <p className="mx-auto mt-6 max-w-[1440px] text-sm text-sub">
              {t('preview_hint')}
            </p>
            {hasExplanationContent(body) ? (
              <ExplanationContent
                title={title || t('title')}
                body={body}
                images={images}
                lectureTitle={context.lecture.title}
              />
            ) : (
              <div className="mx-auto my-6 grid min-h-80 max-w-[1440px] place-content-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sub">
                <BookOpen aria-hidden className="mx-auto size-8 text-brand" />
                <p className="text-sm">{t('empty_preview')}</p>
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto my-6 w-full max-w-[1440px] rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8 lg:p-10">
            <label
              htmlFor={inputId}
              className="mb-3 block text-xs font-semibold uppercase tracking-wide text-sub"
            >
              {t('title')}
            </label>
            <input
              id={inputId}
              autoFocus={!initial}
              value={title}
              maxLength={200}
              disabled={saving}
              placeholder={t('title_placeholder')}
              onChange={(event) => setTitle(event.target.value)}
              className="mb-8 w-full border-0 border-b border-border bg-transparent pb-5 text-2xl font-bold tracking-tight text-ink outline-none placeholder:text-sub/50 focus:border-brand sm:text-3xl"
            />
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sub">
              <BookOpen aria-hidden className="size-4 text-brand" />
              {t('content')}
            </div>
            <PrivateImageContext.Provider value={resolve}>
              <RichEditor
                value={body}
                onChange={setBody}
                codeExamples
                placeholder={t('placeholder')}
                minHeight={480}
                onImageUpload={upload}
                onImageUploadStateChange={setImageState}
                editable={!saving}
              />
            </PrivateImageContext.Provider>
            <p className="mt-4 text-xs leading-6 text-sub">
              {t('code_help')}
              <span className="block">
                {t('images_hint')} {t('image_formats')}
              </span>
            </p>
          </div>
        )}
      </div>
      <footer className="border-t border-border bg-card px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 text-xs text-sub">
          {initial && editable ? (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isVisible}
                disabled={saving}
                onChange={(event) => setVisible(event.target.checked)}
                className="size-4 accent-brand"
              />
              {t('visibility')}
            </label>
          ) : (
            <span>
              {t(initial ? (isVisible ? 'visible' : 'hidden') : 'new_hidden')}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <BookOpen aria-hidden className="size-3.5" />
            {t('ungraded')}
          </span>
        </div>
      </footer>
    </section>
  );
}
