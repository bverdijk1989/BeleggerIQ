# Risk Control Tower — Module 29

Eén overzicht met **12 risicocategorieën**, severity-model **green/orange/red/gray** en een **risk-budget**-concept. Pure-function aggregator bovenop bestaande engines. Geen rewrite, geen Prisma-migratie.

> **Buffett-laag**: één scherm, geen 12 losse pagina's.
> **Dalio-laag**: risico expliciet per as.
> **Risicoanalist-laag**: actiepunten zijn aandachtspunten, geen orders ("overweeg", "controleer" — nooit "verkoop X").

---

## 1. Module 29-spec mapping — 12 categorieën

| # | Spec | Bron-engine | Implementatie |
|---|---|---|---|
| 1 | Concentratierisico | risk-engine | `largestPositionWeight + top5Weight + HHI` → avg-score |
| 2 | Sectorrisico | risk-engine | `topSector.weight + sectorHHI` |
| 3 | Regiorisico | risk-engine | `topRegion.weight + regionHHI` |
| 4 | Valutarisico | risk-engine | `foreignCurrencyExposure` |
| 5 | Rentegevoeligheid | macro-regime | `interestRate10y + rateChange1y + yieldCurveSlope` |
| 6 | Macroregimekwetsbaarheid | health + regime | `regimeAlignmentScore` (inverse: hoger = veiliger) |
| 7 | Drawdown-at-risk | risk-engine | `maxDrawdown + valueAtRisk95` |
| 8 | Volatiliteit | risk-engine | `portfolioVolatility` |
| 9 | Liquiditeitsrisico | risk-engine.positions | `illiquidWeight` (≥ 50% coverage vereist) |
| 10 | Datakwaliteit | data-depth (M26) | `dataDepthScore` (inverse) |
| 11 | Crypto/speculatie | portfolio + classification | `max(cryptoWeight, speculativeWeight)` |
| 12 | Behavioral risk | behavioral-coach (M3) | `activeCount + 2× highCount` |

---

## 2. Architectuur

```
src/lib/analytics/risk-control-tower/
├── types.ts          # 12 RiskCategoryKey + RiskSeverityTone (4) +
│                       RiskBudget + RISK_CONTROL_TOWER_DISCLAIMER
├── engine.ts         # pure-function: 12 builders + budget + headline +
│                       severityFromScore + scoreFromThreshold(Inverse)
├── loader.ts         # server-side hydratie uit alle bronnen, faal-safe
├── engine.test.ts    # 24 tests
└── index.ts

src/app/(app)/risk-tower/page.tsx
                      # Top: Risk-budget card met utilization-bar +
                      # 4 count-badges (groen/oranje/rood/grijs)
                      # Body: 12 collapsible category-cards met
                      # severity-badge + suggestie + bron-tag
                      # Footer: verplichte disclaimer
```

**Geen rewrite**. Bestaande `/risico`-pagina blijft staan met scenario-cards en risk-flags. Control Tower is een geconsolideerde laag erbovenop voor het 12-categorieën overzicht.

---

## 3. Severity-model: groen/oranje/rood/grijs

```
score 0–34  → green   (laag risico)
score 35–66 → orange  (verhoogd)
score 67–100 → red    (hoog)
geen data   → gray    ("onbekend", NIET "veilig")
```

**Bewuste keuze**: gray apart van green. Gebruiker moet weten dat een lege categorie ≠ veilig. UI-toon: gray = onopvallend grijs; green = emerald; orange = amber; red = rose.

**Linear scoring**:
```
value ≤ low   → 15  (green)
value ≥ high  → 85  (red)
tussen        → lineair 15 → 85
```

Voor inverse-metrics (data-depth, regime-alignment: hoger = veiliger): spiegelversie.

---

## 4. Risk-budget concept

```
used        = Σ score per categorie (alleen waar score !== null)
maxBudget   = aantal scored × 100
utilization = used / maxBudget

tone:
  < 40% → green   "ruime headroom"
  40-70% → orange  "ruimte beperkt"
  > 70% → red     "krap"
```

**Lynch-laag**: één cijfer ("60% benut") + één-zin-samenvatting. Geen aparte sub-budgets per categorie (overkill voor v1).

---

## 5. Action-suggestions — risicoanalist-laag

Elke categorie heeft een **suggestie**, niet een **order**. Test valideert dat geen enkele suggestie begint met `verkoop` of `koop`:

| Kind | Voorbeeld-suggestie |
|---|---|
| Concentratie red | "Overweeg te trimmen of bewust extra diversifiers toe te voegen." |
| Drawdown red | "Lees /stress-test om vooraf je reactie te bepalen — paniekverkoop in een -30% scenario is duur." |
| Crypto red | "Bekijk /crypto-lab voor position-sizing-advies en stop-loss-overwegingen." |
| Behavioral red | "Open /coach en doorloop de reflectie-vragen voor je nieuwe orders plaatst." |
| Gray | "Geen actie nodig." |

Alle suggesties bevatten verwijzingen naar andere BeleggerIQ-pagina's voor diepere context — geen losstaand advies.

---

## 6. Headline-generator

| Conditie | Headline |
|---|---|
| `counts.red > 0` | "N rode flag(s) — directe aandacht aanbevolen." |
| `counts.orange > 0` | "N aandachtspunt(en) — geen alarm, wel volgen." |
| `counts.gray >= 6` | "Veel categorieën grijs — datakwaliteit beperkt het oordeel." |
| `budget.tone = green` | "Portefeuille toont brede risico-spreiding." |
| else | "Portefeuille is in orde; check de details voor nuances." |

