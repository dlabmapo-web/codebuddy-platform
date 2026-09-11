'use client';

import { Eye, KeyRound, RefreshCw } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  generateIssuedPassword,
  maskIssuedPassword,
  studentPasswordProblem,
  type StudentCredentialState,
} from '@cove/shared';

import { Button } from '@/components/studio/button';
import { Skeleton } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

/**
 * A student's password, for the manager who is their only way back in.
 *
 * A student has no email, so no reset link can reach them. This is that
 * recovery: a manager sets a password — one they type, so a seven-year-old can
 * remember it, or one the Suggest button fills in — and can read back the one
 * they set, for as long as it is still the student's.
 *
 * The two states are the point of the component. When Cove holds a password a
 * manager set it shows `hae•••••••` and offers to reveal it; when the student
 * has since chosen their own, Cove genuinely does not know it — the row is
 * destroyed the moment they change it — and the panel says so in words rather
 * than by quietly removing the button. That second state is the system working
 * correctly and is not styled as a fault.
 */
export function StudentPasswordPanel({
  academyId,
  membershipId,
}: {
  academyId: string;
  membershipId: string;
}) {
  const { t } = useTranslation('profile');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const queryKey = ['student-credential', academyId, membershipId];
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const state = useQuery({
    queryKey,
    queryFn: () =>
      orpc.academyStudentCredentials.get({ academyId, membershipId }),
  });

  function apply(next: StudentCredentialState, password: string) {
    queryClient.setQueryData(queryKey, next);
    setRevealed(password);
    setError(null);
  }

  const set = useMutation({
    mutationFn: (password: string) =>
      orpc.academyStudentCredentials.issue({
        academyId,
        membershipId,
        password,
      }),
    onSuccess: (result) => {
      apply(result.state, result.password);
      setEditing(false);
    },
    onError: (cause) => setError(errorText(cause)),
  });

  const reveal = useMutation({
    mutationFn: () =>
      orpc.academyStudentCredentials.reveal({ academyId, membershipId }),
    onSuccess: (result) => apply(result.state, result.password),
    onError: (cause) => setError(errorText(cause)),
  });

  const busy = set.isPending || reveal.isPending;
  const credential = state.data?.credential ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="size-5 text-sub" strokeWidth={1.75} />
        <h2 className="text-[16px] font-bold text-ink">
          {t('credentials.title')}
        </h2>
      </div>

      {state.isPending ? (
        <Skeleton className="h-14 w-full" />
      ) : (
        <div className="rounded-xl border border-border bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[18px] font-semibold tracking-wide text-ink">
              {revealed
                ? revealed
                : credential
                  ? maskIssuedPassword(
                      credential.visiblePrefix,
                      credential.length,
                    )
                  : t('credentials.changed_by_student')}
            </p>
            <div className="flex gap-2">
              {/* Fetched on demand, never in the page's initial payload: a
                  plaintext password must not sit in a query cache that
                  outlives the click that asked for it. */}
              {credential && credential.revealable && !revealed ? (
                <Button
                  disabled={busy}
                  onClick={() => reveal.mutate()}
                  size="sm"
                  variant="outline"
                >
                  <Eye className="size-4" />
                  {t('credentials.reveal')}
                </Button>
              ) : null}
              {editing ? null : (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(true);
                    setError(null);
                  }}
                  size="sm"
                  variant={credential ? 'outline' : 'default'}
                >
                  <KeyRound className="size-4" />
                  {t('credentials.set')}
                </Button>
              )}
            </div>
          </div>

          <p className="mt-2 text-[13px] leading-5 text-sub">
            {credential
              ? t('credentials.issued_meta', {
                  date: new Date(credential.issuedAt).toLocaleDateString(),
                  issuer: credential.issuedByName ?? t('credentials.unknown_issuer'),
                  count: credential.revealCount,
                })
              : t('credentials.changed_by_student_hint')}
          </p>
          {/* Said plainly, and only after a reveal. A manager who reads a
              password should know the reading was recorded against them. */}
          {revealed ? (
            <p className="mt-2 text-[13px] leading-5 text-amber-700 dark:text-amber-400">
              {t('credentials.reveal_audited')}
            </p>
          ) : null}

          {editing ? (
            <SetPasswordForm
              busy={set.isPending}
              onCancel={() => {
                setEditing(false);
                setError(null);
              }}
              onSubmit={(password) => {
                setError(null);
                set.mutate(password);
              }}
            />
          ) : null}
        </div>
      )}

      {error ? (
        <p aria-live="polite" className="mt-3 text-[14px] text-danger">
          {error}
        </p>
      ) : null}

      <p className="mt-4 text-[13px] leading-5 text-sub">
        {t('credentials.explanation')}
      </p>
    </section>
  );
}

/**
 * The manager types the password they will write on a slip for the child.
 *
 * A plain text box, not a password field, on purpose: the manager is choosing
 * something to read aloud and write down, and a masked field would make them
 * type it blind — and would invite the browser to save it as the *manager's*
 * own password for this site. The password-manager opt-outs are for the same
 * reason.
 *
 * Validated as it is typed, by the rule the API applies, so the one message a
 * manager is most likely to need — "your keyboard is in 한글 mode" — arrives
 * before Save rather than after it.
 */
function SetPasswordForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const { t } = useTranslation('profile');
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const problem = studentPasswordProblem(password);
  // "Too short" is the state of every password while it is being typed, so it
  // is only said once there is something to judge. A wrong character is said
  // at once: it is the mistake a manager cannot see they are making.
  const shownProblem =
    problem === 'too_short' && password.length === 0 ? null : problem;

  return (
    <form
      className="mt-4 border-t border-border pt-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (problem === null && !busy) onSubmit(password);
      }}
    >
      <label className="block text-[13px] font-bold text-ink" htmlFor={inputId}>
        {t('credentials.new_password')}
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          aria-describedby={hintId}
          aria-invalid={shownProblem !== null}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          // The form opens on an explicit click whose only purpose is to type
          // here.
          autoFocus
          className={cn(
            'h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 font-mono text-[18px] tracking-wide text-ink outline-none transition-colors focus:ring-2',
            shownProblem
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-border focus:border-brand focus:ring-brand/20',
          )}
          data-1p-ignore
          data-lpignore="true"
          id={inputId}
          maxLength={72}
          onChange={(event) => setPassword(event.target.value)}
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={password}
        />
        <Button
          disabled={busy}
          onClick={() => {
            setPassword(generateIssuedPassword());
            inputRef.current?.focus();
          }}
          type="button"
          variant="outline"
        >
          <RefreshCw className="size-4" />
          {t('credentials.suggest')}
        </Button>
      </div>
      <p
        aria-live="polite"
        className={cn(
          'mt-1.5 text-[12.5px] leading-5',
          shownProblem ? 'text-danger' : 'text-sub',
        )}
        id={hintId}
      >
        {shownProblem
          ? t(`credentials.${shownProblem}`)
          : t('credentials.rule_hint')}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button disabled={busy} onClick={onCancel} type="button" variant="ghost">
          {t('credentials.cancel')}
        </Button>
        <Button disabled={busy || problem !== null} type="submit">
          {t('credentials.save')}
        </Button>
      </div>
    </form>
  );
}
