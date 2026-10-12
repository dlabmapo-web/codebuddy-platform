"use client";
import { useManualTranslation } from "./use-manual-translation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { manualApi } from "@/lib/manual-api";
import { routes } from "@/lib/routes";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
export function ManualClassMaterials({
  academyId,
  classId,
}: {
  academyId: string;
  classId: string;
}) {
  const { t: mt } = useManualTranslation();
  const slug = useAcademySlug();
  const query = useQuery({
    queryKey: ["manual-class", academyId, classId],
    queryFn: () => manualApi.classMaterials({ academyId, classId }),
  });
  if (!query.data?.length) return null;
  return (
    <section className="mb-5 rounded-card border border-border bg-card p-4">
      <h2 className="font-bold">{mt("assessment_activities")}</h2>
      <ul className="mt-3 flex flex-wrap gap-3">
        {query.data.map((m) => (
          <li key={m.materialId}>
            <Link
              className="text-brand underline"
              href={routes.academyTeachManual(slug, classId, m.materialId)}
            >
              {m.courseTitle} · {m.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
