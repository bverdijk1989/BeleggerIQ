/**
 * AI-narrative-uplift voor research-dossier (Wood-laag).
 *
 * **Wat is dit**: het deterministische research-dossier produceert
 * thesis/bull/bear/risks. Deze module voegt OPTIONEEL een rijkere
 * AI-narrative toe die de bullets-output combineert met portfolio-context
 * tot een leesbaar verhaal.
 *
 * **Niet predictor — wel storyteller**: AI wordt gebruikt voor het
 * VERTAAL-werk, niet om signalen te vinden. De ruwe data komt 100% uit
 * deterministische engines (factor-scoring, valuation, etc.).
 *
 * **Guardrails**: zelfde 4-laags structuur als briefing/explainability —
 * banned phrases, hedged language, numeric-claim validation tegen de
 * source-dossier-context.
 *
 * **Cost + cache**: emit `metric:ai_cost` per call (scope:
 * "research_narrative"); 12-uur TTL cache via TtlCache (zelfde patroon
 * als briefing).
 */

import { TtlCache } from "@/lib/data/cache";
import { recordAICost } from "@/lib/perf";

import { resolveAIProvider, type AIProvider } from "./provider";
import type { ResearchDossier } from "./research-dossier";

export interface ResearchNarrative {
  /** 1-2 paragraaf NL spreektaal-narrative. */
  story: string;
  /** Drie kernfactoren in plain-NL — meer "verhaal", minder "score". */
  keyDrivers: string[];
  /** Nuances die in de deterministische dossier weg gevallen waren. */
  nuances: string[];
  /** Source-mode: "ai" of "fallback". */
  mode: "ai" | "fallback";
  /** Welk model leverde de output. */
  model: string;
  /** Optioneel: reden waarom AI faalde (bij mode=fallback). */
  rejectionReason?: string;
}

const CACHE_TTL_SEC = 12 * 60 * 60;
const narrativeCache = new TtlCache({ maxEntries: 200 });

const MAX_OUTPUT_TOKENS = 600;

const SYSTEM_PROMPT = `
Je bent een Nederlandse beleggingsanalist die geschreven analyses verzorgt
voor een ervaren retail-belegger. Schrijf nuchter, in spreektaal, geen
hype, geen "garantie", geen koopadvies.

REGELS:
- Houd je STRIKT aan de getallen in de context. Geen feiten verzinnen.
- Gebruik hedged language: "lijkt", "kan", "wijst op", "valt te verwachten".
- Niet-bevestigde claims expliciet markeren ("op basis van Q3-cijfers...").
- Output: JSON met { story (string, 80-150 woorden), keyDrivers (3 strings, max 60 chars elk), nuances (1-3 strings) }.
- Geen markdown-fences. Pure JSON.
`.trim();

const BANNED_PHRASES: ReadonlyArray<string> = [
  "gegarandeerd",
  "100% zeker",
  "kopen",
  "verkopen",
  "kans van",
  "must-buy",
];

const HEDGED_TERMS: ReadonlyArray<string> = [
  "lijkt",
  "kan",
  "mogelijk",
  "valt te",
  "wijst op",
  "ondersteunt",
  "suggereert",
  "overweeg",
];

function cacheKey(dossier: ResearchDossier): string {
  // Stabiel: dezelfde ticker + thesis-hash → cache-hit.
  let h = 5381;
  const input = `${dossier.ticker}|${dossier.thesis}|${dossier.confidence}`;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return `narrative:${dossier.ticker}:${(h >>> 0).toString(16)}`;
}

function buildPrompt(dossier: ResearchDossier): string {
  return JSON.stringify(
    {
      ticker: dossier.ticker,
      name: dossier.name,
      thesis: dossier.thesis,
      bullCase: dossier.bullCase,
      bearCase: dossier.bearCase,
      keyNumbers: dossier.keyNumbers.map((m) => ({
        label: m.label,
        value: m.value,
      })),
      risks: dossier.risks,
      missingData: dossier.missingData,
      confidence: dossier.confidence,
    },
    null,
    2,
  );
}

interface ParseResult {
  ok: boolean;
  narrative?: { story: string; keyDrivers: string[]; nuances: string[] };
  reason?: string;
}

