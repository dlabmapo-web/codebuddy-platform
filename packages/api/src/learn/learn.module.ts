import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { LearnService } from "./learn.service.js";

@Module({
  imports: [AuthorizationModule],
  providers: [LearnService],
  exports: [LearnService],
})
export class LearnModule {}
