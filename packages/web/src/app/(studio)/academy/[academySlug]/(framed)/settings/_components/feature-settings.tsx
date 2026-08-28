'use client';

import type { AcademyFeatureList, AcademyFeatureName } from '@cove/shared';
import { academyFeatureNames, academyFeatureRequires } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

const featuresKey = (academyId: string) =>
  ['academy', academyId, 'features'] as const;

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
        return (
          <label
            className="flex items-start gap-4 rounded-card border border-border bg-card px-5 py-4"
            key={feature}
          >
            <input
              checked={isEnabled}
              className="mt-1 size-5 shrink-0 accent-[color:var(--brand)]"
              disabled={mutation.isPending || query.isPending}
              onChange={(event) =>
                mutation.mutate({ feature, isEnabled: event.target.checked })
              }
              type="checkbox"
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">
                {t(`settings.feature.${feature}.title`)}
              </span>
              <span className="mt-1 block text-[13.5px] leading-[1.6] text-sub">
                {t(`settings.feature.${feature}.body`)}
              </span>
              {requires ? (
                <span className="mt-1.5 block text-[12.5px] font-semibold text-sub/85">
                  {t('settings.requires', {
                    title: t(`settings.feature.${requires}.title`),
                  })}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
