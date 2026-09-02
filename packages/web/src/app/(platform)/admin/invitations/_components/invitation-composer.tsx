'use client';

import type { AcademyRole } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { RoleSelector } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/role-selector';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import {
  AcademyField,
  type ConsoleAcademyOption,
} from '../../_components/academy-field';
import { InvitationLink } from '../../_components/invitation-link';
import { useSendInvitation } from '../../_hooks/use-platform-invitations';

/**
 * Inviting somebody, from a console that belongs to no academy.
 *
 * A manager's version of this dialog asks for an address and a role; the
 * academy is implicit because they have exactly one. An operator has none, so
 * this asks one more thing — and asks it **first**, because it is the decision
 * every other field depends on: a role means something different in each
 * academy, and an address is only wrong relative to a place.
 *
 * Everything else is the manager's dialog. `RoleSelector` is the one whose own
 * comment says it is "shared by members, applications, and invitations", the
 * copy comes from the `invitations` namespace both pages mount, and the send
 * calls `academyInvitations.create` — the same procedure, the same audit
 * record, the same email.
 *
 * ## Why it stays open after sending
 *
 * The response carries the token, and only its hash is stored: this is the one
 * moment the link can be shown. That is not a development convenience. Delivery
 * fails — a bounced address, a provider outage, a filter that ate it — and the
 * operator holding this dialog is often the only person who can still reach the
 * recipient by hand. Closing on success would throw the link away.
 */
export function InvitationComposer({
  academies,
  lockedAcademyId,
  onClose,
  open,
}: {
  academies: ConsoleAcademyOption[];
  /** Set when the academy facet holds exactly one academy. */
  lockedAcademyId: string | null;
  onClose: () => void;
  open: boolean;
}) {
  const { t } = useTranslation('platform');
  const { t: invites } = useTranslation('platform-invitations');
  const { t: copy } = useLayoutTranslation(['invitations', 'common']);
  const errorText = useErrorText();
  const send = useSendInvitation();

  const [academyId, setAcademyId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<AcademyRole>('STUDENT');
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState<{
    academyId: string;
    email: string;
    token: string;
  } | null>(null);

  // Reset when the dialog opens, keyed by identity rather than by an effect: a
  // composer still holding the last recipient's address is one stray click away
  // from inviting the wrong person to the wrong academy.
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAcademyId(lockedAcademyId);
      setRole('STUDENT');
      setEmail('');
      setSent(null);
      send.reset();
    }
  }

  const chosen = academies.find((academy) => academy.id === academyId) ?? null;
  const ready = Boolean(chosen) && email.trim().length > 3;
  const locked = Boolean(lockedAcademyId);

  const close = () => {
    if (send.isPending) return;
    onClose();
  };

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={open}>
      <ModalContent
        description={invites('composer.body')}
        title={invites('composer.heading')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!chosen || !ready || send.isPending) return;
            send.mutate(
              { academyId: chosen.id, email: email.trim(), role },
              {
                onSuccess: (result) => {
                  setSent({
                    academyId: chosen.id,
                    email: result.invitation.email,
                    token: result.token,
                  });
                  setEmail('');
                },
              },
            );
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('academy_field.label')}
                {locked ? null : <span className="ml-1 text-danger">*</span>}
              </span>
              <AcademyField
                academies={academies}
                locked={locked}
                onChange={setAcademyId}
                selected={chosen}
              />
              {locked ? (
                <span className="text-[12.5px] text-sub">
                  {t('academy_field.locked')}
                </span>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {copy('invitations:role_label')}
              </span>
              <RoleSelector
                onChange={setRole}
                popoverClassName="w-64"
                value={role}
              />
            </div>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {copy('invitations:email_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={copy('invitations:email_placeholder')}
                required
                type="email"
                value={email}
              />
            </label>

            {/* Said before sending, not after. The link is bound to one address
                for seven days, and both halves of that are things the operator
                needs while they are still typing the address. */}
            <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-[13.5px] leading-5 text-sub">
              {invites('composer.notice')}
            </p>

            {sent ? (
              <div className="grid gap-2">
                <p className="text-[13.5px] font-semibold text-success" role="status">
                  {invites('composer.sent', { email: sent.email })}
                </p>
                <InvitationLink academyId={sent.academyId} token={sent.token} />
              </div>
            ) : null}

            {send.isError ? (
              <p
                className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger"
                role="alert"
              >
                {errorText(send.error, invites('composer.failed'))}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
              onClick={close}
              type="button"
            >
              {copy(sent ? 'common:action.close' : 'common:action.cancel')}
            </button>
            <button
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!ready || send.isPending}
              type="submit"
            >
              {send.isPending
                ? invites('composer.sending')
                : invites('composer.submit')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
