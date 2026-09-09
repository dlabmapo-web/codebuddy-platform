import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";
import {
  requestId,
  type ORPCDeps,
  type ORPCImplementer,
} from "../orpc/context.js";
import { createAccess } from "../orpc/access.js";
import type { RegradeJob } from "../judge/judge.queue.js";

/**
 * Maintenance work, guarded inside its service like every other platform
 * surface.
 *
 * `startRegrade` is handed the enqueue function rather than the queue: the
 * planner is a query and has no business owning a Redis handle, and the seam
 * makes the dispatch trivially substitutable in a test that must not need a
 * broker running.
 */
export function createPlatformOperationsRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformOperations: {
      staleProblems: os.platformOperations.staleProblems
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.regradeService.staleProblems(context.identity, input),
        ),
      planRegrade: os.platformOperations.planRegrade
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.regradeService.planRegrade(context.identity, input, {
            requestId: requestId(context.req),
          }),
        ),
      startRegrade: os.platformOperations.startRegrade
        .use(access.authenticated)
        .handler(({ context, input }) => {
          const queue = deps.judgeQueue;
          // Refused rather than planned-and-dropped. Without Redis there is no
          // judge to do the work, and a run that reported itself started and
          // then never moved would be the one failure this whole surface
          // exists to remove.
          if (!queue) {
            throw new AppException(
              "GRADING_UNAVAILABLE",
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
          return deps.regradeService.startRegrade(
            context.identity,
            input,
            (job: RegradeJob) => queue.enqueueRegrade(job),
          );
        }),
      cancelPlan: os.platformOperations.cancelPlan
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.regradeService.cancelPlan(context.identity, input),
        ),
      run: os.platformOperations.run
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.regradeService.run(context.identity, input),
        ),
      runs: os.platformOperations.runs
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.regradeService.runs(context.identity, input),
        ),
    },
  };
}
