/**
 * Lichtgewicht runtime-validatie helpers voor API routes. Geen externe
 * dependency: we willen de bundle en attack-surface klein houden. Elke
 * helper retourneert een typed `ValidationResult` zodat routes één
 * uniform error-pad kunnen volgen.
 *
 * Gebruik:
 * ```ts
 * const parsed = expectObject(await safeJson(request));
 * if (!parsed.ok) return jsonError(parsed.error, 400);
 * ```
 *
 * Doel is *geen* volwaardige schema-taal. We valideren genoeg om
 * runtime-crashes en silent NaN-propagatie te voorkomen; de rest houden
 * we type-safe via TypeScript interfaces.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

/**
 * Parse een request body als JSON zonder dat een malformed body de route
 * opblaast. Retourneert `undefined` bij lege body of parse-fout. Laat
 * callers zelf beslissen of dat een 400 of een default is.
 */
export async function safeJson(
  request: { json: () => Promise<unknown> },
): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== null
  );
}

export function expectObject(
  value: unknown,
): ValidationResult<Record<string, unknown>> {
  if (value === undefined || value === null) return ok({});
  if (!isPlainObject(value)) return fail("Body moet een JSON-object zijn.");
  return ok(value);
}

export interface StringOptions {
  /** Minimale lengte na trim. Default 1. */
  minLength?: number;
  maxLength?: number;
  /** Whitelist op karakters. Faalt anders met 400. */
  pattern?: RegExp;
  /** Optioneel — retourneert `undefined` als het veld ontbreekt. */
  optional?: boolean;
  /** Standaardwaarde als het veld ontbreekt en `optional` niet is gezet. */
  fallback?: string;
}

export function parseString(
  raw: unknown,
  field: string,
  options: StringOptions = {},
): ValidationResult<string | undefined> {
  const { minLength = 1, maxLength = 2_000, pattern } = options;
  if (raw === undefined || raw === null || raw === "") {
    if (options.optional) return ok(undefined);
    if (options.fallback !== undefined) return ok(options.fallback);
    return fail(`\`${field}\` is verplicht.`);
  }
  if (typeof raw !== "string") {
    return fail(`\`${field}\` moet een string zijn.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length < minLength) {
    return fail(`\`${field}\` moet minimaal ${minLength} teken(s) zijn.`);
  }
  if (trimmed.length > maxLength) {
    return fail(`\`${field}\` mag maximaal ${maxLength} teken(s) zijn.`);
  }
  if (pattern && !pattern.test(trimmed)) {
    return fail(`\`${field}\` heeft een ongeldig formaat.`);
  }
  return ok(trimmed);
}

export interface StringArrayOptions {
  maxItems?: number;
  /** Valideer elke entry via `parseString`. */
  itemOptions?: StringOptions;
  /** Retourneer `undefined` als de property ontbreekt. */
  optional?: boolean;
}

export function parseStringArray(
  raw: unknown,
  field: string,
  options: StringArrayOptions = {},
): ValidationResult<string[] | undefined> {
  const { maxItems = 100 } = options;
  if (raw === undefined || raw === null) {
    if (options.optional) return ok(undefined);
    return fail(`\`${field}\` is verplicht.`);
  }
  if (!Array.isArray(raw)) {
    return fail(`\`${field}\` moet een array zijn.`);
  }
  if (raw.length > maxItems) {
    return fail(`\`${field}\` mag maximaal ${maxItems} entries bevatten.`);
  }
  const values: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = parseString(raw[i], `${field}[${i}]`, options.itemOptions);
    if (!entry.ok) return entry;
    if (entry.value !== undefined) values.push(entry.value);
  }
  return ok(values);
}

