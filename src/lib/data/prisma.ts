import { Prisma, PrismaClient } from "@prisma/client";

// Zorg dat in development geen nieuwe PrismaClient per HMR-reload wordt aangemaakt.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * **Slow-query drempel** — Prisma `$use`-middleware logt elke query
 * waarvan de execution-tijd boven dit aantal ms uitkomt. Default 500ms;
 * via env `PRISMA_SLOW_QUERY_THRESHOLD_MS` overschrijfbaar voor staging
 * (bv. 200ms voor strenger profileren).
 *
 * Bewuste keuze: lazy-import `log` om circular dep te vermijden in
 * Next.js' lib-graph (data-laag mag niet hard afhangen van
 * presentatie-laag).
 */
const SLOW_QUERY_THRESHOLD_MS = (() => {
  const raw = process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS;
  if (!raw) return 500;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 500;
})();

function buildPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  // Slow-query middleware. Werkt non-blocking; bij fout in logger laten
  // we de query gewoon doorgaan (logger heeft eigen swallow-pad).
  client.$use(async (params: Prisma.MiddlewareParams, next) => {
    const start = Date.now();
    try {
      const result = await next(params);
      const duration = Date.now() - start;
      if (duration >= SLOW_QUERY_THRESHOLD_MS) {
        // Lazy-import; voorkomt cyclic-deps op cold-start.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { log } = require("@/lib/log") as typeof import("@/lib/log");
        log.warn("prisma:slow", "slow_query", {
          model: params.model ?? "raw",
          action: params.action,
          durationMs: duration,
          thresholdMs: SLOW_QUERY_THRESHOLD_MS,
        });
      }
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { log } = require("@/lib/log") as typeof import("@/lib/log");
      log.error("prisma:slow", "query_error", {
        model: params.model ?? "raw",
        action: params.action,
        durationMs: duration,
        errorName: error instanceof Error ? error.name : "non-error",
      });
      throw error;
    }
  });

  return client;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
