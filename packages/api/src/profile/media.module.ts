import { Module } from "@nestjs/common";

import { ProfileMediaService } from "./profile-media.service.js";

/**
 * Storage on its own, so both `AuthModule` and `ProfileModule` can reach it
 * without importing each other. `auth.me` needs a signed avatar URL for the
 * header on every studio page; the profile services need the whole upload and
 * delivery path. Neither should have to depend on the other to get it.
 */
@Module({
  providers: [ProfileMediaService],
  exports: [ProfileMediaService],
})
export class MediaModule {}
