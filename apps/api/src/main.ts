import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../.env") });

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ensureUploadDir, UPLOADS_ROOT } from "./common/uploads-path";

async function bootstrap() {
  ensureUploadDir();
  ensureUploadDir("professionals");
  ensureUploadDir("patients");

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(UPLOADS_ROOT, { prefix: "/uploads/" });
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Equilíbrio API on http://localhost:${port}/api`);
  console.log(`Uploads dir: ${UPLOADS_ROOT}`);
}

bootstrap();
