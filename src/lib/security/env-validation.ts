/**
 * Startup env-validatie — fail-fast wanneer kritieke env-vars ontbreken
 * of zwak zijn. Voorkomt dat de app "halftime" start en pas crasht bij
 * de eerste DB-call of cookie-sign.
 *
 * **Filosofie**:
 *  - Required vars: zonder zou de app niet correct functioneren in productie
 *  - Recommended vars: degraderen functionaliteit als ze ontbreken (bv. SMTP → magic-link werkt niet)
 *  - Production-strict: extra checks die alleen in productie hard falen
 *    (bv. demo-auth flag mag niet aan staan)
 *
 * **Resultaat-shape**: `{ ok: boolean, errors: string[], warnings: string[] }`.
 * Een caller kan beslissen om `process.exit(1)` te doen op `!ok`.
 */

export interface EnvValidationResult {
  ok: boolean;
  errors: ReadonlyArray<string>;
  warnings: ReadonlyArray<string>;
}

export interface EnvValidationOptions {
  /** Override: behandel deze als productie ongeacht NODE_ENV. */
  productionMode?: boolean;
  /** Test-hook: lever eigen env-snapshot ipv `process.env`. */
  env?: Record<string, string | undefined>;
}

const REQUIRED_ALWAYS = ["DATABASE_URL"] as const;
const REQUIRED_PROD = ["BIQ_SESSION_SECRET", "DATABASE_URL"] as const;
const RECOMMENDED = ["MAIL_TRANSPORT"] as const;
const SMTP_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

const MIN_SECRET_LENGTH = 32;

export function validateEnv(opts: EnvValidationOptions = {}): EnvValidationResult {
  const env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
  const isProd =
    opts.productionMode ?? env.NODE_ENV === "production";

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required-always
  for (const key of REQUIRED_ALWAYS) {
    if (!env[key] || env[key]!.trim().length === 0) {
      errors.push(`Required env-var missing: ${key}`);
    }
  }

  // 2. Production-strict
  if (isProd) {
    for (const key of REQUIRED_PROD) {
      if (!env[key] || env[key]!.trim().length === 0) {
        errors.push(`Required prod env-var missing: ${key}`);
      }
    }
    const secret = env.BIQ_SESSION_SECRET;
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      errors.push(
        `BIQ_SESSION_SECRET too short (${secret.length} < ${MIN_SECRET_LENGTH})`,
      );
    }
    if (env.BIQ_ALLOW_DEMO_AUTH === "true") {
      errors.push("BIQ_ALLOW_DEMO_AUTH=true is forbidden in production");
    }
    // Database URL hint — geen ssl in prod = waarschuwing
    const db = env.DATABASE_URL ?? "";
    if (db && !/sslmode=(require|verify-full)/.test(db)) {
      warnings.push("DATABASE_URL has no sslmode=require — SSL is recommended in production");
    }
  } else {
    // Dev / test: warn niet error
    const secret = env.BIQ_SESSION_SECRET;
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      warnings.push(
        `BIQ_SESSION_SECRET is short (${secret.length} < ${MIN_SECRET_LENGTH}) — fine for dev, fix for prod`,
      );
    }
  }

  // 3. Recommended
  for (const key of RECOMMENDED) {
    if (!env[key]) {
      warnings.push(`Recommended env-var missing: ${key} (functionality may degrade)`);
    }
  }

  // 4. SMTP — als MAIL_TRANSPORT=smtp, dan moeten SMTP_* gezet zijn
  if (env.MAIL_TRANSPORT === "smtp") {
    for (const key of SMTP_VARS) {
      if (!env[key]) {
        const lvl = isProd ? errors : warnings;
        lvl.push(`SMTP enabled but ${key} missing`);
      }
    }
  }

  // 5. Productie + ontbrekende observability-sink: warning
  if (isProd && !env.SENTRY_DSN && !env.LOG_SINK_URL) {
    warnings.push(
      "No observability sink configured (SENTRY_DSN or LOG_SINK_URL) — stdout-only logging",
    );
  }

  // 6. OAuth: beide-of-geen — half-gezet is een config-bug
  const hasClientId = Boolean(env.GOOGLE_CLIENT_ID);
  const hasClientSecret = Boolean(env.GOOGLE_CLIENT_SECRET);
  if (hasClientId !== hasClientSecret) {
    errors.push(
      "Google OAuth half-configured: GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET moeten allebei gezet zijn of allebei niet",
    );
  }

  // 7. Stripe (Module 19): wanneer STRIPE_SECRET_KEY actief is, moeten
  //    de price-IDs voor de paid tiers ook gezet zijn. We loggen
  //    UITSLUITEND de naam van de ontbrekende env-var, NOOIT de waarde.
  if (env.STRIPE_SECRET_KEY) {
    const STRIPE_PRICE_KEYS = [
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_YEARLY",
      "STRIPE_PRICE_ELITE_MONTHLY",
      "STRIPE_PRICE_ELITE_YEARLY",
    ] as const;
    const missing = STRIPE_PRICE_KEYS.filter((k) => !env[k]);
    if (missing.length > 0) {
      const lvl = isProd ? errors : warnings;
      lvl.push(
        `Stripe enabled but price-IDs missing: ${missing.join(", ")}`,
      );
    }
    // Webhook-secret is vereist om Stripe-events veilig te valideren.
    if (!env.STRIPE_WEBHOOK_SECRET) {
      const lvl = isProd ? errors : warnings;
      lvl.push("Stripe enabled but STRIPE_WEBHOOK_SECRET missing");
    }
  }

  // 8. AI-provider readiness (Module 19): wanneer AI_PROVIDER expliciet
  //    op anthropic/openai staat, moet er ook een key zijn.
  const aiProvider = env.AI_PROVIDER;
  if (aiProvider === "anthropic" && !env.ANTHROPIC_API_KEY) {
    const lvl = isProd ? errors : warnings;
    lvl.push("AI_PROVIDER=anthropic maar ANTHROPIC_API_KEY ontbreekt");
  }
  if (aiProvider === "openai" && !env.OPENAI_API_KEY) {
    const lvl = isProd ? errors : warnings;
    lvl.push("AI_PROVIDER=openai maar OPENAI_API_KEY ontbreekt");
  }
  // Productie zonder enige AI-provider → warning (fallback werkt nog).
  if (isProd && !aiProvider) {
    warnings.push(
      "AI_PROVIDER niet gezet — explainability draait in deterministische fallback-mode",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Helper voor server startup: log resultaat + (optioneel) exit op error
 * in productie. Gebruikt console direct want logger kan zelf nog niet
 * geconfigureerd zijn op startup-moment.
 */
export function assertEnvOrExit(opts: EnvValidationOptions = {}): EnvValidationResult {
  const result = validateEnv(opts);
  for (const w of result.warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[env] WARN: ${w}`);
  }
  for (const e of result.errors) {
    // eslint-disable-next-line no-console
    console.error(`[env] ERROR: ${e}`);
  }
  if (!result.ok && (opts.productionMode ?? process.env.NODE_ENV === "production")) {
    // In productie: hard fail. In dev: log-only zodat tests/dev niet stuk gaan.
    // eslint-disable-next-line no-console
    console.error("[env] env-validation failed in production — exiting");
    process.exit(1);
  }
  return result;
}
