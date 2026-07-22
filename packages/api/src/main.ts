import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module.js";
import type { ApiEnvironment } from "./config/env.schema.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<ApiEnvironment, true>);

  app.setGlobalPrefix("api");
  app.enableCors({
    credentials: true,
    origin: configService.get("WEB_ORIGIN", { infer: true }),
  });
  app.enableShutdownHooks();

  await app.listen(configService.get("PORT", { infer: true }));
}

void bootstrap();
