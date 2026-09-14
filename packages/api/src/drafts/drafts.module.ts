import { Global, Module } from "@nestjs/common";

import { DraftCoordinator } from "./draft-coordinator.service.js";

/**
 * The draft write boundary, available to both of its callers.
 *
 * Global because the two modules that write a draft — learning and monitoring
 * — already have a one-way dependency between them, and threading this
 * through that edge would make which module owns a draft's text depend on
 * which one happened to import the other.
 */
@Global()
@Module({
  providers: [DraftCoordinator],
  exports: [DraftCoordinator],
})
export class DraftsModule {}
