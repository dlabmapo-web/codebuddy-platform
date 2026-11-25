import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createAiAssistantRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);
  return {
    getLibrary: os.aiAssistant.getLibrary.use(access.authenticated)
      .handler(({ context, input }) => deps.aiLibraryService.get(context.identity, input)),
    updateLibraryItem: os.aiAssistant.updateLibraryItem.use(access.authenticated)
      .handler(({ context, input }) => deps.aiLibraryService.updateItem(context.identity, input)),
    regenerateLibrary: os.aiAssistant.regenerateLibrary.use(access.authenticated)
      .handler(({ context, input }) => deps.aiLibraryService.regenerate(context.identity, input)),
    platformUsage: os.aiAssistant.platformUsage.use(access.authenticated)
      .handler(({ context }) => deps.aiUsageService.platform(context.identity)),
  };
}
