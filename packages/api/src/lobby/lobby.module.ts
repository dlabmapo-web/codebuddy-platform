import { Module } from "@nestjs/common";

import { MediaModule } from "../profile/media.module.js";
import { LobbyService } from "./lobby.service.js";

@Module({
  // `MediaModule` for the academy's cover image, which is the only thing the
  // lobby renders that is not a word.
  imports: [MediaModule],
  providers: [LobbyService],
  exports: [LobbyService],
})
export class LobbyModule {}
