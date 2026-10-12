"use client";
import { useQuery } from "@tanstack/react-query";
import { useVideoTranslation } from "./use-video-translation";
import { videoApi } from "@/lib/video-api";
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
    <section className="p-6">
      {embedded ? null : (
        <h1 className="text-xl font-semibold">{t("history")}</h1>
      )}
      {query.isError ? (
        <p role="alert">{t("unavailable")}</p>
      ) : !query.data ? (
        <p role="status">{t("loading")}</p>
      ) : (
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>{t("learner")}</th>
                <th>{t("file")}</th>
                <th>{t("watch_percent")}</th>
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
                    {Math.floor((row.watchedMs / row.asset.durationMs) * 100)}%
                  </td>
                  <td>{Math.floor(row.positionMs / 1000)}s</td>
                  <td>{row.completed ? t("completed") : t("incomplete")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
