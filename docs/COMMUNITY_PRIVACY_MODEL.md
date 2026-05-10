# Community Intelligence — Privacy Model — Module 13

Privacy-first cohort-vergelijking. De gebruiker ziet "ben ik anders dan typisch?" zonder dat zijn portefeuille ergens herleidbaar wordt opgeslagen.

> **Kern-belofte**: geen tickers, namen of bedragen verlaten je portefeuille. Vergelijking gebeurt anoniem op cohort-niveau (leeftijd × risicoprofiel × portfoliogrootte) met k-anonimiteit. Default-deny: ontbrekende opt-in = geen contributie, punt.

---

## 1. Wat we delen — en wat NIET

### Wat NOOIT gedeeld wordt
- Tickers (geen "AAPL", "ASML", ...)
- Holding-namen
- Exacte gewichten of bedragen
- Account-balansen
- Transactie-historie
- Persoonlijke identifiers (e-mail, naam, IP)

### Wat optioneel WEL gedeeld kan worden (per scope opt-in)
| Scope | Wat de payload bevat | Wat de payload NIET bevat |
|---|---|---|
| `PORTFOLIO_ALLOCATION` | equity/bonds/cash/alt percentages, afgerond op 1% | tickers, individuele gewichten |
| `RISK_PROFILE` | beta afgerond op 0.1, vol-bucket (low/med/high), div-bucket | exacte vol, exacte HHI |
| `DIVIDEND_STRATEGY` | yield-bracket (`0-1%` / `1-2%` / `2-4%` / `4%+`), payout-concentration-bucket | exacte yield, dividenddata per positie |
| `SECTOR_BENCHMARK` | top-3 sector-buckets (sorted, geen gewichten) | sector-namen, gewichten, ticker-data |
| `PERFORMANCE_BENCHMARK` | YTD-bracket (`<-10%`, `-10..0%`, `0..+10%`, `+10..+25%`, `+25%+`) | exact rendement, periode-segmentatie |

**Bewuste keuze**: wat overblijft is statistische schaduw, geen portefeuille. Een outsider die deze payload zou onderscheppen zou onmogelijk een individu kunnen identificeren — alle waardes vallen in buckets die door duizenden andere gebruikers gedeeld kunnen worden.

---

## 2. Cohort-model

Een cohort is de combinatie `age × risk × size`:

| Dimensie | Buckets |
|---|---|
| Leeftijd | `<30`, `30-45`, `45-60`, `60+` |
| Risicoprofiel | `conservative`, `balanced`, `growth`, `aggressive` |
| Portfolio-grootte | `<10k`, `10-50k`, `50-200k`, `200k+` |

**Totaal**: 4 × 4 × 4 = **64 cohorts**. Niet meer fijn dan dit, want hoe groter een bucket, hoe makkelijker we **k-anonimiteit** halen.

Cohort-key formaat: `{age}|{risk}|{size}` — bv. `30-45|balanced|10-50k`. Deterministisch en compact.

---

## 3. K-anonimiteit

**Drempel**: `K_ANONYMITY_THRESHOLD = 25`. Pas wanneer een cohort minstens 25 opt-in-bijdragers heeft, tonen we de cohort-aggregate als referentie. Anders vallen we terug op de **synthetische baseline**.

```ts
function pickAggregate(candidate, cohort) {
  if (candidate?.source === "real" && candidate.sampleSize >= 25) return candidate;
  return buildSyntheticBaseline(cohort);
}
```

Dit is een hard guarantee — geen feature-flag, geen override. Als een cohort niet K bereikt, KAN er geen real-aggregate worden geserveerd, ook niet per ongeluk.

### Waarom K=25?
- Klein genoeg om snel real-data te activeren in populaire cohorts (`30-45 × balanced × 10-50k`)
- Groot genoeg om identificatie via "je bent de enige conservatieve 60+'er met €200k+" onmogelijk te maken
- Statistisch zinvol: percentielen op n<25 zijn te ruisig om als referentie te gebruiken

---

## 4. Synthetische baseline (industry-standard)

