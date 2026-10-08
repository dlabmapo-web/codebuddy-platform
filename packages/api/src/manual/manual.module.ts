import { PointsModule } from "../points/points.module.js";
import { ManualAssetsService } from "./manual-assets.service.js";
import { Module } from "@nestjs/common";
import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { ManualController } from "./manual.controller.js";
import { ManualService } from "./manual.service.js";
import { GuiClientService } from "./gui-client.service.js";
@Module({
  imports: [PointsModule, AcademiesModule, AuthModule, AuthorizationModule],
  controllers: [ManualController],
  providers: [ManualService, GuiClientService, ManualAssetsService],
  exports: [ManualService],
})
export class ManualModule {}
