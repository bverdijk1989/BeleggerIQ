# AI Explainability Layer — Module 7

Eén centrale service die de output van álle BeleggerIQ-engines vertaalt in begrijpelijke uitleg met een vaste structuur. Elk domein levert dezelfde shape — een UI-laag rendert generiek, een AI-laag vult 'em in (met fallback).

> **Doel**: een gewone belegger snapt binnen 30 seconden wat een score betekent, waarom dat belangrijk is, wat positief en wat risicovol is, en wat hij kan doen.

---

## 1. Zes ondersteunde domeinen

| Domain | Bron-engine | Public API |
|---|---|---|
| `portfolio_health` | Module 1 — Portfolio Health Score | `explainHealth(score)` |
| `investment_confidence` | Module 6 — Signal Fusion Engine | `explainConfidence(score)` |
| `macro_regime` | Module 5 — Macro Regime Engine | `explainMacro(report)` |
| `behavioral_coach` | Module 3 — Behavioral Coach | `explainBehavioral(context)` |
| `risk_analysis` | Risk Engine | `explainRisk(risk)` |
| `scenario_analysis` | Macro Scenarios | `explainScenarios(context)` |

Plus `explainAll(input)` die parallel uitleg ophaalt voor alle aanwezige inputs.

---

## 2. Output-schema (vast voor alle 6 domeinen)

```ts
interface DomainExplanation {
  domain: ExplainabilityDomain;
  generatedAt: ISODateString;

  // Modus-meta
  mode: "ai" | "fallback";
  providerId: string;
  model: string;

  // De spec-velden:
  summary: string;                // korte conclusie (1 zin)
  whyItMatters: string;           // waarom dit belangrijk is (1–2 zinnen)
  positives: string[];            // 1–4 bullets
  risks: string[];                // 1–4 bullets
  possibleActions: ExplanationAction[];  // 1–3 acties
  uncertainties: string[];        // 1–3 databeperkingen

  // Audit / kwaliteit
  confidence: "low" | "medium" | "high";
  sources: SourceTrace[];         // welke engines/velden zijn gebruikt
  disclaimer: string;             // vast template
}
```

`ExplanationAction = { title; rationale; link? }` — geen koop/verkoop-bevel.

---

## 3. Architectuur

```
src/lib/ai/explainability/
├── types.ts              # DomainExplanation + sub-types + labels
├── prompts.ts            # 6 domain-specifieke prompt-builders
├── fallbacks.ts          # 6 deterministische fallback-renderers
├── guardrails.ts         # JSON-shape + banned + hedged + numeric-claim
├── tracing.ts            # SourceTrace + dedupe-helper
├── service.ts            # Orchestrator (cache, AI-pipeline, fallback)
├── fixtures.ts           # Test-fixtures
├── *.test.ts             # 40 tests
└── index.ts              # Public API

src/components/explainability/
└── explanation-panel.tsx # Generieke UI voor alle 6 domeinen
```

---

## 4. De pipeline (per domein)

```
        ┌──────────────────────────┐
        │  buildDomainPrompt(...)  │  domain-specifieke system + user
        └─────────────┬────────────┘
                      │
                      ▼
        ┌──────────────────────────┐
        │  cache.get(domain+digest)│  12u TTL, FNV-1a hash van JSON
        └─────────────┬────────────┘
            hit?      │
            └─────────┼─→ return cached
                      │
                      ▼
        ┌──────────────────────────┐
        │  resolveAIProvider()     │  OpenAI / Anthropic / Deterministic
        └─────────────┬────────────┘
                      │
       deterministic? ┴── ja → fallback-renderer
                      │ nee
                      ▼
        ┌──────────────────────────┐
        │  provider.complete(...)  │
        └─────────────┬────────────┘
                      │
                      ▼
        ┌──────────────────────────┐
        │  validate output:        │
        │   1. JSON shape          │
        │   2. banned-phrases      │
        │   3. hedged language     │
        │   4. numeric-claim cross │
        └─────────────┬────────────┘
                      │
                ok?   ┴── nee → fallback + audit-note
                      │ ja
                      ▼
                  mode="ai"
                      │
                      ▼
              DomainExplanation
                  + sources
                  + confidence
                  + disclaimer
```

**Faalt nooit hard**: elke uitzondering valt terug op deterministic fallback.

---

## 5. Fallbacks — deterministische renderer per domein

Elk domein heeft een eigen `fallbackX(input)`-functie die DEZELFDE shape produceert als de AI-output. UI ziet geen verschil behalve `mode`.

### Voorbeeld — `fallbackHealth(score)`:
- `summary` = "Health Score 72/100 (B) — Solide spreiding maar hoge sectorconcentratie."
- `positives` = top 3 components met `score ≥ 60`
- `risks` = top 3 components met `score < 50`
- `possibleActions` = `score.topRecommendations` (gededuped)
- `uncertainties` = afgeleid uit `effectiveWeight < 0.8` of `no_data`-components

Toon-conventies:
- **Hedged taal verplicht** ("overweeg", "let op", "mogelijk", "kan duiden") in alle fallbacks.
- **Geen veroordelingen** in behavioral-fallback ("fout"/"verkeerd"). Alleen reflectie.
- **Concrete getallen** in health/confidence/risk-fallbacks (Lynch-laag).

