import "./load-env";

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { assertJwtSecret } from "./common/jwt-secret";
import { ensureUploadDir } from "./common/uploads-path";

async function bootstrap() {
  assertJwtSecret();
  ensureUploadDir();
  ensureUploadDir("professionals");
  ensureUploadDir("patients");
  ensureUploadDir("classes");
  ensureUploadDir("clinical");

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Fotos só via /api/media (autenticado) — não expor /uploads estático
  app.setGlobalPrefix("api");
  if (
    process.env.S3_BUCKET?.trim() &&
    process.env.S3_ACCESS_KEY_ID?.trim() &&
    process.env.S3_SECRET_ACCESS_KEY?.trim()
  ) {
    console.log(
      `[storage] Nuvem S3/R2 ativa (bucket=${process.env.S3_BUCKET}, maxVideo=${process.env.STORAGE_MAX_VIDEO_MB || 512}MB)`,
    );
  } else {
    console.warn(
      "[storage] Sem S3/R2 — uploads ficam no disco local e podem sumir no redeploy. Configure S3_BUCKET + chaves.",
    );
  }  const corsRaw = process.env.CORS_ORIGIN?.trim();
  const corsOrigin =
    !corsRaw || corsRaw === "*"
      ? true
      : corsRaw.split(",").map((o) => o.trim()).filter(Boolean);

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.use((
    _req: unknown,
    res: { setHeader: (k: string, v: string) => void },
    next: () => void,
  ) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Equilíbrio API on http://localhost:${port}/api`);
}

bootstrap();
