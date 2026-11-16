"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LearnCourseOutline } from "@cove/shared";
import { explanationApi } from "@/lib/explanation-api";
export function useReadingView(input: {
  academyId: string;
  materialId: string;
  classId?: string;
  enabled: boolean;
}) {
  const cache = useQueryClient();
  const marked = useRef("");
  const { academyId, materialId, classId, enabled } = input;
  useEffect(() => {
    const key = `${academyId}:${materialId}:${classId ?? ""}`;
    if (!enabled || marked.current === key) return;
    marked.current = key;
    void explanationApi
      .view({ academyId, materialId, classId })
      .then((result) => {
        if (!result.viewed) return;
        cache.setQueriesData<LearnCourseOutline>(
          { queryKey: ["material-navigation", academyId] },
          (outline) => {
            if (!outline?.modules) return outline;
            let changed = false;
            const modules = outline.modules.map((m) => ({
              ...m,
              lectures: m.lectures.map((l) => ({
                ...l,
                explanations: l.explanations?.map((row) => {
                  if (row.materialId !== materialId) return row;
                  changed = row.status !== "SOLVED";
                  return { ...row, status: "SOLVED" as const };
                }),
                documents: l.documents?.map((row) => {
                  if (row.materialId !== materialId) return row;
                  changed = row.status !== "SOLVED";
                  return { ...row, status: "SOLVED" as const };
                }),
              })),
            }));
            return {
              ...outline,
              modules,
              progress:
                changed && outline.course.language === "WEB"
                  ? {
                      ...outline.progress,
                      solved: Math.min(
                        outline.progress.total,
                        outline.progress.solved + 1,
                      ),
                      started: Math.min(
                        outline.progress.total,
                        outline.progress.started + 1,
                      ),
                    }
                  : outline.progress,
            };
          },
        );
        void cache.invalidateQueries({ queryKey: ["learn", academyId] });
        void cache.invalidateQueries({
          queryKey: ["student-overview", academyId],
        });
      })
      .catch(() => {
        if (marked.current === key) marked.current = "";
      });
  }, [academyId, materialId, classId, enabled, cache]);
}
