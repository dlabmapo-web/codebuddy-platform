import { z } from "zod";

/**
 * Library course sync, as both surfaces read it
 * (docs/superpowers/specs/2026-11-18-library-course-sync-design.md §17).
 *
 * Head office reads counts and states only (D12). Values — the three versions
 * of a conflicted unit — are read only by the copy's own editors.
 */

export const librarySyncRunStatuses = [
  "IDLE",
  "PENDING",
  "RUNNING",
  "FAILED",
  "PAUSED",
] as const;
export const librarySyncRunStatusSchema = z.enum(librarySyncRunStatuses);
export type LibrarySyncRunStatus = z.infer<typeof librarySyncRunStatusSchema>;

/**
 * The one chip every surface shows for a linked copy. `SOURCE_RETIRED` wins,
 * then a failure, then decisions waiting, then work in flight.
 */
export function linkedSyncChip(state: {
  status: LibrarySyncRunStatus;
  openConflictCount: number;
  appliedReleaseNumber: number;
  targetReleaseNumber: number;
  sourceRetiredAt: string | Date | null;
}):
  | "SOURCE_RETIRED"
  | "SYNC_FAILED"
  | "NEEDS_REVIEW"
  | "SYNCING"
  | "UP_TO_DATE" {
  if (state.sourceRetiredAt !== null) return "SOURCE_RETIRED";
  if (state.status === "FAILED") return "SYNC_FAILED";
  if (state.openConflictCount > 0) return "NEEDS_REVIEW";
  if (state.targetReleaseNumber > state.appliedReleaseNumber) return "SYNCING";
  return "UP_TO_DATE";
}

export const releaseSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  byType: z.record(z.string(), z.number().int().nonnegative()),
});
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;

export const libraryReleaseSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  note: z.string(),
  publishedAt: z.iso.datetime(),
  publishedByName: z.string().nullable(),
  nodeCount: z.number().int().nonnegative(),
  summary: releaseSummarySchema,
  /** Rollout across copies: how many reached this release, and how many wait. */
  rollout: z.object({
    synced: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});
export type LibraryRelease = z.infer<typeof libraryReleaseSchema>;

export const libraryReleaseDraftSchema = z.object({
  contentRevision: z.number().int().positive(),
  latest: z
    .object({
      number: z.number().int().positive(),
      publishedAt: z.iso.datetime(),
    })
    .nullable(),
  hasUnpublishedChanges: z.boolean(),
  summary: releaseSummarySchema,
  blockers: z.array(z.string()),
  linkedCopies: z.number().int().nonnegative(),
});
export type LibraryReleaseDraft = z.infer<typeof libraryReleaseDraftSchema>;

export const publishLibraryUpdateSchema = z.object({
  courseId: z.uuid(),
  note: z.string().trim().max(500).default(""),
  expectedContentRevision: z.number().int().positive(),
});
export type PublishLibraryUpdateInput = z.infer<
  typeof publishLibraryUpdateSchema
>;

/** One copy's sync, as head office reads it: counts and states, never content. */
export const librarySyncCopySchema = z.object({
  academyName: z.string(),
  academySlug: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  appliedReleaseNumber: z.number().int().nonnegative(),
  targetReleaseNumber: z.number().int().nonnegative(),
  status: librarySyncRunStatusSchema,
  openConflictCount: z.number().int().nonnegative(),
  divergentUnitCount: z.number().int().nonnegative(),
  paused: z.boolean(),
  lastRunAt: z.iso.datetime().nullable(),
  lastErrorCode: z.string().nullable(),
});
export type LibrarySyncCopy = z.infer<typeof librarySyncCopySchema>;

export const academyCourseSyncSchema = z.object({
  unmatchedCount: z.number().int().nonnegative().optional(),
  libraryCourseId: z.uuid(),
  libraryTitle: z.string(),
  appliedReleaseNumber: z.number().int().nonnegative(),
  targetReleaseNumber: z.number().int().nonnegative(),
  latestReleaseNumber: z.number().int().nonnegative(),
  status: librarySyncRunStatusSchema,
  chip: z.enum([
    "SOURCE_RETIRED",
    "SYNC_FAILED",
    "NEEDS_REVIEW",
    "SYNCING",
    "UP_TO_DATE",
  ]),
  openConflictCount: z.number().int().nonnegative(),
  divergentUnitCount: z.number().int().nonnegative(),
  lastRunAt: z.iso.datetime().nullable(),
});
export type AcademyCourseSync = z.infer<typeof academyCourseSyncSchema>;

export const librarySyncConflictKinds = [
  "CONCURRENT_EDIT",
  "UNKNOWN_BASE",
  "REMOVED_UPSTREAM_EDITED_LOCALLY",
  "EDITED_UPSTREAM_DELETED_LOCALLY",
  "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT",
  "PARENT_MISSING",
  "PLACEMENT",
  "INVALID_RESULT",
  "AMBIGUOUS_LINK",
] as const;
export const librarySyncConflictKindSchema = z.enum(librarySyncConflictKinds);
export type LibrarySyncConflictKind = z.infer<
  typeof librarySyncConflictKindSchema
