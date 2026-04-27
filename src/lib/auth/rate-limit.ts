/**
 * In-memory rate-limiter voor magic-link-aanvragen.
 *
 * Simpele sliding-window per `(ipHash, email)`-combinatie.
 * Default-limiet: 2 aanvragen per minuut.
 *
 * **Bewuste keuze: in-memory.** Voor één Node-instance is dit ruim
 * voldoende; bij scale-out (meerdere replicas) zou je naar Redis
 * willen — gedocumenteerd in CHANGELOG als P2-roadmap.
 *
 * Niet bedoeld voor exact-counting; `resetForTest()` exposeert een
 * cleanup-haak voor unit-tests zodat parallel tests elkaar niet beïnvloeden.
 */

interface Entry {
  /** Aanroep-tijdstippen als ms-since-epoch, oplopend gesorteerd. */
  timestamps: number[];
}

const buckets = new Map<string, Entry>();

export interface RateLimitDecision {
  allowed: boolean;
  /** Aantal recente aanroepen in het venster (incl. de huidige als allowed). */
  count: number;
  /** Hoeveel ms tot er weer ruimte is (0 = direct). */
  retryAfterMs: number;
}

export interface RateLimitOptions {
  /** Maximaal aantal aanroepen per venster. Default 2. */
  max?: number;
  /** Vensterduur in ms. Default 60_000 (1 minuut). */
  windowMs?: number;
  /** Override `now` voor deterministische tests. */
  now?: number;
}

const DEFAULT_MAX = 2;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Registreert een aanroep en retourneert of 'ie binnen limiet valt.
 * Roept de caller met de combinatie `(ipHash, email)` aan; één van
 * beide mag null zijn als de andere identifier voldoende is, maar
 * voor magic-links altijd allebei meegeven.
 */
export function checkRateLimit(
  ipHash: string | null | undefined,
  email: string | null | undefined,
  options: RateLimitOptions = {},
): RateLimitDecision {
  const max = options.max ?? DEFAULT_MAX;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now();

  const key = `${ipHash ?? "anon"}|${(email ?? "").toLowerCase()}`;
  const entry = buckets.get(key) ?? { timestamps: [] };
  // Drop oude tijdstempels buiten het venster.
  entry.timestamps = entry.timestamps.filter((t) => t > now - windowMs);

  if (entry.timestamps.length >= max) {
    const oldest = entry.timestamps[0]!;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    buckets.set(key, entry);
    return { allowed: false, count: entry.timestamps.length, retryAfterMs };
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true, count: entry.timestamps.length, retryAfterMs: 0 };
}

/** Test-only: leegt de in-memory store. */
export function resetRateLimitForTest(): void {
  buckets.clear();
}