---

## 7. Privacy & security

- **Geen entitlement-gate** — risico-transparantie is core voor elke gebruiker (FREE+)
- **Geen PII in logs** (loader logt alleen errorName + scope)
- **Auth-gate** via `resolveUserFromServer`
- **Faal-safe per bron**: behavioral-fetch faalt → gray; data-depth-fail → gray; geen crash
- **Cache-Control**: niet expliciet — pagina is server-rendered + `force-dynamic`

---

## 8. Topbelegger-validatie

| Lens | Hoe Module 29 hier landt |
|---|---|
| **Buffett (vertrouwen + eenvoud)** | Eén scherm met 12 categorieën — geen verstopte exposure |
| **Dalio (risico expliciet)** | Per-categorie severity + score + drempel; gray ≠ green |
| **Lynch (begrijpelijk)** | Plain-language uitleg per categorie; één-zin headline; bron-tag voor traceability |
| **Simons (meetbaar + reproduceerbaar)** | Pure-function engine, 24 unit-tests, deterministisch, severity-thresholds als `const` |
| **Wood (toekomstgericht)** | `BuildRiskControlTowerInput`-shape is uitbreidbaar; nieuwe categorieën zonder breaking change |
| **Technisch beheerder** | Faal-safe loader; structured logs zonder PII; geen blocking fetches; degradation naar gray |
| **Langetermijnbelegger** | Risk-budget-bar + 4-count-overzicht = snel-leesbaar, geen alarmisme |
| **Hedge fund (datakwaliteit)** | Categorie-10 (data_quality) maakt data-coverage expliciet, niet verstopt onder andere scores |
| **Risicoanalist** | Suggesties zijn aandachtspunten — test blokkeert "verkoop"/"koop"; disclaimer verplicht |
| **Marketeer** | Onderscheidende propositie: "één scherm met alle risico-assen" — sterk voor demo |
| **CEO (reputatierisico)** | Bewust GEEN "wij beheren je risico voor je" — wij meten, gebruiker beslist; Wft-grens gerespecteerd |

---

## 9. Tests — 24 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Shape | 3 | 12 categorieën in vaste volgorde, disclaimer aanwezig, leeg → 12× gray |
| Severity-classifier | 6 | green/orange/red, gray bij missing, inverse-mapping (data-depth, regime), yield-curve-inversion |
| Risk-budget | 3 | alle red → tone=red + util>70%, alle green → tone=green + util<40%, gray bij geen data |
| Headline | 3 | rode flags, brede spreiding, veel gray |
| Risicoanalist-laag | 2 | geen "verkoop X" / "koop Y" in suggesties, explanation altijd niet-leeg |
| Headline-metrics | 4 | concentratie toont ticker+%, volatility %, behavioral signal-count, data quality depth-score |
| Spec-conformance | 2 | severity-tones exact 4, alle categorieën hebben source-attribution |

Totaal: **2575/2575** (212 files).

**Niet in deze pas**:
- E2E test van `/risk-tower` UI (vereist Playwright)
- Loader-test (DB + behavioral + macro afhankelijk; engine-test dekt de logica)

---

## 10. Resterende risico's

| Risk | Mitigatie |
|---|---|
| `gray = onbekend ≠ veilig` kan toch verkeerd geïnterpreteerd worden | Disclaimer expliciet; UI gebruikt zwakke kleur (geen groen); spec-test "leeg → 12× gray" valideert |
| Risk-budget-utilization is intuïtief maar geen statistisch concept | Documented; backlog: per-policy-budget met cap |
| Drempel-tuning is hardcoded — niet per-user-profile | Acceptabel v1; M5 PolicySettings kan in v2 worden geïntegreerd via `thresholdsFromPolicy` |
| Behavioral-fetch vereist user-email + DB-call | Loader is faal-safe — bij timeout → behavioral=gray |
| Liquidity-categorie vereist ≥50% coverage; bij minder → gray | Bewust; voorkomt schijnzekerheid bij dunne data |
| Geen entitlement-gate — alle tiers zien dit | Bewuste keuze: risico-transparantie is core. Geen PRO-pull-feature |
| Action-suggestions verwijzen naar andere pagina's (/coach, /crypto-lab, /stress-test) | Risk: dode links als die pagina's worden hernoemd. Volgens M16 audit zou je ze als typed-route refs willen — backlog |
| Categorieën hebben harde grenzen tussen `green/orange/red` (geen overgangen) | UI-helderheid > continue gradient; backlog: tooltip met "borderline" indicator |

---

## 11. Decision-log

**Vraag**: waarom een nieuwe pagina `/risk-tower` ipv `/risico` uit te breiden?

**Antwoord**:
1. `/risico` is een diepere analyse-pagina (scenarios, top-flags, exposures-detail, monthly buy quantity-card)
2. Control Tower is een **geconsolideerd overzicht** — andere mental model, andere doelgroep
3. Beide kunnen naast elkaar bestaan; navigatie linkt ze later

**Vraag**: waarom gray ≠ green?

**Antwoord**:
- Bij green claimen we expliciet "laag risico"
- Bij gray weten we het simpelweg niet — niet hetzelfde
- Cruciaal voor risicoanalist-laag en CEO-laag (reputatierisico): nooit verzonnen zekerheid

**Vraag**: waarom geen "stoplicht-balk" tussen categorieën?

**Antwoord**: huidige UI heeft per-categorie collapsible-cards met severity-badge. Stoplicht-balk gaf te veel ruis bij grijze cellen. UI-tests + designer-feedback kan dit in v2 herbalanceren.
