import type { LibraryCourse } from "@cove/shared";
import {
  courseTreeCountSelect,
  courseTreeCounts,
} from "./course-tree-counts.js";

export const librarySelect = {
  id: true,
  title: true,
  description: true,
  isVisible: true,
  retiredAt: true,
  contentRevision: true,
  updatedAt: true,
  ...courseTreeCountSelect,
  copies: { select: { sourceContentRevision: true } },
} as const;

export function toLibraryCourse(record: {
  id: string;
  title: string;
  description: string;
  isVisible: boolean;
  retiredAt: Date | null;
  contentRevision: number;
  updatedAt: Date;
  modules: {
    _count: { lectures: number };
    lectures: { _count: { materials: number }; materials: { id: string }[] }[];
  }[];
  copies: { sourceContentRevision: number | null }[];
}): LibraryCourse {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    isVisible: record.isVisible,
    retiredAt: record.retiredAt?.toISOString() ?? null,
    contentRevision: record.contentRevision,
    ...courseTreeCounts(record),
    copyCount: record.copies.length,
    behindCount: record.copies.filter(
      (copy) => (copy.sourceContentRevision ?? 0) < record.contentRevision,
    ).length,
    updatedAt: record.updatedAt.toISOString(),
  };
}
