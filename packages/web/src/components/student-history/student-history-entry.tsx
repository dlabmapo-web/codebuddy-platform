"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { TeacherStudentRow } from "@cove/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/studio/overlays";
import { routes } from "@/lib/routes";
/**
 * Analytics may aggregate several classes. Ask which authorized class to inspect.
 * Its copy is in `teaching`, the namespace the analytics page mounts: that
 * page's provider replaces the teach layout's, so `teach` keys show raw here.
 */
export function StudentHistoryEntry({
  student,
  academySlug,
  children,
}: {
  student: TeacherStudentRow;
  academySlug: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("teaching");
  const href = (classId: string) =>
    `${routes.academyTeachProgress(academySlug, classId)}?view=students&student=${student.membershipId}`;
  const style =
    "flex items-center gap-2.5 text-ink transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  if (student.classes.length > 1)
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={style}
            aria-label={`${t("table.open_history")} · ${student.displayName}`}
          >
            {children}
            <span className="ml-1 whitespace-nowrap text-[11px] font-semibold text-brand">
              {t("table.open_history")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <p className="mb-2 text-xs font-semibold text-sub">
            {t("table.choose_class")}
          </p>
          {student.classes.map((c) => (
            <Link
              key={c.value}
              href={href(c.value)}
              className="block rounded-lg p-3 text-sm font-semibold hover:bg-brand-soft"
            >
              {c.label}
            </Link>
          ))}
        </PopoverContent>
      </Popover>
    );
  const classId = student.classes[0]?.value ?? student.primaryClassId;
  return classId ? (
    <Link
      title={t("table.open_history")}
      className={style}
      href={href(classId)}
    >
      {children}
      <span className="ml-1 whitespace-nowrap text-[11px] font-semibold text-brand">
        {t("table.open_history")}
      </span>
    </Link>
  ) : (
    <span className={style}>{children}</span>
  );
}
