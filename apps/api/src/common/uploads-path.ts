import { existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Pasta física de uploads.
 * - Local: apps/api/uploads (relativo ao dist/src/common)
 * - Railway: defina UPLOADS_DIR no volume montado (ex.: /data/uploads)
 */
export const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || join(__dirname, "..", "..", "..", "uploads");

export function ensureUploadDir(...parts: string[]) {
  const dir = join(UPLOADS_ROOT, ...parts);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
