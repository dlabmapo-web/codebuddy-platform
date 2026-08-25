'use client';

import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { acceptedImageTypes, maxUploadBytes } from '@cove/shared';

import { Button } from '@/components/studio/button';
import {
  ProfileAvatar,
  type ProfileAvatarProps,
} from '@/components/studio/profile-avatar';
import { useTranslation } from 'react-i18next';
import { useErrorCode, useErrorText } from '@/i18n/client/use-error-text';
import { cn } from '@/lib/utils';
import {
  calculateSquareCrop,
  cropProfileImage,
  type CropPosition,
} from '../_lib/crop-image';

const cropViewportSize = 224;
const initialCrop: CropPosition = { zoom: 1, x: 0, y: 0 };

/**
 * Choose a photo, see it as a square, upload it.
 *
 * The preview is the honest part: the server centre-crops to 512 square, so
 * the picker shows the same square before anything is sent rather than
 * surprising someone with a cropped face afterwards. Nothing is uploaded until
 * the person confirms, and a failure leaves the previous picture in place.
 */
export function ImagePicker({
  avatar,
  name,
  sourceKind,
  canRemove,
  pending,
  error,
  onSelect,
  onRemove,
}: {
  avatar: ProfileAvatarProps;
  name: string;
  /** Which link of the fallback chain is currently on screen. */
  sourceKind: 'academy' | 'global' | 'external' | 'initials';
  canRemove: boolean;
  pending: boolean;
  error: unknown;
  /** Resolves when the new picture is the one on the profile. */
  onSelect: (file: File) => Promise<unknown>;
  onRemove: () => void;
}) {
  const { t } = useTranslation('profile');
  const errorText = useErrorText();
  const errorCode = useErrorCode();
  const inputId = useId();
  const zoomId = useId();
  const horizontalId = useId();
  const verticalId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropPosition>(initialCrop);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);

  const cropGeometry = useMemo(() => {
    if (!imageSize.width || !imageSize.height) return null;
    return calculateSquareCrop({
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      viewportSize: cropViewportSize,
      position: crop,
    });
  }, [crop, imageSize]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function choose(file: File | undefined) {
    setLocalError(null);
    if (!file) return;
    // Refused here as well as on the server, so a person on a slow connection
    // learns their 20 MB photo is too large before they wait for it.
    if (file.size > maxUploadBytes) {
      setLocalError(errorCode('PROFILE_IMAGE_TOO_LARGE'));
      return;
    }
    if (!(acceptedImageTypes as readonly string[]).includes(file.type)) {
      setLocalError(errorCode('PROFILE_IMAGE_TYPE_INVALID'));
      return;
    }
    setCrop(initialCrop);
    setImageSize({ width: 0, height: 0 });
    setPreview({ file, url: URL.createObjectURL(file) });
  }

  async function saveCrop() {
    const image = cropImageRef.current;
    if (!preview || !image) return;
    setLocalError(null);
    setProcessing(true);
    let cropped: File;
    try {
      cropped = await cropProfileImage(preview.file, image, crop);
    } catch {
      setLocalError(t('image.crop_failed'));
      setProcessing(false);
      return;
    }
    setProcessing(false);

    // The mutation owns and translates network/API failures. Keeping this
    // catch empty leaves its error visible while preserving the crop for retry.
    try {
      await onSelect(cropped);
      setPreview(null);
    } catch {
      // Reported through the `error` prop.
    }
  }

  const busy = pending || processing;

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <div className="relative">
        <span
          aria-hidden
          className="absolute -inset-1 rounded-full bg-[color:var(--accent-hue)]/25"
        />
        {preview ? (
          <div
            aria-label={t('image.crop_preview')}
            className="relative size-56 overflow-hidden rounded-full border-2 border-[color:var(--accent-hue)] bg-accent"
            role="img"
          >
            {/* A plain image is intentional: this is a local blob used by the
                crop canvas, not an asset that Next should optimize or fetch. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="absolute max-w-none select-none"
              draggable={false}
              onLoad={(event) => setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
              ref={cropImageRef}
              src={preview.url}
              style={cropGeometry ? {
                height: cropGeometry.renderedHeight,
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${cropGeometry.offsetX}px), calc(-50% + ${cropGeometry.offsetY}px))`,
                width: cropGeometry.renderedWidth,
              } : undefined}
            />
            <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-ink/20" />
          </div>
        ) : (
          <ProfileAvatar
            {...avatar}
            alt={t('image.alt', { name })}
            className="relative ring-2 ring-[color:var(--accent-hue)]"
            size="xl"
          />
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/55">
            <Loader2
              aria-hidden
              className="size-6 animate-spin text-canvas"
              strokeWidth={2.5}
            />
            <span className="sr-only">
              {processing ? t('image.preparing') : t('image.uploading')}
            </span>
          </span>
        ) : null}
      </div>

      {preview ? (
        <div className="w-full max-w-xs space-y-3" aria-label={t('image.crop_controls')}>
          <CropRange
            disabled={busy}
            id={zoomId}
            label={t('image.zoom')}
            max={3}
            min={1}
            onChange={(zoom) => setCrop((current) => ({ ...current, zoom }))}
            step={0.05}
            value={crop.zoom}
          />
          <CropRange
            disabled={busy || !cropGeometry || cropGeometry.renderedWidth <= cropViewportSize}
            id={horizontalId}
            label={t('image.horizontal')}
            max={1}
            min={-1}
            onChange={(x) => setCrop((current) => ({ ...current, x }))}
            step={0.05}
            value={crop.x}
          />
          <CropRange
            disabled={busy || !cropGeometry || cropGeometry.renderedHeight <= cropViewportSize}
            id={verticalId}
            label={t('image.vertical')}
            max={1}
            min={-1}
            onChange={(y) => setCrop((current) => ({ ...current, y }))}
            step={0.05}
            value={crop.y}
          />
          <p className="text-[12px] leading-[1.5] text-sub/85">
            {t('image.crop_help')}
          </p>
        </div>
      ) : null}

      {busy ? (
        <div
          aria-label={processing ? t('image.preparing') : t('image.uploading')}
          aria-valuetext={processing ? t('image.preparing') : t('image.uploading')}
          className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-accent"
          role="progressbar"
        >
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-brand" />
        </div>
      ) : null}

      {/* The fallback chain, made legible. Without it, "why is my Google photo
          here?" has no answer anywhere in the product. */}
      <p className="text-center text-[12px] font-semibold text-sub sm:text-left">
        <span className="uppercase tracking-[0.08em] text-sub/70">
          {t('image.source_label')}
        </span>
        <span className="ml-1.5 text-ink">{t(`image.source.${sourceKind}`)}</span>
      </p>

      <input
        accept={acceptedImageTypes.join(',')}
        className="sr-only"
        id={inputId}
        onChange={(event) => choose(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />

      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        {preview ? (
          <>
            <Button
              disabled={busy || !cropGeometry}
              onClick={() => void saveCrop()}
              size="sm"
              type="button"
            >
              {processing
                ? t('image.preparing')
                : pending
                  ? t('image.uploading')
                  : t('action.save')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => setPreview(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('action.cancel')}
            </Button>
          </>
        ) : (
          <Button
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Camera aria-hidden strokeWidth={2} />
            {sourceKind === 'initials' ? t('image.choose') : t('image.change')}
          </Button>
        )}
        {canRemove && !preview ? (
          <Button
            disabled={busy}
            onClick={onRemove}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden strokeWidth={2} />
            {t('image.remove')}
          </Button>
        ) : null}
      </div>

      <p
        className={cn(
          'max-w-xs text-center text-[12px] leading-[1.5] sm:text-left',
          localError || error ? 'text-danger' : 'text-sub/85',
        )}
        role={localError || error ? 'alert' : undefined}
      >
        {localError ?? (error ? errorText(error) : t('image.hint'))}
      </p>
    </div>
  );
}

function CropRange({
  id,
  label,
  value,
  onChange,
  ...props
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
} & Omit<React.ComponentProps<'input'>, 'id' | 'type' | 'value' | 'onChange'>) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
      <label className="text-[12px] font-semibold text-sub" htmlFor={id}>
        {label}
      </label>
      <input
        className="h-5 w-full accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        id={id}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
        {...props}
      />
    </div>
  );
}
