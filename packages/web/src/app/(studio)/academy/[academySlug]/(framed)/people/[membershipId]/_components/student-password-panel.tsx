'use client';

import { Eye, KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { maskIssuedPassword, type StudentCredentialState } from '@cove/shared';

import { Button } from '@/components/studio/button';
import { Skeleton } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * A student's password, for the manager who is their only way back in.
 *
 * A student has no email, so no reset link can reach them. This is that
 * recovery: a manager issues a password and can read back the one they issued,
 * for as long as it is still the student's.
 *
 * The two states are the point of the component. When Cove holds an issued
 * password it shows `hae•••••••` and offers to reveal it; when the student has
 * since chosen their own, Cove genuinely does not know it — the row is
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

  const issue = useMutation({
    mutationFn: () =>
      orpc.academyStudentCredentials.issue({ academyId, membershipId }),
    onSuccess: (result) => apply(result.state, result.password),
    onError: (cause) => setError(errorText(cause)),
  });

  const reveal = useMutation({
    mutationFn: () =>
      orpc.academyStudentCredentials.reveal({ academyId, membershipId }),
    onSuccess: (result) => apply(result.state, result.password),
    onError: (cause) => setError(errorText(cause)),
  });

  const busy = issue.isPending || reveal.isPending;
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
              <Button
                disabled={busy}
                onClick={() => issue.mutate()}
                size="sm"
                variant={credential ? 'outline' : 'default'}
              >
                <RefreshCw className="size-4" />
                {t('credentials.issue')}
              </Button>
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
