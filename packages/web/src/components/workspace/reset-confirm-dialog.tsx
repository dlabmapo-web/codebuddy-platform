'use client';

import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { Modal, ModalContent } from '@/components/studio/primitives';

/**
 * Reset's confirmation, in Cove's own dialog rather than the browser's.
 * Shared by every coding workspace, Python and C/C++ alike, through the
 * editor pane. `portalContainer` keeps it visible in a fullscreen workspace.
 */
export function ResetConfirmDialog({
  copy,
  onCancel,
  onConfirm,
  open,
  portalContainer,
}: {
  copy: { title: string; body: string; cancel: string; confirm: string };
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  portalContainer?: HTMLElement | null;
}) {
  return (
    <Modal onOpenChange={(next) => { if (!next) onCancel(); }} open={open}>
      <ModalContent className="max-w-md" description={copy.body} portalContainer={portalContainer} title={copy.title}>
        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button onClick={onCancel} type="button" variant="ghost">
            {copy.cancel}
          </Button>
          <Button autoFocus onClick={onConfirm} type="button">
            <RotateCcw aria-hidden className="size-4" />
            {copy.confirm}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
