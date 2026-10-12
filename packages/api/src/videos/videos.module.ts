import { Module } from "@nestjs/common";
import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { VideoService } from "./video.service.js";
import { VideoStorage } from "./video-storage.js";
import { VideoController } from "./video.controller.js";
@Module({
  imports: [AcademiesModule, AuthModule, AuthorizationModule],
  controllers: [VideoController],
  providers: [VideoService, VideoStorage],
  exports: [VideoService],
})
export class VideosModule {}