Tot een cohort K bereikt, vergelijken we tegen `buildSyntheticBaseline(cohort)`. Deze waardes zijn:

- Geijkt op publieke beleggersliteratuur (typische Nederlandse retail-beleggersprofielen)
- **Expliciet gelabeld** als `source: "synthetic-baseline"` in elke `BenchmarkComparison`
- Statisch (computedAt = epoch); geen bewegende data
- Risk-bucket-gevoelig: conservative-cohort heeft lagere equity-mediaan dan aggressive

UI-toont een amber `Synthetische baseline` badge zodat de gebruiker weet dat dit nog geen real-cohort-data is.

---

## 5. Consent-mechanisme

### Storage
Per scope opt-in/-out wordt opgeslagen in `UserProfile.preferences.community` (JSON-blob, zelfde patroon als `alerts` en `notifications`):

```json
{
  "community": {
    "scopes": ["PORTFOLIO_ALLOCATION", "RISK_PROFILE"],
    "updatedAt": "2026-05-10T12:34:56.789Z",
    "consentTextVersion": 1
  }
}
```

### Default-deny
- Lege blob = geen consent op enige scope
- Onbekende scope-strings worden gedropt (tolerant parser)
- Duplicates worden gededuped
- Consent-flow is de **enige** plek waar `community` mag worden geupdate (zie `actions.ts`)

### Versie-tracking
`consentTextVersion` stamps de versie van de privacy-tekst die de gebruiker accepteerde. Wanneer we de tekst wijzigen, kunnen we re-consent-prompts tonen voor users met een oudere versie.

### Intrekken
`revokeCommunityConsentAction()` zet alle scopes uit. Toekomstige aggregator-runs negeren deze user dan automatisch — ze hebben geen contributie meer in de pipeline.

---

## 6. Architectuur

```
src/lib/community/
├── types.ts        # ConsentScope, Cohort, CommunityAggregate, BenchmarkComparison
├── consent.ts      # parse + buildConsent + hasConsent + isContributing
├── cohort.ts       # ageToBucket / sizeToBucket / riskProfileToBucket / buildCohort
├── anonymizer.ts   # buildContributorPayload — bucketing per scope
├── baselines.ts    # buildSyntheticBaseline + listAllCohorts (64 cohorts)
├── benchmark.ts    # buildCommunityBenchmark — compare + per-scope verdict
├── loader.ts       # loadCommunityBenchmark — server-only, leest UserProfile + portfolio
├── actions.ts      # updateCommunityConsentAction + revokeCommunityConsentAction
├── engine.test.ts  # 31 tests (cohort/consent/anonymizer/baseline/benchmark/privacy)
└── index.ts        # public API

src/components/community/
├── consent-card.tsx     # Per-scope opt-in checkboxes + save/revoke
└── benchmark-card.tsx   # Per-scope vergelijking + percentile-bar + source-badge

src/app/(app)/community/
└── page.tsx        # PRO-gated detail-page
```

---

## 7. Anonymizer-laag (`buildContributorPayload`)

Pure functie, deterministisch. Schiet alle scopes weg waar de gebruiker geen opt-in heeft.

| Scope | Bucket-strategie |
|---|---|
| `PORTFOLIO_ALLOCATION` | aggregate `allocationByAssetClass` → equity/bonds/cash/alt fractions, `round(× 100) / 100` |
| `RISK_PROFILE` | beta `round(× 10) / 10`; vol-cutoffs 0.10/0.20; HHI-cutoffs 0.10/0.20 |
| `DIVIDEND_STRATEGY` | yield → 4 brackets; top-3 weight → low/med/high cutoffs 0.25/0.45 |
| `SECTOR_BENCHMARK` | sector-classifier → bucket; top-3 sorted by weight; only the bucket-name leaks |
| `PERFORMANCE_BENCHMARK` | YTD → 5 brackets |

Als consent voor scope X ontbreekt, wordt `payload.scopes[X]` simpelweg niet gezet — geen lege placeholder, geen optionele defaults.

---

## 8. Benchmark-engine — verdicts

