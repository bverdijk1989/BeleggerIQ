import { addLogSink, type LogEvent, type LogSink } from "@/lib/log";

/**
 * Optionele Sentry-integratie.
 *
 * **Activeren door:**
 *   - `SENTRY_DSN` env-var setten (een geldig DSN-URL).
 *   - `@sentry/node` (server) en/of `@sentry/browser` (client) installeren.
 *
 * **Geen DSN of geen package:** module is een no-op. Dit is bewust:
 *   - We willen geen hard-dependency op Sentry — extra bytes in de bundle
 *     wanneer een operator 'em niet wil gebruiken.
 *   - Tests draaien zonder DSN; init wordt geskipt.
 *
 * **Wat sturen we naar Sentry?**
 *   - `error`-level log-events → captured als breadcrumbs + exception.
 *   - `warn`-level → breadcrumb (geen page).
 *   - Lager dan `warn` → genegeerd; te veel volume voor zinnige alerts.
 *
 * **Wat NIET:**
 *   - We sturen geen request-bodies (prive-data). Alleen scope, msg,
 *     en de fields die de logger al heeft geredacteerd.
 *   - We init'en niet in Edge-runtime. Sentry-Edge bestaat maar heeft
 *     andere init — niet in scope voor v1.
 */

interface SentryLike {
  init(options: { dsn: string; environment?: string; release?: string }): void;
  captureException(err: unknown, ctx?: unknown): void;
  captureMessage(msg: string, level?: string): void;
  addBreadcrumb(b: {
    level?: string;
    category?: string;
    message?: string;
    data?: Record<string, unknown>;
  }): void;
}

let sentry: SentryLike | null = null;
let initialized = false;

async function loadSentry(): Promise<SentryLike | null> {
  // Dynamische import zonder dat tsc 'em vereist als hard dep.
  // Function-indirectie voorkomt dat de bundler 'em statisch oppakt.
  const dynamicImport = new Function(
    "m",
    "return import(m)",
  ) as (m: string) => Promise<unknown>;
  const moduleName =
    typeof window === "undefined" ? "@sentry/node" : "@sentry/browser";
  try {
    const mod = await dynamicImport(moduleName);
    return mod as SentryLike;
  } catch {
    return null;
  }
}

/**
 * Initialize Sentry als DSN aanwezig is en het package geïnstalleerd is.
 * Idempotent: tweede call doet niets.
 */
export async function initSentry(): Promise<boolean> {
  if (initialized) return sentry !== null;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  sentry = await loadSentry();
  if (!sentry) {
    // eslint-disable-next-line no-console
    console.info({
      scope: "observability:sentry",
      level: "info",
      msg: "sentry_dsn_set_but_package_missing",
    });
    return false;
  }

  sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release:
      process.env.BIQ_GIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      undefined,
  });

  addLogSink(createSentrySink());
  return true;
}

/** Test-only — bouw een sink met een geïnjecteerde Sentry-stub. */
export function createSentrySink(client: SentryLike | null = sentry): LogSink {
  return {
    name: "sentry",
    emit(event: LogEvent): void {
      if (!client) return;
      if (event.level === "debug" || event.level === "info") return;

      const breadcrumb = {
        level: event.level,
        category: event.scope,
        message: event.msg,
        data: event.fields,
      };
      client.addBreadcrumb(breadcrumb);

      if (event.level === "error") {
        const errField = event.fields.error;
        if (
          errField &&
          typeof errField === "object" &&
          "name" in errField &&
          "message" in errField
        ) {
          // Logger heeft Errors al ge-serialiseerd → reconstrueer een
          // Error-instance zodat Sentry 'em correct kan groupen.
          const reconstructed = new Error(String(errField.message));
          reconstructed.name = String(errField.name);
          client.captureException(reconstructed, {
            tags: { scope: event.scope },
            extra: event.fields,
          });
        } else {
          client.captureMessage(`${event.scope}: ${event.msg}`, "error");
        }
      }
    },
  };
}

/** Test-only reset. */
export function _resetSentryForTest(): void {
  sentry = null;
  initialized = false;
}
