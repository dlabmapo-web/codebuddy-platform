"use client";
import { useQuery } from "@tanstack/react-query";
import { useVideoTranslation } from "./use-video-translation";
import { videoApi } from "@/lib/video-api";
import { videoWatchPercent } from "@cove/shared";
import { videoTime } from "./video-progress-format";
export function VideoWatchHistory({
  academyId,
  materialId,
  classId,
  embedded = false,
}: {
  academyId: string;
  materialId: string;
  classId: string;
  embedded?: boolean;
}) {
  const { t } = useVideoTranslation();
  const query = useQuery({
    queryKey: ["video-watch-history", academyId, materialId, classId],
    queryFn: () => videoApi.history({ academyId, materialId, classId }),
    refetchInterval: 10000,
    retry: false,
  });
  return (
    <section className={embedded ? "py-4" : "p-6"}>
      {embedded ? null : (
        <h1 className="text-xl font-semibold">{t("history")}</h1>
      )}
      {query.isError ? (
        <p role="alert">{t("unavailable")}</p>
      ) : !query.data ? (
        <p role="status">{t("loading")}</p>
      ) : (
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="text-xs text-sub">
              <tr>
                <th>{t("learner")}</th>
                <th>{t("file")}</th>
                <th>{t("watch_percent")}</th>
                <th>{t("watched_duration")}</th>
                <th>{t("last_position")}</th>
                <th>{t("completed")}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row, i) => (
                <tr
                  className="border-t border-border"
                  key={`${row.userId}:${row.assetId}:${i}`}
                >
                  <td className="p-2">{row.learnerName}</td>
                  <td>{row.asset.filename}</td>
                  <td>
                    {videoWatchPercent(row.watchedMs, row.asset.durationMs)}%
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {videoTime(row.watchedMs / 1000)} /{" "}
                    {videoTime(row.asset.durationMs / 1000)}
                  </td>
                  <td className="tabular-nums">
                    {videoTime(row.positionMs / 1000)}
                  </td>
                  <td>{row.completed ? t("completed") : t("incomplete")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query.data.length ? (
            <p className="py-4 text-sm text-sub">{t("no_watch_history")}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
