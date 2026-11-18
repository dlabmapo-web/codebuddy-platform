import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  academyCourseSyncSchema,
  academyLibrarySyncUpdatesSchema,
  libraryReleaseDraftSchema,
  libraryReleaseSchema,
  librarySyncConflictDetailSchema,
  librarySyncCopySchema,
  publishLibraryUpdateSchema,
  resolveLibrarySyncConflictSchema,
} from "../../library-sync/sync.js";

/**
 * Library course sync, as head office drives it. Counts and states only:
 * nothing here returns an academy's content (design D12).
 */
export const platformLibrarySyncContract = {
  linkReport: oc.input(z.object({ courseId: z.uuid() })).output(
    z.object({
      copies: z.array(
        z.object({
          courseId: z.uuid(),
          academyId: z.uuid(),
          academyName: z.string(),
          title: z.string(),
          revision: z.number(),
          linked: z.boolean(),
          releaseId: z.uuid().nullable(),
        }),
      ),
    }),
  ),
  linkPreview: oc.input(z.object({ copyCourseId: z.uuid() })).output(
    z.object({
      hash: z.string(),
      releaseId: z.uuid().nullable(),
      releaseNumber: z.number(),
      nodeCount: z.number(),
    }),
  ),
  linkCopy: oc
    .input(
      z.object({
        courseId: z.uuid(),
        copyCourseId: z.uuid(),
        expectedHash: z.string(),
      }),
    )
    .output(z.object({ linked: z.boolean() })),
  draft: oc
    .input(z.object({ courseId: z.uuid() }))
    .output(libraryReleaseDraftSchema),
  publish: oc.input(publishLibraryUpdateSchema).output(libraryReleaseSchema),
  releases: oc
    .input(z.object({ courseId: z.uuid() }))
    .output(z.object({ releases: z.array(libraryReleaseSchema) })),
  copies: oc
    .input(z.object({ courseId: z.uuid() }))
    .output(z.object({ copies: z.array(librarySyncCopySchema) })),
  retry: oc
    .input(z.object({ copyCourseId: z.uuid() }))
    .output(librarySyncCopySchema),
  pause: oc
    .input(z.object({ copyCourseId: z.uuid() }))
    .output(librarySyncCopySchema),
  resume: oc
    .input(z.object({ copyCourseId: z.uuid() }))
    .output(librarySyncCopySchema),
};

/** Library course sync, as an academy's editors read and decide it. */
export const academyLibrarySyncContract = {
  unmatched: oc
    .input(z.object({ academyId: z.uuid(), courseId: z.uuid() }))
    .output(
      z.object({
        academyId: z.uuid(),
        libraryCourseId: z.uuid(),
        releaseId: z.uuid().nullable(),
        releaseNumber: z.number(),
        hash: z.string(),
        nodes: z.array(
          z.object({
            nodeKey: z.uuid(),
            kind: z.string(),
            materialType: z.string().nullable(),
            title: z.string(),
            localId: z.uuid().nullable(),
          }),
        ),
        candidates: z.array(
          z.object({
            id: z.uuid(),
            title: z.string(),
            kind: z.string(),
            materialType: z.string().nullable(),
          }),
        ),
      }),
    ),
  resolveLink: oc
    .input(
      z.object({
        academyId: z.uuid(),
        courseId: z.uuid(),
        nodeKey: z.uuid(),
        localId: z.uuid().nullable(),
        action: z.enum(["MATCH", "KEEP_DELETED", "ADD"]).optional(),
        expectedHash: z.string(),
      }),
    )
    .output(z.object({ resolved: z.boolean() })),
  /** The Library updates page in one call: status, open decisions and history. */
  updates: oc
    .input(z.object({ academyId: z.uuid(), courseId: z.uuid(), nodeKey: z.string().max(128).optional() }))
    .output(academyLibrarySyncUpdatesSchema),
  conflict: oc
    .input(z.object({ academyId: z.uuid(), conflictId: z.uuid() }))
    .output(librarySyncConflictDetailSchema),
  resolve: oc
    .input(resolveLibrarySyncConflictSchema)
    .output(z.object({ sync: academyCourseSyncSchema.nullable() })),
};