---

## 6. Guardrails

Vier verdedigings-lagen op LLM-output, gespiegeld aan briefing/guardrails (Module 2):

### Laag 1 — JSON-parser
Tolerant aan markdown-fence (`​`​`​`​`json`). Parse-fout → `rejectionReason="json-parse-failed"`.

### Laag 2 — Shape-check
- `summary` + `whyItMatters` non-empty strings
- `positives` / `risks` / `uncertainties` arrays van strings
- `possibleActions` array van `{title, rationale, link?}`-objecten

### Laag 3 — Banned phrases
- "gegarandeerd", "zeker weten", "100% zeker"
- "koersdoel", "prijsdoel"
- "binnen N dagen stijgt/daalt"
- "guaranteed"

### Laag 4 — Required hedged language
Tenminste één van: "overweeg", "let op", "mogelijk", "kan duiden/wijzen/zijn/leiden", "wijst op", "kan".

### Laag 5 — Numeric-claim cross-check
Elk getal/percentage in de output moet **letterlijk** in `JSON.stringify(context)` voorkomen, met tolerantie voor:
- decimal-conventie (1,5 ↔ 1.5)
- percentage → fractie (12.5% ↔ 0.125)

Verzonnen cijfers → `rejectionReason="numeric-claim-rejected"` + lijst gerejecte claims.

Bij elke rejection: fallback + audit-note in `uncertainties[]`.

---

## 7. Source-tracing

Elke `DomainExplanation` bevat een `sources: SourceTrace[]`-array:

```ts
interface SourceTrace {
  source: string;      // "factor-engine", "macro-regime", ...
  fields: string[];    // welke velden uit die bron zijn gelezen
  asOf?: ISODateString;
}
```

UI toont 'em in het ExplanationPanel onderaan — gebruiker kan zien:
- WELKE engines bijdragen aan de uitleg
- WELKE velden uit elke engine zijn gelezen
- DE asOf-datum van de gebruikte data (audit-trail)

`mergeTraces([...])` dedupt op `source` en groepeert velden van dezelfde engine.

---

## 8. Caching

12u TTL in een per-process `TtlCache`, key:
```
ai-explain:{domain}:{fnv1aHash(JSON.stringify(input))}
```

Tweede call met dezelfde input → cache hit, geen LLM-roundtrip. `forceRefresh: true` bypass.

Voor 100 active users die per dag het portfolio-health-detail openen: 1 LLM-call per gebruiker per dag i.p.v. ~10 = ~90% kosten-reductie.

---

## 9. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (helder, eenvoudig, betrouwbaar) | Vaste 6-secties shape — geen marketing, geen jargon. NL-fallbacks gebruiken concrete getallen. |
| **Dalio** (risico's en scenario's) | Risk + Scenario domeinen zijn dedicated. Fallbacks benoemen worst-case + best-case expliciet. |
| **Lynch** (gewone belegger snapt het) | Hedged taal verplicht via guardrails. Reflectievragen in spreektaal NL. |
| **Simons** (geen valse zekerheid) | Numeric-claim cross-check voorkomt verzonnen cijfers. Confidence-score reflecteert AI-mode + base-confidence. |
| **Wood** (AI maakt ervaring superieur) | AI-laag verfijnt de toon; fallback blijft volledig functioneel zonder API-keys. |

---

## 10. Tests — 40 in totaal

| File | Tests | Coverage |
|---|---|---|
| `guardrails.test.ts` | 8 | JSON-parse, shape-check, banned, hedged, numeric-claim |
| `fallbacks.test.ts` | 17 | Per domein: shape, tier-conditionele acties, no-data |
| `service.test.ts` | 15 | Provider succes/fail/throw, alle 6 domain-explainers, explainAll, cache |

---

## 11. UI-integratie

Generieke `ExplanationPanel`-component rendert elk `DomainExplanation`:
- Header: titel + AI/fallback-pill + confidence-pill
- Summary (CardDescription)
- WhyItMatters block
- 2-koloms grid: Positive bullets / Risk bullets
- Actions block met optionele links
- Uncertainties block
- Sources audit-list
- Disclaimer footer

**Reeds gewired** in:
- `/portfolio-health` — `explainHealth(score)` boven de component-breakdown
- `/score/[ticker]` — `explainConfidence(score)` boven de signal-breakdown

**Voor de overige 4 domeinen** (macro, behavioral, risk, scenarios) is de service-API klaar; UI-koppeling is een one-liner per pagina.

---

## 12. Toekomstige uitbreidingen

| Idee | Waarom |
|---|---|
| **Portfolio-wide overview** | One-page dashboard met alle 6 explanations naast elkaar (`explainAll`). |
| **Multi-language** | EN-prompts + EN-fallbacks koppelen aan `locale` in `UserProfile`. |
| **Persistent audit-log** | Bewaar prompt + response + verdict in een Prisma-tabel voor compliance. |
| **Stream-output** | Bij langere LLM-replies een SSE-stream naar de UI voor responsiviteit. |
| **Personalisatie** | Tone aanpassen op `riskTolerance` + `objective` (Conservative → meer hedged). |
| **Cross-domain narrative** | "Je health is B, je macro-regime stagflation, en je grootste positie is een groei-aandeel — overweeg X" — een meta-uitleg over alle domeinen heen. |