Per scope produceert de engine een `BenchmarkComparison` met:
- `tone`: `positive` / `neutral` / `attention`
- `verdict`: één-zin spreektaal-uitleg (Lynch-laag)
- `percentile`: 0-100 positie binnen cohort (where-am-I)
- `details`: 1-3 detail-bullets met concrete metrics
- `source` + `sampleSize`: transparantie wat de aggregate-bron is

**Buffett-laag**: geen cherry-picked uitschieters. Drempels zijn historisch geijkt; verdict-tekst gebruikt hedged taal ("ligt in lijn met", "wijkt licht af van", "fors meer dan").

**Dalio-laag**: `attentionPoint` = de scope met de scherpste afwijking — getoond als coachende kop bovenaan zodat de gebruiker weet wáár de grootste mismatch zit.

---

## 9. Wat NIET in v1

Bewust uitgesteld:
- **Real-time aggregator** — er is nog geen opt-in-traffic; aggregator-job komt wanneer kritische massa in zicht is
- **`CommunityContribution` DB-tabel** — payloads worden nu niet gepersisteerd; v2 voegt een history-tabel toe met TTL en deduplication
- **Multi-portfolio cohort-aggregaten** — alleen primary portfolio
- **Public profielen** — er is GEEN flow om individuele portefeuilles publiek te maken; ook niet in scope voor v2
- **Sociale features** (volgen, kopiëren, ranglijsten) — ook niet in scope, dat zou de Buffett-laag schenden
- **Opt-out van aggregaten** — wanneer een user revoke't tijdens een scheidsrechter-window kan z'n laatste contributie nog kort in een aggregate-snapshot zitten; v2 voegt een rolling-90d-window-purge toe

---

## 10. Topbelegger-validatie

| Lens | Hoe Module 13 hier landt |
|---|---|
| **Buffett** | Geen hype-casino — geen feed van wat anderen kopen; alleen sober vergelijken op risico/spreiding |
| **Dalio** | Vergelijking centraal op risicoprofiel + spreiding (HHI-bucket, beta, vol-bucket). Performance pas in 5e plaats |
| **Lynch** | Eén-zin verdict per kaart, spreektaal NL ("je hebt fors meer equity dan typisch") |
| **Simons** | k-anonimiteit als const, deterministische bucketing, 31 tests, expliciete `source`-label per aggregate |
| **Wood** | Opt-in datadeling = netwerk-effect: meer opt-ins → cohort bereikt K → synthetic-baseline wordt vervangen door real-aggregate, automatisch en zonder privacy-leak |

---

## 11. Privacy-invarianten (test-getoetst)

```ts
it("payload bevat NOOIT tickers of namen", () => {
  const json = JSON.stringify(payload);
  expect(json).not.toContain("ASML");
  expect(json).not.toContain("Holding");
  expect(json).not.toContain("100000"); // exacte bedrag mag niet lekken
});

it("k-anonimiteit-drempel is minimaal 25", () => {
  expect(K_ANONYMITY_THRESHOLD).toBeGreaterThanOrEqual(25);
});

it("real-aggregate met sample 0 → silently downgraded naar baseline", () => {
  const fakeReal = { ...baseline, source: "real", sampleSize: 0 };
  const report = buildCommunityBenchmark({ payload, cohortAggregate: fakeReal });
  expect(report.comparisons[0].source).toBe("synthetic-baseline");
});
```

Deze invarianten zijn **load-bearing**: als een toekomstige refactor er per ongeluk doorheen breekt, faalt CI.

---

## 12. Toegang & flow

1. Niet-PRO gebruiker → `PaywallCard` (PRO+ feature: `community.benchmark`)
2. PRO+ gebruiker zonder opt-in → ziet alleen consent-flow + privacy-banner
3. PRO+ gebruiker met 1+ scope opt-in → ziet benchmark + privacy-banner + consent-flow (voor toekomstige updates)
4. Geen portefeuille → EmptyState

Alleen scopes waar opt-in op is gegeven, leveren een vergelijking. Als consent later wordt ingetrokken voor een scope, verdwijnt die scope uit het rapport — geen "we hebben de data al gezien"-trick.
