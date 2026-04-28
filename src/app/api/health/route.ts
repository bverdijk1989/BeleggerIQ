import { NextResponse } from "next/server";

import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";

/**
 * GET /api/health
 *
 * Liveness + readiness probe. Bedoeld voor:
 *  - smoke-test na deploy (post-deploy gate in CI/CD)
 *  - external uptime-monitor (UptimeRobot, Healthchecks.io)
 *  - load-balancer health-check
 *
 * Retourneert 200 als de app + database beide bereikbaar zijn, anders 503.
 * We doen géén live calls naar externe market-data-providers — dat zou de
 * health-check duur en flaky maken (Yahoo rate-limits, etc.). We
 * rapporteren wel welke provider geconfigureerd is, zodat een verkeerd
 * gedeployde env-var snel zichtbaar is.
 *
 * Body-shape:
 * ```json
 * {
 *   "status": "ok" | "degraded",
 *   "checks": {
 *     "db": { "ok": true|false, "latencyMs": 12 },
 *     "provider": { "configured": "stub"|"yahoo"|"none" }
 *   },
 *   "version": { "git": "<sha>", "builtAt": "<iso>" },
 *   "uptimeSec": 1234
 * }
 * ```
 *
 * Auth: geen — dit endpoint mag publiek zijn. Het lekt geen secrets.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthCheck {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

interface HealthBody {
  status: "ok" | "degraded";
  checks: {
    db: HealthCheck;
    provider: { configured: string };
  };
  version: {
    git: string | null;
    builtAt: string | null;
    appVersion: string | null;
  };
  uptimeSec: number;
}

const DB_TIMEOUT_MS = 2000;

async function checkDatabase(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    // SELECT 1 is goedkoop genoeg om elke health-poll te doen, maar bewijst
    // dat de connection-pool werkt + de DB antwoordt. We wikkelen 'em in
    // een race tegen een timeout zodat een hangende DB de probe niet
    // tientallen seconden laat blokkeren.
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db_timeout")), DB_TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    log.error("api:health", "db check failed", { error });
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const db = await checkDatabase();
  const status: HealthBody["status"] = db.ok ? "ok" : "degraded";

  const body: HealthBody = {
    status,
    checks: {
      db,
      provider: {
        configured: (process.env.MARKET_DATA_PROVIDER ?? "stub").toLowerCase(),
      },
    },
    version: {
      git:
        process.env.BIQ_GIT_SHA ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.GITHUB_SHA ??
        null,
      builtAt: process.env.BIQ_BUILD_TIME ?? null,
      appVersion: process.env.npm_package_version ?? null,
    },
    uptimeSec: Math.round(process.uptime()),
  };

  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
