'use client';

import type { AcademyFeatureList, AcademyFeatureName } from '@cove/shared';
import { academyFeatureNames, academyFeatureRequires } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerDownRight } from 'lucide-react';

import { Switch } from '@/components/studio/switch';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

const featuresKey = (academyId: string) =>
  ['academy', academyId, 'features'] as const;

/**
 * What this academy has switched on.
 *
 * Switches rather than checkboxes, because that is what these are: each one
 * is a request the moment it moves, with nothing to submit afterwards. The
 * control now says so.
 *
 * The switch sits at the end of the row rather than in front of the text. A
 * control leading its label reads as a form field waiting to be filled in;
 * one trailing it reads as the state of the thing named beside it, which is
 * what a settings list is for.
 *
 * A change disables every switch until it lands, not only the one pressed.
 * Turning one feature on can turn another on — the leaderboard cannot outlive
 * the point ledger — so the endpoint answers with the whole set, and a second
 * change sent against the state before that answer would be resolving a
 * conflict nobody asked for. Only the row actually in flight shows the
 * spinner; the rest are simply not accepting input for a moment.
 */
export function FeatureSettings({
  academyId,
  initialFeatures,
}: {
  academyId: string;
  initialFeatures: AcademyFeatureList | null;
}) {
  const { t } = useLayoutTranslation('content');
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: featuresKey(academyId),
    queryFn: () => orpc.academyFeatures.list({ academyId }),
    ...(initialFeatures ? { initialData: initialFeatures } : {}),
  });

  const mutation = useMutation({
    mutationFn: (input: { feature: AcademyFeatureName; isEnabled: boolean }) =>
      orpc.academyFeatures.setEnabled({ academyId, ...input }),
    // The endpoint answers with the whole set, because switching one feature
    // can move another: the class board cannot outlive the point ledger.
    onSuccess: (next) => queryClient.setQueryData(featuresKey(academyId), next),
  });

  const enabled = new Map(
    (query.data?.features ?? []).map((row) => [row.feature, row.isEnabled]),
  );
  const locked = mutation.isPending || query.isPending;

  return (
    <div className="flex flex-col gap-3">
      {mutation.isError ? (
        <p className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-[14px] text-danger">
          {errorText(mutation.error)}
        </p>
      ) : null}

      {academyFeatureNames.map((feature) => {
        const isEnabled = enabled.get(feature) ?? false;
        const requires = academyFeatureRequires[feature];
        const busy = mutation.isPending && mutation.variables?.feature === feature;

        return (
          <label
            className={cn(
              'flex cursor-pointer items-start gap-5 rounded-card border bg-card px-5 py-4 transition-colors duration-200 motion-reduce:transition-none',
              busy ? 'border-brand/40' : 'border-border hover:border-ink/20',
            )}
            key={feature}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">
                {t(`settings.feature.${feature}.title`)}
              </span>
              <span className="mt-1 block text-[13.5px] leading-[1.6] text-sub">
                {t(`settings.feature.${feature}.body`)}
              </span>
              {requires ? (
                /*
                 * The one surprising thing on this page: switching this on
                 * switches something else on too. It was a grey footnote. It
                 * is now marked as a consequence — the arrow points from this
                 * setting to the one it pulls with it — because a manager who
                 * misses it finds out by seeing a switch they did not touch
                 * change position.
                 */
                <span className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold leading-[1.5] text-draft">
                  <CornerDownRight
                    aria-hidden
                    className="mt-px size-3.5 shrink-0"
                    strokeWidth={2.5}
                  />
                  {t('settings.requires', {
                    title: t(`settings.feature.${requires}.title`),
                  })}
                </span>
              ) : null}
            </span>

            <Switch
              busy={busy}
              checked={isEnabled}
              className="mt-0.5"
              disabled={locked}
              onCheckedChange={(next) =>
                mutation.mutate({ feature, isEnabled: next })
              }
            />
          </label>
        );
      })}
    </div>
  );
}
