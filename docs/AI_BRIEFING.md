# Daily AI Investment Briefing — Module 2

Een korte, premium dagelijkse memo die voelt als een **persoonlijke analist**, niet als een chatbot. 7 vaste secties, hedged taal, expliciete bronnen + onzekerheid, en een AI-laag die de feitelijke cijfers van de engines niet mag aanpassen.

> **UX-norm**: 5 seconden om de headline + focuspunt te begrijpen, 60 seconden om alle 7 secties te scannen.

---

## 1. Architectuur — twee-paden-design

```
                ┌─────────────────────────┐
                │  buildBriefingContext   │  pure aggregator
                │  (view + snapshots +    │  (geen I/O)
                │   regime + actions)     │
                └─────────────┬───────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │   loadDailyBriefing     │
                │  (12u cache, key=digest)│
                └─────────────┬───────────┘
                              │
                ┌─────────────┴────────────┐
                │                          │
                ▼                          ▼
          AI-provider              Deterministic
          (OpenAI/Anthropic)       fallback renderer
                │                          │
                ▼                          │
         guardrails                        │
         (json-shape, banned-              │
          phrase, numeric-claim,           │
          hedged-language)                 │
                │                          │
        passes? ┴─── reject?               │
        │            │                     │
        ▼            └─────────────────────┤
     mode=ai                               │
                                           ▼
                                       mode=fallback

                  → DailyBriefing
```

Beide paden produceren **dezelfde shape** (`DailyBriefing`); UI ziet alleen verschil aan `mode`.

---

## 2. Bestanden

| Pad | Doel |
|---|---|
| [src/lib/ai/provider/types.ts](../src/lib/ai/provider/types.ts) | `AIProvider`-interface (één `complete()`-call) |
| [src/lib/ai/provider/deterministic.ts](../src/lib/ai/provider/deterministic.ts) | No-LLM provider (returns `text=null`) |
| [src/lib/ai/provider/openai.ts](../src/lib/ai/provider/openai.ts) | OpenAI Chat-Completions gateway |
| [src/lib/ai/provider/anthropic.ts](../src/lib/ai/provider/anthropic.ts) | Anthropic Messages gateway |
| [src/lib/ai/provider/factory.ts](../src/lib/ai/provider/factory.ts) | Env-gestuurde provider-selectie |
| [src/lib/ai/briefing/types.ts](../src/lib/ai/briefing/types.ts) | `BriefingContext`, `DailyBriefing`, sectie-keys |
| [src/lib/ai/briefing/context.ts](../src/lib/ai/briefing/context.ts) | Pure aggregator |
| [src/lib/ai/briefing/prompt.ts](../src/lib/ai/briefing/prompt.ts) | System + user prompt templates |
| [src/lib/ai/briefing/guardrails.ts](../src/lib/ai/briefing/guardrails.ts) | Validators voor LLM-output |
| [src/lib/ai/briefing/deterministic.ts](../src/lib/ai/briefing/deterministic.ts) | Fallback-renderer |
| [src/lib/ai/briefing/cache.ts](../src/lib/ai/briefing/cache.ts) | TTL-cache + context-digest |
| [src/lib/ai/briefing/service.ts](../src/lib/ai/briefing/service.ts) | Hoofd-orchestrator |
| [src/lib/ai/briefing/portfolio-loader.ts](../src/lib/ai/briefing/portfolio-loader.ts) | Server-loader (DB → briefing) |
| [src/components/dashboard/decision-cockpit/briefing-card.tsx](../src/components/dashboard/decision-cockpit/briefing-card.tsx) | Dashboard-widget |
| [src/app/(app)/briefing/page.tsx](../src/app/(app)/briefing/page.tsx) | Detail-pagina |

---

## 3. Configuratie (env)

| Env-var | Doel | Default |
|---|---|---|
| `AI_BRIEFING_PROVIDER` | `anthropic` / `openai` / leeg = auto | leeg → auto |
| `OPENAI_API_KEY` | OpenAI key | — |
| `ANTHROPIC_API_KEY` | Anthropic key | — |
| `AI_BRIEFING_MODEL` | Override default model | `claude-sonnet-4-6` (Anthropic) of `gpt-4o-mini` (OpenAI) |

**Fallback-flow**:
- Geen keys → DeterministicProvider → fallback-renderer.
- Provider faalt of guardrails wijzen output af → fallback-renderer.

Daardoor is dev/CI volledig zonder API-keys lopend.

---

## 4. De 7 secties

| # | Key | Bron | Hedged voorbeeld |
|---|---|---|---|
| 1 | `portfolio_movement` | `PortfolioSnapshot[]` (day/week/month) | "Beweging — dag +1.2%, week +3.4%; let op dat dit een lange-termijnbeeld blijft." |
| 2 | `winners_losers` | `view.valuations` (P&L sinds aankoop) | "Sterkste posities: ASML +42%, MSFT +31% — overweeg of de oorspronkelijke thesis nog klopt." |
| 3 | `risks` | `buildRiskActions` output | "Risk-engine vlagt: Concentratie ASML (elevated) — mogelijk vervolgstap: trim ASML." |
| 4 | `macro` | `MarketRegimeScore` | "Regime is neutraal (55/100, 70% confidence). Overweeg dat een neutraal regime gebalanceerde tilt aanmoedigt." |
| 5 | `earnings_news` | (toekomstig) news-feed | Nu standaard: "Feed niet aangesloten." |
| 6 | `concentration_volatility` | `view.risk` | "Sector Tech 42% — mogelijk verhoogde correlatie." |
| 7 | `focus_action` | `dashboardActions[0]` | "Aandachtspunt vandaag: Trim ASML met 1 aandeel. Engine-confidence 78% (action-engine)." |

