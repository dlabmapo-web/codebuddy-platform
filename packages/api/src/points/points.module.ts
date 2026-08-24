import { Module } from "@nestjs/common";

import { MediaModule } from "../profile/media.module.js";
import { LeaderboardRepository } from "./leaderboard.repository.js";
import { PointAwardService } from "./point-award.service.js";
import { PointsAccessService } from "./points-access.service.js";
import { PointsService } from "./points.service.js";

/**
 * `PointAwardService` is exported because the writers live outside this
 * module: the grading transaction and the activity flush both call it from
 * inside transactions they already own. Nothing else about points crosses that
 * seam — the service holds no authorization, which is what makes it safe.
 */
@Module({
  // The board prints faces. `MediaModule` rather than `ProfileModule`: this
  // needs the batch signer and nothing else, and the storage module exists
  // precisely so a consumer can reach it without depending on the whole
  // profile surface.
  imports: [MediaModule],
  providers: [
    LeaderboardRepository,
    PointAwardService,
    PointsAccessService,
    PointsService,
  ],
  exports: [PointAwardService, PointsService],
})
export class PointsModule {}
