'use client';

import * as React from 'react';

import { Button } from '@/components/studio/button';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { cn } from '@/lib/utils';

/**
 * The one shape every irreversible act in Cove asks for.
 *
 * Deleting an academy, a course and a class are three different operations in
 * three different places, and a person meeting the third should already know
 * how it behaves: the thing's own name typed back, and a submit that stays
 * disabled until it matches. One component so the three cannot drift into
 * three different amounts of friction.
 *
 * The typing is a guard against the slip, not against the decision. The rules
 * that actually protect people — a course with student submissions cannot be
 * deleted at all — live on the server, where a determined click cannot reach
 * them.
 *
 * Every word arrives as a prop rather than from a namespace of its own.
 * `common` is a layout namespace, so three strings for two admin tables would
 * have been paid for in every student's page load — the budget in
 * `@cove/i18n`'s `locales.spec.ts` said so, and asked for exactly this.
 */
export function DeleteConfirmDialog({
  body,
  cancelLabel,
  confirmLabel,
  confirmValue,
  fieldLabel,
  onClose,
  onConfirm,
  open,
  pending,
  title,
  tone = 'danger',
  workingLabel,
}: {
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  /** The exact text the reader has to type: a course title, a class name. */
  confirmValue: string;
  fieldLabel: string;
  onClose: () => void;
  onConfirm: (typed: string) => Promise<unknown>;
  open: boolean;
  pending: boolean;
  title: string;
  /**
   * What kind of irreversible this is.
   *
   * `danger` is the default and the original case: the thing being confirmed
   * destroys something. `brand` is for an act that cannot be undone and takes
   * nothing away — a maintenance re-grade restores records and can only add to
   * a student's standing, and painting that button red would ask an operator
   * to brace for damage that is not coming.
   *
   * The typed-confirmation itself does not vary. What earns it is
   * irreversibility, not destruction.
   */
  tone?: 'danger' | 'brand';
  workingLabel: string;
}) {
  const errorText = useErrorText();
  const [typed, setTyped] = React.useState('');
  const [error, setError] = React.useState<unknown>(null);

  const close = () => {
    setTyped('');
    setError(null);
    onClose();
  };

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={open}>
      <ModalContent description={body} title={title}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            try {
              await onConfirm(typed.trim());
              close();
            } catch (caught) {
              setError(caught);
            }
          }}
        >
          <div className="grid gap-1.5 px-6 py-5">
            <label
              className="text-[13.5px] font-bold text-ink"
              htmlFor="delete-confirm-value"
            >
              {fieldLabel}
              <span
                className={cn(
                  'ml-1',
                  tone === 'danger' ? 'text-danger' : 'text-brand',
                )}
              >
                *
              </span>
            </label>
            <input
              autoComplete="off"
              className={cn(
                'h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none focus-visible:ring-2',
                tone === 'danger'
                  ? 'focus-visible:border-danger focus-visible:ring-danger/30'
                  : 'focus-visible:border-brand focus-visible:ring-brand/30',
              )}
              id="delete-confirm-value"
              onChange={(event) => setTyped(event.target.value)}
              value={typed}
            />
            {error ? (
              <p className="mt-1 text-[13px] text-danger" role="alert">
                {errorText(error)}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="ghost"
            >
              {cancelLabel}
            </Button>
            <Button
              disabled={pending || typed.trim() !== confirmValue.trim()}
              type="submit"
              variant={tone === 'danger' ? 'danger' : 'default'}
            >
              {pending ? workingLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
