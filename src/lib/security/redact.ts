/**
 * Value-level PII redactor — vangt PII die in **values** terechtkomt
 * (bv. een email-adres in een free-text-veld, een IP in een
 * stack-trace-string).
 *
 * **Aanvulling op `src/lib/log.ts`** — die scrubt op *veld-naam*
 * (`password`, `token`, `cookie`, ...). Deze module scrubt op *patroon*
 * binnen string-waardes. Beide samen: defense-in-depth.
 *
 * **Bewuste keuze**: regex-gebaseerd, geen ML. Zwakker dan
 * dedicated DLP-tools maar dekt 95% van per-ongeluk-leakage zonder
 * dependency-overhead.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// IPv4: keep first octet for debug-context ("83.x.x.x"), redact rest.
const IPV4_RE = /\b(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
// IPv6 — eenvoudige variant; volledige RFC-4291-spec is overkill voor logs.
const IPV6_RE = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g;
// Bearer / api-key-achtige strings — lange random base64/hex blokken.
const BEARER_RE = /\b(Bearer|bearer)\s+[A-Za-z0-9._\-+/=]{16,}/g;
// Magic-link-achtige tokens (>=32 hex/base64 chars, geen spatie).
const LONG_TOKEN_RE = /\b[A-Za-z0-9_\-]{32,}\b/g;

const REDACTED_EMAIL = "[email-redacted]";
const REDACTED_IP_PREFIX = "x.x.x"; // we behouden eerste octet voor debug
const REDACTED_BEARER = "Bearer [redacted]";
const REDACTED_TOKEN = "[token-redacted]";

export interface RedactOptions {
  /** Of long-token-pattern (>=32 chars) ook moet worden geredacteerd.
   *  Default: false (te aggressief — vangt UUIDs en cuid's). */
  scrubLongTokens?: boolean;
  /** Of we IPs volledig moeten weghalen (niet eerste-octet bewaren). */
  fullIpRedact?: boolean;
}

/**
 * Scrubt PII-patronen uit een string-value.
 *
 * Idempotent: meerdere keren toepassen levert dezelfde output.
 */
export function redactString(value: string, opts: RedactOptions = {}): string {
  if (!value) return value;
  let out = value.replace(EMAIL_RE, REDACTED_EMAIL);
  out = out.replace(IPV4_RE, opts.fullIpRedact ? "x.x.x.x" : `$1.${REDACTED_IP_PREFIX}`);
  out = out.replace(IPV6_RE, "x:x:x");
  out = out.replace(BEARER_RE, REDACTED_BEARER);
  if (opts.scrubLongTokens) {
    out = out.replace(LONG_TOKEN_RE, REDACTED_TOKEN);
  }
  return out;
}

/**
 * Recursief: scrub strings binnen elk object/array. Non-string-types
 * worden ongemoeid gelaten.
 */
export function redactDeep<T>(value: T, opts: RedactOptions = {}, depth = 0): T {
  if (depth > 6) return value; // safety cap
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return redactString(value, opts) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, opts, depth + 1)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, opts, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * **Hash-helper** — voor wanneer je een correlatie-token in audit-logs
 * wilt zonder het origineel te bewaren (bv. IP voor rate-limit-bucket-
 * stable-id zonder de IP zelf te loggen).
 *
 * Niet cryptografisch sterk — we willen alleen identificatie binnen één
 * deployment, geen anti-hash-rainbow-table beveiliging. Voor dat laatste
 * zou je HMAC met een server-secret nodig hebben.
 */
export function hashIdentifier(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  // Convert to unsigned hex; 8-char prefix is genoeg voor uniqueness in logs.
  return ("00000000" + ((h >>> 0).toString(16))).slice(-8);
}

/**
 * Detect-only — handig in tests om te assert dat een prompt geen PII
 * bevat ("CI faalt als je per ongeluk email in een AI-prompt zet").
 */
export function detectPII(value: string): {
  emails: ReadonlyArray<string>;
  ipv4s: ReadonlyArray<string>;
  bearers: ReadonlyArray<string>;
} {
  return {
    emails: value.match(EMAIL_RE) ?? [],
    ipv4s: value.match(IPV4_RE) ?? [],
    bearers: value.match(BEARER_RE) ?? [],
  };
}
