import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/** Library course sync: head office's releases and an academy's decisions. */
export function createLibrarySyncRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);
  const releases = deps.libraryReleaseService;
  const academy = deps.academyLibrarySyncService;

  return {
    platformLibrarySync: {
      linkReport: os.platformLibrarySync.linkReport
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.legacyLibraryLinkService.report(context.identity, input),
        ),
      linkPreview: os.platformLibrarySync.linkPreview
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.legacyLibraryLinkService.preview(context.identity, input),
        ),
      linkCopy: os.platformLibrarySync.linkCopy
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.legacyLibraryLinkService.link(context.identity, input),
        ),
      draft: os.platformLibrarySync.draft
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.draft(context.identity, input),
        ),
      publish: os.platformLibrarySync.publish
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.publish(context.identity, input),
        ),
      releases: os.platformLibrarySync.releases
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.releases(context.identity, input),
        ),
      copies: os.platformLibrarySync.copies
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.copies(context.identity, input),
        ),
      retry: os.platformLibrarySync.retry
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.retry(context.identity, input),
        ),
      pause: os.platformLibrarySync.pause
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.pause(context.identity, input),
        ),
      resume: os.platformLibrarySync.resume
        .use(access.authenticated)
        .handler(({ context, input }) =>
          releases.resume(context.identity, input),
        ),
    },
    academyLibrarySync: {
      unmatched: os.academyLibrarySync.unmatched
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.legacyLibraryLinkService.unmatched(context.identity, input),
        ),
      resolveLink: os.academyLibrarySync.resolveLink
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.legacyLibraryLinkService.resolveLink(context.identity, input),
        ),
      updates: os.academyLibrarySync.updates
        .use(access.authenticated)
        .handler(({ context, input }) =>
          academy.updates(context.identity, input),
        ),
      conflict: os.academyLibrarySync.conflict
        .use(access.authenticated)
        .handler(({ context, input }) =>
          academy.conflict(context.identity, input),
        ),
      resolve: os.academyLibrarySync.resolve
        .use(access.authenticated)
        .handler(({ context, input }) =>
          academy.resolve(context.identity, input),
        ),
    },
  };
}
