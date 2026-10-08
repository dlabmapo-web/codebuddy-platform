"use client";
import { useManualTranslation } from "./use-manual-translation";
export function ManualGradeSummary({
  grade,
}: {
  grade: {
    maximumHundredths: number;
    scoreHundredths: number;
    pending: number;
  };
}) {
  const { t } = useManualTranslation();
  if (!grade.maximumHundredths) return null;
  return (
    <p
      className="rounded border border-border bg-card p-3 text-sm"
      data-testid="manual-grade-summary"
    >
      {t("manual_score", {
        score: grade.scoreHundredths / 100,
        maximum: grade.maximumHundredths / 100,
        pending: grade.pending,
      })}
    </p>
  );
}
