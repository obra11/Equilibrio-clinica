const WEAK_SECRETS = new Set([
  "",
  "secret",
  "changeme",
  "change-me",
  "jwt-secret",
  "equilibrio-dev-secret-change-in-production",
]);

/** Fail-fast: API must not boot with a missing or known-weak JWT secret. */
export function assertJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (secret.length < 32) {
    throw new Error(
      "JWT_SECRET ausente ou curto demais (mín. 32 caracteres). Defina um valor forte em apps/api/.env",
    );
  }
  if (WEAK_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      "JWT_SECRET inseguro (valor de desenvolvimento conhecido). Gere um segredo novo em apps/api/.env",
    );
  }
  return secret;
}