function parseAndValidate(
  text: string,
  dossier: ResearchDossier,
): ParseResult {
  let parsed: unknown;
  try {
    // Tolerant voor markdown-fence wrap.
    const stripped = text
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
    parsed = JSON.parse(stripped);
  } catch {
    return { ok: false, reason: "json_parse_failed" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "not_object" };
  }
  const obj = parsed as Record<string, unknown>;
  const story = typeof obj.story === "string" ? obj.story : "";
  const keyDriversRaw = Array.isArray(obj.keyDrivers) ? obj.keyDrivers : [];
  const nuancesRaw = Array.isArray(obj.nuances) ? obj.nuances : [];

  if (story.length < 50 || story.length > 1500) {
    return { ok: false, reason: "story_length" };
  }
  const keyDrivers = keyDriversRaw
    .filter((s): s is string => typeof s === "string" && s.length <= 100)
    .slice(0, 3);
  const nuances = nuancesRaw
    .filter((s): s is string => typeof s === "string" && s.length <= 200)
    .slice(0, 3);

  // Banned phrases check.
  const lowered = story.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lowered.includes(phrase)) {
      return { ok: false, reason: `banned_phrase:${phrase}` };
    }
  }

  // Hedged language check.
  const hedged = HEDGED_TERMS.some((t) => lowered.includes(t));
  if (!hedged) {
    return { ok: false, reason: "no_hedged_language" };
  }

  // Numeric-claim cross-check: elke %-getal in story moet voorkomen in
  // de dossier-context (bullCase/bearCase/keyNumbers).
  const numbersInStory = story.match(/[\d]+(?:[.,]\d+)?\s?%/g) ?? [];
  if (numbersInStory.length > 0) {
    const dossierContext = [
      dossier.thesis,
      ...dossier.bullCase,
      ...dossier.bearCase,
      ...dossier.keyNumbers.map((m) => m.value),
    ]
      .join(" ")
      .toLowerCase();
    for (const n of numbersInStory) {
      const normalized = n.replace(",", ".").replace(/\s+/g, "").toLowerCase();
      const altComma = normalized.replace(".", ",");
      if (
        !dossierContext.includes(normalized) &&
        !dossierContext.includes(altComma)
      ) {
        return { ok: false, reason: `unbacked_number:${n}` };
      }
    }
  }

  return { ok: true, narrative: { story, keyDrivers, nuances } };
}

function buildFallback(dossier: ResearchDossier): ResearchNarrative {
  // Wanneer AI faalt: deterministische narrative samengesteld uit
  // bullCase + bearCase. Niet zo "verhalend" maar feitelijk juist.
  const bullSentence =
    dossier.bullCase.length > 0
      ? `Positieve signalen: ${dossier.bullCase.slice(0, 2).join("; ")}`
      : null;
  const bearSentence =
    dossier.bearCase.length > 0
      ? `Risico's: ${dossier.bearCase.slice(0, 2).join("; ")}`
      : null;
  const story = [
    dossier.thesis,
    bullSentence,
    bearSentence,
    "Meer data zou de zekerheid kunnen verhogen.",
  ]
    .filter((s): s is string => Boolean(s))
    .join(" ");
  return {
    story,
    keyDrivers: dossier.bullCase.slice(0, 3).map((s) => s.slice(0, 100)),
    nuances: dossier.missingData.slice(0, 3),
    mode: "fallback",
    model: "deterministic",
  };
}

export interface BuildNarrativeOptions {
  /** Override de provider (voor tests). Anders resolveAIProvider(). */
  provider?: AIProvider;
  /** Skip cache. */
  skipCache?: boolean;
}

/**
 * Verrijk een research-dossier met een AI-narrative. Falt safe naar
 * deterministische fallback bij elke fout.
 */
export async function buildResearchNarrative(
  dossier: ResearchDossier,
  options: BuildNarrativeOptions = {},
): Promise<ResearchNarrative> {
  const key = cacheKey(dossier);
  if (!options.skipCache) {
    const cached = narrativeCache.get<ResearchNarrative>(key);
    if (cached) return cached;
  }

  const provider = options.provider ?? resolveAIProvider();
  if (provider.id === "deterministic") {
    const fallback = buildFallback(dossier);
    narrativeCache.set(key, fallback, CACHE_TTL_SEC);
    return fallback;
  }

  let narrative: ResearchNarrative;
  try {
    const response = await provider.complete({
      system: SYSTEM_PROMPT,
      user: buildPrompt(dossier),
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    recordAICost({
      provider:
        response.providerId === "anthropic" || response.providerId === "openai"
          ? response.providerId
          : response.providerId === "deterministic"
            ? "noop"
            : "unknown",
      model: response.model,
      scope: "research_narrative",
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      cacheHit: false,
    });

    if (!response.text) {
      const fallback = buildFallback(dossier);
      fallback.rejectionReason = response.errorReason ?? "empty_text";
      narrativeCache.set(key, fallback, CACHE_TTL_SEC);
      return fallback;
    }

    const validated = parseAndValidate(response.text, dossier);
    if (!validated.ok || !validated.narrative) {
      const fallback = buildFallback(dossier);
      fallback.rejectionReason = validated.reason ?? "validation_failed";
      narrativeCache.set(key, fallback, CACHE_TTL_SEC);
      return fallback;
    }

    narrative = {
      story: validated.narrative.story,
      keyDrivers: validated.narrative.keyDrivers,
      nuances: validated.narrative.nuances,
      mode: "ai",
      model: response.model,
    };
  } catch (error) {
    const fallback = buildFallback(dossier);
    fallback.rejectionReason =
      error instanceof Error ? `provider_throw:${error.message}` : "provider_throw";
    narrativeCache.set(key, fallback, CACHE_TTL_SEC);
    return fallback;
  }

  narrativeCache.set(key, narrative, CACHE_TTL_SEC);
  return narrative;
}
