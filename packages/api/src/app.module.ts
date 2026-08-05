import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { AcademiesModule } from "./academies/academies.module.js";
import { AuthorizationModule } from "./authorization/authorization.module.js";
import { ClassesModule } from "./classes/classes.module.js";
import { validateEnvironment } from "./config/env.schema.js";
import { DatabaseModule } from "./database/database.module.js";
import { ContentModule } from "./content/content.module.js";
import { LearnModule } from "./learn/learn.module.js";
import { MonitoringModule } from "./monitoring/monitoring.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [".env.local", ".env"],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AcademiesModule,
    AuthModule,
    AuthorizationModule,
    ClassesModule,
    ContentModule,
    LearnModule,
    MonitoringModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
