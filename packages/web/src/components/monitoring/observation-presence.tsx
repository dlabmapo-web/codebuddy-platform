'use client';
import type { ObservationAwarenessEvent } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import { RemotePointer } from './remote-pointer';

export function ObservationPresence({ awareness, materialId, name }: {
  awareness: ObservationAwarenessEvent | null; materialId: string | null; name: string;
}) {
  const { t } = useTranslation('monitoring');
  if (!awareness) return null;
  const pointer = awareness.materialId === materialId && awareness.pointer?.surface !== 'editor' ? awareness.pointer : null;
  return <>
    {pointer ? <RemotePointer name={name} pointer={pointer} /> : null}
    {awareness.focus ? <p data-testid="observation-focus" className="pointer-events-none fixed left-1/2 bottom-3 md:bottom-auto md:top-3 z-[95] max-w-[80vw] -translate-x-1/2 truncate rounded-full border border-peer/30 bg-card px-3 py-1 text-xs font-semibold text-peer shadow-md">
      {t('peer.looking_at', { name, surface: t(`peer.surface.${awareness.focus}`) })}{awareness.focus === 'editor' && awareness.editor ? <span className="ml-1 font-mono">· {awareness.editor.file}:{awareness.editor.cursor.line}</span> : null}
    </p> : null}
  </>;
}
