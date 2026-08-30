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

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Fotos só via /api/media (autenticado) — não expor /uploads estático
  app.setGlobalPrefix("api");
  const corsRaw = process.env.CORS_ORIGIN?.trim();
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
