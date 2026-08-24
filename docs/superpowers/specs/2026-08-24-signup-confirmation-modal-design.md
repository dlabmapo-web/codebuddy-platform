# Signup confirmation modal

## Problem

On the `(v2-auth)` signup screen (`packages/web/src/app/(v2-auth)/auth/signup`), clicking
"Create account" fires the `signupAction` server action immediately — there is no
confirmation step between the click and the account actually being created. A misclick, or
a click before double-checking the entered email/academy, creates a real account with no
chance to back out first.

Social signup (Google/Kakao) is unaffected by this problem: those buttons redirect to the
provider's own OAuth consent screen, which already serves as a confirmation step. This spec
only covers the email/password form.

## Goal

Insert a confirmation modal between "the signup form is valid and ready to submit" and "the
signup action actually runs." The user must explicitly confirm in the modal before the
account is created; cancelling returns them to the untouched, still-filled-in form.

## Current flow

`SignupForm` (`_components/signup-form.tsx`) wires the form as:

```tsx
const [state, action, pending] = useActionState(signupAction, initialState);

function submit(formData: FormData) {
  setCaptchaToken(null);
  setChallengeKey((current) => current + 1);
  action(formData);
}

<form action={submit}>
  ...
  <button type="submit" disabled={...}>{...}</button>
</form>
```

Clicking the submit button runs the browser's native constraint validation (`required`,
`type="email"`, password `minLength`) and the button's own `disabled` guard (missing
academy, missing captcha token) — both already block a genuinely invalid submission today.
Once those pass, `submit` runs and calls the server action directly, with no
human-confirmation step in between.

## Design

### Interception point

Replace `submit` as the form's `action` with a new `handleSubmit(formData)` that stores the
`FormData` in state instead of invoking the server action:

```tsx
const [pendingSignup, setPendingSignup] = useState<FormData | null>(null);

function handleSubmit(formData: FormData) {
  setPendingSignup(formData);
}

function confirmSignup() {
  if (!pendingSignup) return;
  setCaptchaToken(null);
  setChallengeKey((current) => current + 1);
  action(pendingSignup);
  setPendingSignup(null);
}

function cancelSignup() {
  setPendingSignup(null);
}
```

`handleSubmit` only ever runs once native validation and the button's `disabled` guard have
already passed, so the modal never opens in front of an invalid or incomplete form.

`confirmSignup` reproduces the existing captcha-reset behavior (clearing the token,
remounting the Turnstile challenge for the next attempt) immediately before calling the real
`action`, then clears `pendingSignup` in the same handler — closing the modal synchronously,
before a second click on Confirm is possible. `action` is the dispatch function from
`useActionState`; calling it directly from an event handler (rather than only via
`<form action>`) still starts a React transition and drives the existing `pending` flag, so
the submit button's "Creating account…" state continues to work unchanged.

While `pendingSignup` is non-null, `SignupConfirmModal` renders:

```tsx
{pendingSignup ? (
  <SignupConfirmModal onCancel={cancelSignup} onConfirm={confirmSignup} />
) : null}
```

### `SignupConfirmModal` component

New file: `packages/web/src/app/(v2-auth)/auth/signup/_components/signup-confirm-modal.tsx`.

Built on `Modal`/`ModalContent` from `@/components/studio/primitives` — the shared
Radix-based dialog primitive already used for confirmation dialogs elsewhere in the app
(`ArchiveClassDialog`, `VisibilityConfirmModal` under `(v2-studio)`, and already imported
outside `studio/` in `(v2-platform)` and `components/workspace`), so this is not a
studio-specific dependency.

```tsx
'use client';

import { UserPlus } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useTranslation } from 'react-i18next';

export function SignupConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('auth');

  return (
    <Modal onOpenChange={(next) => (next ? null : onCancel())} open>
      <ModalContent
        description={t('signup.confirm_modal.description')}
        title={t('signup.confirm_modal.title')}
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <UserPlus className="size-5" />
            </span>
            <p className="pt-2 text-[14px] leading-6 text-sub">
              {t('signup.confirm_modal.body')}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={onCancel}
            type="button"
          >
            {t('signup.confirm_modal.cancel')}
          </button>
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep"
            onClick={onConfirm}
            type="button"
          >
            {t('signup.confirm_modal.confirm')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
```

No `pending` prop: confirming clears `pendingSignup` synchronously, so the modal is always
unmounted before a second click could occur, and the underlying form's own submit button
already renders the "Creating account…" pending state once `action` starts.

Backdrop click and Escape both route through `onOpenChange` to `onCancel`, matching the
cancel behavior of every other confirm dialog in the app.

### Copy

New keys under `signup.confirm_modal` in both locale files, following the existing flat
per-screen namespace convention in `auth.json`:

`packages/i18n/src/locales/en/auth.json`:
```json
"confirm_modal": {
  "title": "Create your account?",
  "description": "One more check before we create it.",
  "body": "We'll create your Cove account with the email and academy you entered above.",
  "confirm": "Yes, create account",
  "cancel": "Cancel"
}
```

`packages/i18n/src/locales/ko/auth.json`: matching Korean translations under the same keys,
in the same style as the existing `signup.*` entries in that file.

## Edge cases

- **Captcha token expiry while the modal is open.** If the user leaves the confirmation
  modal open long enough for the Turnstile token to expire, `signupAction` returns the
  existing `error.captcha_failed` message after confirming. This is the same failure path
  that already exists today for any slow first submission — no new handling required.
- **No-JS / progressive enhancement.** `(v2-auth)` forms already assume JavaScript
  (`SignupForm` is a client component using `useActionState`); this change adds no new
  no-JS gap beyond what already exists.
- **Double confirm-click.** Not possible: `confirmSignup` clears `pendingSignup` in the same
  synchronous handler that starts the action, unmounting the modal before a second click
  could land.
- **Social signup unaffected.** `SocialLoginButtons` keeps calling
  `startSocialAuthAction` directly; adding a redundant local confirm step in front of an
  OAuth provider's own consent screen would just be friction.

## Out of scope

- Any change to the legacy `(auth)/signup` route (v1, explicitly marked legacy — see
  `(auth)/layout.tsx`).
- A "review your details" style modal that echoes back the entered name/username/email —
  the confirmation is a plain yes/no gate, not a review step.
- Changes to `signupAction` or any server-side validation.

## Testing

No existing test exercises `SignupForm`'s submit interaction directly — `actions.spec.ts`
unit-tests `signupAction` in isolation and is unaffected by this UI-only change. Verification
for this change is:

- `pnpm typecheck` / `pnpm build` (per project convention) across `packages/web` and
  `packages/i18n`.
- Manual check on the dev server: submitting a valid form opens the modal without calling
  `signupAction`; Cancel closes the modal and leaves all field values intact; Confirm
  proceeds through the existing success/redirect/error states unchanged.