>;

export const librarySyncResolutions = [
  "ACCEPT_LIBRARY",
  "KEEP_ACADEMY",
  "MANUAL",
] as const;
export const librarySyncResolutionSchema = z.enum(librarySyncResolutions);
export type LibrarySyncResolution = z.infer<typeof librarySyncResolutionSchema>;

/** How a unit's value is rendered, so each side can be compared as what it is. */
export const syncValueKinds = [
  "text",
  "html",
  "code",
  "json",
  "absent",
  "unknown",
] as const;
export const syncValueSchema = z.object({
  kind: z.enum(syncValueKinds),
  value: z.unknown(),
  /** A line shown above the value, such as a solution's title. */
  caption: z.string().nullable().optional(),
});
export type SyncValue = z.infer<typeof syncValueSchema>;

export const librarySyncConflictSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  nodeKey: z.string(),
  unitKey: z.string(),
  kind: librarySyncConflictKindSchema,
  /** "Module › Lecture › Material", from the copy's own titles. */
  path: z.array(z.string()),
  materialType: z.string().nullable(),
  releaseNumber: z.number().int().positive(),
  message: z.string().nullable(),
  /**
   * Set when a rule, not an edit, holds a library change back. `REFERENCED_PDF`:
   * head office removed a PDF one of this course's exercises still uses as its
   * reference, so the PDF stays until the academy keeps it as its own or
   * changes those exercises and accepts the removal.
   */
  reason: z.enum(["REFERENCED_PDF"]).nullable().default(null),
  createdAt: z.iso.datetime(),
  /** The actions this decision offers. */
  actions: z.array(librarySyncResolutionSchema),
});
export type LibrarySyncConflict = z.infer<typeof librarySyncConflictSchema>;

export const librarySyncConflictDetailSchema = librarySyncConflictSchema.extend(
  {
    base: syncValueSchema,
    imageUrls: z.record(z.string(),z.url()).optional(),
    ours: syncValueSchema,
    theirs: syncValueSchema,
    expectedOursHash: z.string().nullable(),
    expectedTheirsHash: z.string().nullable(),
    /** Other units decided together with this one (design D6). */
    members: z.array(
      z.object({
        unitKey: z.string(),
        base: syncValueSchema,
        ours: syncValueSchema,
        theirs: syncValueSchema,
      }),
    ),
    /** For `REFERENCED_PDF`: where each exercise still using the PDF is, read now. */
    dependents: z.array(z.array(z.string())).default([]),
  },
);
export type LibrarySyncConflictDetail = z.infer<
  typeof librarySyncConflictDetailSchema
>;

export const resolveLibrarySyncConflictSchema = z.object({
  academyId: z.uuid(),
  conflictId: z.uuid(),
  action: librarySyncResolutionSchema,
  /**
   * The merged text, for `MANUAL` on a text, HTML or code unit. For a
   * solution it is the code; the solution keeps its title.
   */
  value: z
    .string()
    .max(16 * 1024 * 1024)
    .optional(),
  expectedOursHash: z.string().nullable(),
  expectedTheirsHash: z.string().nullable(),
  requestKey: z.uuid(),
});
export type ResolveLibrarySyncConflictInput = z.infer<
  typeof resolveLibrarySyncConflictSchema
>;

export const librarySyncChangeOutcomes = [
  "APPLIED",
  "KEPT",
  "CONVERGED",
  "CONFLICT",
  "ADDED",
  "REMOVED",
  "ARCHIVED",
  "MOVED",
  "RESTORED",
  "RESOLVED",
] as const;
export const librarySyncHistoryRunSchema = z.object({
  releaseNumber: z.number().int().positive(),
  note: z.string(),
  at: z.iso.datetime(),
  changes: z.array(
    z.object({
      nodeKey: z.string(),
      unitKey: z.string(),
      outcome: z.enum(librarySyncChangeOutcomes),
      path: z.array(z.string()),
    }),
  ),
});
export type LibrarySyncHistoryRun = z.infer<typeof librarySyncHistoryRunSchema>;

/** Everything the Library updates page shows, read together. `sync` is null for a course that is not linked. */
export const academyLibrarySyncUpdatesSchema = z.object({
  detail: librarySyncConflictDetailSchema.nullable().optional(),
  sync: academyCourseSyncSchema.nullable(),
  conflicts: z.array(librarySyncConflictSchema),
  runs: z.array(librarySyncHistoryRunSchema),
});
export type AcademyLibrarySyncUpdates = z.infer<
  typeof academyLibrarySyncUpdatesSchema
>;