---

## 5. Guardrails (anti-hallucinatie)

Vier lagen verdediging op AI-output:

### Laag 1 — JSON-parser
LLM moet exact JSON returnen. Markdown-fences (`​`​`​`​`json … `​`​`​`​`) worden gestript. Parse-fout → reject.

### Laag 2 — shape-check
- `headline` (string, niet leeg)
- `focusAction` (string)
- `sections[]` met valide `key` (één van de 7 canonical keys)
- elk section heeft `body: string`

### Laag 3 — banned phrases
Regexes blokkeren:
- "gegarandeerd", "zeker weten", "100% zeker"
- "koersdoel", "prijsdoel"
- "binnen N dagen stijgt/daalt"
- "guaranteed"

### Laag 4 — required hedged language
Tenminste één van: "overweeg", "let op", "mogelijk", "kan duiden", "wijst op". Zonder hedged-laag → reject.

### Laag 5 — numeric-claim cross-check
Elk getal/percentage in de output moet:
- letterlijk in `JSON.stringify(context)` voorkomen, **of**
- decimal-conventie-equivalent (1,5% ↔ 1.5% ↔ 0.015) bekend zijn.

Verzonnen cijfers → reject met `rejectionReason="numeric-claim-rejected"`.

Bij elke rejection: fallback-renderer + audit-trail in `dataLimitations`.

---

## 6. Caching

**Strategie**: 12u in-memory `TtlCache` per process. Cache-key:
```
ai-briefing:{portfolioId}:{briefingDate}:{contextDigest}
```

`contextDigest` = FNV-1a hash van `JSON.stringify(context, ...)` met decimal-rounding op 4 plaatsen. Mutaties in de context (nieuwe transactie, andere regime) forceren nieuwe briefing; identieke context binnen 12u serveert cache.

**Effect op kosten**: voor een gemiddelde gebruiker die 5× per dag het dashboard opent, betalen we 1× LLM-call. Met 100 actieve users / dag = ~100 LLM-calls/dag i.p.v. ~500. Bij Anthropic Sonnet ≈ €0.003 per briefing → €0.30/dag schaalt fijn.

Multi-instance deployments: cache vervangen door Redis achter dezelfde API werkt zonder service-laag wijzigingen.

---

## 7. Topbelegger-validatie

| Lens | Hoe het zich uit in de briefing |
|---|---|
| **Buffett** | System-prompt instructeert: "noem dagschommelingen, maar verbind aan beleid/structurele factoren". Fallback gebruikt expliciet "lange-termijnbeeld, geen daghandelsignaal". |
| **Dalio** | `macro`-sectie verbindt regime-stance aan portefeuille-tilt — "een DEFENSIVE-regime beïnvloedt de pasvorm van defensieve resp. cyclische posities". |
| **Lynch** | Eenvoudige taal verplicht, geen jargon zonder uitleg. Concrete getallen (`32%`, `€100.000`) in plaats van abstracties. |
| **Veiligheid** | Banned-phrase regex blokkeert "gegarandeerd", "koersdoel", "binnen N dagen stijgt". Required hedged-language dwingt "overweeg/let op/mogelijk" af. Disclaimer onder elke briefing. |

---

## 8. Tests

**50 tests** verspreid over 4 files:

| File | Coverage |
|---|---|
| `provider/factory.test.ts` | 9 tests — env-gating, fallback-cascade, model-override, singleton |
| `briefing/prompt.test.ts` | 6 tests — system-prompt regels, user-prompt JSON-embed, sectie-volgorde |
| `briefing/guardrails.test.ts` | 13 tests — happy path + 8 rejection cases (incl. banned phrase, numeric claim, hedged-language) |
| `briefing/deterministic.test.ts` | 12 tests — alle 7 secties, geen-data paden, threshold-flips |
| `briefing/service.test.ts` | 10 tests — provider succes/falen/throw, cache hit/miss/refresh, confidence-tier |

---

## 9. Wat (nog) niet in scope zit

| Feature | Status | Waarom uitgesteld |
|---|---|---|
| Earnings/news feed | Sectie 5 standaard `dataAvailable=false` | Geen news-data-source aangesloten — module is klaar voor plug-in zodra die er is |
| Streaming output | Geen | `complete()` is single-shot; toevoegen wanneer chat-UI streaming nodig heeft |
| Per-user gewichten | Geen | Briefing is "wat de engines zien"; personalisatie via profile-driven prompt-injection later |
| LLM-rationale audit-log | Sources/limitations wel | Volledige token-log bij aparte audit-tabel — privacy/cost-overweging |
| Multi-portfolio aggregate briefing | Nee | Eerst per portfolio; aggregate is volgende stap |

---

## 10. Toekomstige uitbreidingen

- **News-feed integratie**: voeg een `getRecentNews(tickers)`-bron toe; `earnings_news`-sectie wordt automatisch gevuld omdat de aggregator al placeholder-velden heeft.
- **Personalisatie via profile**: extra system-prompt-sectie met `Profiel: investeerder is INCOME, conservative` zodat de AI de toon kalibreert.
- **Geluidsversie / push**: `DailyBriefing.headline + focusAction` zijn al geschikt voor TTS; een ochtend-mail of push-notification is een dunne wrapper rond de bestaande shape.
- **Per-portfolio aggregate** voor users met meerdere portefeuilles.
- **Audit-tabel** voor compliance: bewaar `prompt + response + guardrail-verdict` per dag voor de laatste 30 dagen.
