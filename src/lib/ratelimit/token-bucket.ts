/**
 * Pure token-bucket implementatie.
 *
 * Geen state in deze module — alle state zit in het `BucketState` object
 * dat de caller bewaart. Dat maakt 'em testbaar zonder mocks en
 * herbruikbaar voor zowel een in-memory `Map` (huidige setup) als een
 * Redis HSET (toekomstige multi-instance setup).
 *
 * Algoritme (klassiek token-bucket):
 *   - bucket heeft `capacity` tokens (= burst-limiet)
 *   - tokens vullen zich met `refillPerSec` per seconde, gecapped op `capacity`
 *   - elke request consumeert 1 token; geen token → 429
 *
 * Waarom token-bucket en geen sliding-window? Token-bucket geeft je
 * gratis "burst-tolerantie": een gebruiker mag een korte stoot van
 * `capacity` calls doen (bv. dashboard laadt 8 widgets parallel) zónder
 * te falen, zolang de gemiddelde rate eronder blijft. Sliding-window
 * straft die normale UX-burst af.
 */

export interface BucketConfig {
  /** Maximum aantal tokens (burst-limiet). */
  capacity: number;
  /** Refill-snelheid in tokens per seconde. */
  refillPerSec: number;
}

export interface BucketState {
  /** Aantal beschikbare tokens, als floating-point voor partial refill. */
  tokens: number;
  /** Laatste update-tijdstip in ms-since-epoch. */
  lastRefillMs: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** Tokens beschikbaar na deze poging. */
  remaining: number;
  /** Ms tot er weer 1 token beschikbaar is (0 als allowed). */
  retryAfterMs: number;
  /** State om terug te schrijven naar je store. */
  state: BucketState;
}

export function createBucket(
  config: BucketConfig,
  nowMs: number,
): BucketState {
  return { tokens: config.capacity, lastRefillMs: nowMs };
}

/**
 * Probeer 1 token te consumeren. Pure functie: krijgt huidige state +
 * config + tijd, geeft nieuwe state + beslissing terug.
 */
export function tryConsume(
  state: BucketState,
  config: BucketConfig,
  nowMs: number,
): ConsumeResult {
  // Refill op basis van tijd-sinds-laatste-update. Clock-skew (nowMs <
  // lastRefillMs) wordt naar 0 geclamped — anders zou een terugzettende
  // klok tokens kunnen aftrekken.
  const elapsedSec = Math.max(0, (nowMs - state.lastRefillMs) / 1000);
  const refilled = Math.min(
    config.capacity,
    state.tokens + elapsedSec * config.refillPerSec,
  );

  if (refilled >= 1) {
    const next: BucketState = {
      tokens: refilled - 1,
      lastRefillMs: nowMs,
    };
    return {
      allowed: true,
      remaining: Math.floor(next.tokens),
      retryAfterMs: 0,
      state: next,
    };
  }

  // Niet genoeg tokens — bereken hoeveel ms tot er weer 1 is.
  const tokensNeeded = 1 - refilled;
  const retryAfterMs =
    config.refillPerSec > 0
      ? Math.ceil((tokensNeeded / config.refillPerSec) * 1000)
      : Number.POSITIVE_INFINITY;

  return {
    allowed: false,
    remaining: 0,
    retryAfterMs,
    state: {
      tokens: refilled,
      lastRefillMs: nowMs,
    },
  };
}
