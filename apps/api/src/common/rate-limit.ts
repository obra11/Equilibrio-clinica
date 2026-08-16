import { HttpException, HttpStatus } from "@nestjs/common";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Rate limit simples em memória (dev/single-instance). */
export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HttpException(
      "Muitas tentativas. Aguarde e tente novamente.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