/** ISO-8601 date (YYYY-MM-DD). Strikt: geen tijd, geen timezone. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(
  raw: unknown,
  field: string,
  options: { optional?: boolean } = {},
): ValidationResult<string | undefined> {
  const parsed = parseString(raw, field, { optional: options.optional });
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (value === undefined) return ok(undefined);
  if (!ISO_DATE_RE.test(value)) {
    return fail(`\`${field}\` moet formaat YYYY-MM-DD hebben.`);
  }
  const millis = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(millis)) {
    return fail(`\`${field}\` is geen geldige datum.`);
  }
  return ok(value);
}

export interface BoundedNumberOptions {
  min?: number;
  max?: number;
  /** Als waarde ontbreekt of NaN is, deze fallback gebruiken. */
  fallback?: number;
  optional?: boolean;
  /** Alleen integers accepteren. */
  integer?: boolean;
}

/**
 * Parse een numerieke waarde uit onbetrouwbare input (form field, JSON,
 * etc). Cruciaal: `NaN` wordt ALTIJD naar `null`/error gemapt — dit
 * voorkomt de bug waarbij `Number("NaN")` silent NaN retourneert en
 * fallback `??` het niet meer vangt.
 */
export function parseBoundedNumber(
  raw: unknown,
  field: string,
  options: BoundedNumberOptions = {},
): ValidationResult<number | undefined> {
  if (raw === undefined || raw === null || raw === "") {
    if (options.fallback !== undefined) return ok(options.fallback);
    if (options.optional) return ok(undefined);
    return fail(`\`${field}\` is verplicht.`);
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return fail(`\`${field}\` moet een eindig getal zijn.`);
  }
  if (options.integer && !Number.isInteger(n)) {
    return fail(`\`${field}\` moet een geheel getal zijn.`);
  }
  if (options.min !== undefined && n < options.min) {
    return fail(`\`${field}\` moet ≥ ${options.min} zijn.`);
  }
  if (options.max !== undefined && n > options.max) {
    return fail(`\`${field}\` moet ≤ ${options.max} zijn.`);
  }
  return ok(n);
}

export interface EnumOptions<T extends string> {
  optional?: boolean;
  fallback?: T;
}

export function parseEnum<T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[],
  options: EnumOptions<T> = {},
): ValidationResult<T | undefined> {
  if (raw === undefined || raw === null || raw === "") {
    if (options.fallback !== undefined) return ok(options.fallback);
    if (options.optional) return ok(undefined);
    return fail(`\`${field}\` is verplicht.`);
  }
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    return fail(
      `\`${field}\` moet één van deze waarden zijn: ${allowed.join(", ")}.`,
    );
  }
  return ok(raw as T);
}

/**
 * Strikte tickers-parser: alleen letters, cijfers, punt en streepje,
 * 1..24 tekens. Weert attacker-input met rare karakters en DOS-achtige
 * lengtes.
 */
const TICKER_RE = /^[A-Z0-9][A-Z0-9._-]{0,23}$/;

export function parseTickerStrict(
  raw: unknown,
  field = "ticker",
  options: { optional?: boolean } = {},
): ValidationResult<string | undefined> {
  const parsed = parseString(raw, field, {
    optional: options.optional,
    minLength: 1,
    maxLength: 24,
  });
  if (!parsed.ok) return parsed;
  if (parsed.value === undefined) return ok(undefined);
  const upper = parsed.value.toUpperCase();
  if (!TICKER_RE.test(upper)) {
    return fail(`\`${field}\` bevat ongeldige tekens.`);
  }
  return ok(upper);
}

/**
 * Cast een onbekende waarde naar `number | null`. Anders dan `Number(x)`
 * retourneert dit expliciet `null` voor `NaN`, `Infinity`, strings met
 * spaties, of non-numeric types. Bedoeld voor Prisma JSON-velden en
 * provider-output die met nullable numerics werkt.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    // Prisma Decimal: { toString(): string } — convert via string.
    // Arrays exclude we expliciet: `[].toString() === ""` → `Number("") === 0`,
    // wat 0 zou retourneren waar de caller juist `null` verwacht.
    if (typeof (value as { toString?: unknown }).toString === "function") {
      const str = (value as { toString: () => string }).toString();
      // Bijv. `{nested:true}.toString() === "[object Object]"` — filter dat
      // expliciet zodat Number() geen verwarrend resultaat levert.
      if (str === "[object Object]") return null;
      const n = Number(str);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}
