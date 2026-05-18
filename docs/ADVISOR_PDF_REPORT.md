# Advisor PDF Report — MVP — Module 23

Eén-document portefeuillecheck voor advisors en gevorderde beleggers. Pure-function builder bovenop bestaande engines + print-friendly HTML-renderer (browser → PDF). **Geen externe PDF-deps in v1** — bewuste keuze om de bundle klein te houden en het migratie-pad naar v2 (Puppeteer/pdfmake) niet te blokkeren.

> **Buffett-laag**: aandachtspunten, geen orders. Disclaimer-blok bovenaan. Geen "verkoop X / koop Y"-zinnen — tests blokkeren dat.

---

## 1. Module 23-spec mapping — 10 secties

| # | Spec | Implementatie | Bron-engine |
|---|---|---|---|
| 1 | Titelpagina | `ReportTitleSection` (brand, cliënt-label, datum, advisor-notitie) | white-label config |
| 2 | Disclaimer | `disclaimers[]` — auto-geselecteerd op jurisdictie via `selectDisclaimers` | `src/lib/enterprise/disclaimers.ts` |
| 3 | Portfolio Health Score | `ReportHealthSection` (score, grade, 4-5 componenten, top-3 signalen) | `view.health` |
| 4 | Grootste risico's | `ReportRisksSection` (top-5 flags + kerngegevens) | `view.risk` |
| 5 | Spreiding/allocatie | `ReportAllocationSection` (4 categorieën: asset/sector/regio/valuta + cash-weight) | `view.summary.allocationBy*` |
| 6 | Doelvoortgang | `ReportGoalsSection` (totaal/haalbaar + per-goal rij) | `wealth.goals` (Module 21) |
| 7 | Scenario/stress-test | `ReportScenariosSection` (9 scenarios + worst/best) | `stress.results` (Module 11) |
| 8 | Behavioral aandachtspunten | `ReportBehavioralSection` (top-5 op severity) | `behavioral.report` (Module 3) |
| 9 | Datakwaliteit/coverage | `ReportDataQualitySection` (price/factor/fundamentals counts + warnings) | view.factorScores + getFundamentals |
| 10 | Actiepunten in gewone taal | `ReportActionItemsSection` (max-5 op 5-bron-policy) | aggregator |

---

## 2. Architectuur

```
src/lib/reports/advisor-pdf/
├── types.ts              # AdvisorReportData + 10 sub-section-types
├── builder.ts            # Pure functie: portfolio-view + sub-reports → data
├── html.ts               # Pure functie: data → print-friendly HTML-string
├── loader.ts             # Server-side faal-safe data-collection
├── builder.test.ts       # 16 tests
└── index.ts              # Public API

src/app/api/advisor/report/route.ts
                          # GET /api/advisor/report?download=0|1
                          # Entitlement: report.advisor_pdf (Elite+Advisor)

src/app/(app)/advisor/report/page.tsx
                          # UI met preview + Open/Download knoppen

src/lib/entitlements/
├── catalog.ts            # +1 entry: report.advisor_pdf (ELITE_AND_UP)
└── types.ts              # +1 feature-key
```

**Geen Prisma-migratie**. Hergebruikt:
- `src/lib/enterprise` voor disclaimer-catalog + white-label-config + `buildReportSpec`
- `buildPortfolioView` voor health + risk + allocation
- `loadWealthDashboard` voor goals + course
- `loadStressTestReport` voor 9 scenarios
- `loadBehavioralCoach` voor gedragspatronen
- `getFundamentals` voor coverage-meting

---

## 3. Pijplijn

```
loader.loadAdvisorReport(userEmail, advisorNote?)
        │
        ├─→ portfolioRepository.findPrimaryByEmail
        ├─→ buildPortfolioView(includeFundamentals + includeFactorScores)
        ├─→ loadWealthDashboard           ├─ try/catch → null = sectie weg
        ├─→ loadStressTestReport          ├─ try/catch → scenarios=null
        ├─→ loadBehavioralCoach           ├─ try/catch → leeg report
        └─→ getFundamentals per ticker    └─ ignore per-ticker fail
                            │
                            ▼
              builder.buildAdvisorReportData (pure)
                            │
                            ▼
              html.renderAdvisorReportHtml (pure)
                            │
                            ▼
                    Content-Type: text/html
                    Content-Disposition: inline | attachment
```

**Faal-safe per sub-engine**: een crash in bv. behavioral-coach (geen history) maakt het rapport niet leeg — die ene sectie toont alleen "Geen actieve patronen".

---

## 4. Renderer-keuze: HTML met `@page` + browser-print

**Spec eist** fallback "HTML print-friendly report" wanneer PDF-lib niet beschikbaar is. In v1 is HTML de **primaire renderer**. Redenen:

| Optie | Pro | Con |
|---|---|---|
| **HTML + browser-print (v1)** | 0 deps, A4 + `@page` werkt, Ctrl+P → PDF | Geen automatisering, vereist user-actie |
| **pdfmake (server-side JS)** | Native PDF, automatiseerbaar | +500kb bundle, font-handling gedoe |
| **Puppeteer-headless** | Pixel-perfect, hergebruikt CSS | Native chromium-dep (~150MB), prod-overhead |

**Migratie-pad**: `AdvisorReportData` is renderer-agnostiek. v2 voegt `renderAdvisorReportPdf(data)` toe (Puppeteer of pdfmake) zonder breaking change in builder of route. De HTML-route blijft bestaan voor preview + low-latency.

---

## 5. Action-items aggregator — 5-bron-policy

Max **5** items, één per bron-engine, in vaste volgorde:

| Prio | Bron | Trigger |
|---|---|---|
| 1 | `health` | Eerste `signals[]` met `severity: "critical"` |
| 2 | `risk` | Top-1 risk-flag op severity (alleen `critical` of `high`) |
| 3 | `behavioral` | Top-1 behavioral signal op severity (alleen `elevated`+) |
| 4 | `scenarios` | Worst-case scenario met `impactPct < -10%` |
| 5 | `goals` | Eerste `feasibilityTier ∈ {AT_RISK, UNLIKELY}` |

Per item: `priority`, `title`, `rationale`, `source`. Brontag in UI voor traceability (Simons-laag).

**Toon-conventie** (getest): geen `verkoop X` / `koop Y` — alleen "overweeg", "bekijk", "controleer", "voorbereid op".

---

## 6. Security & privacy

| Risico | Mitigatie |
|---|---|
| XSS via white-label `brandName` of advisor-notitie | Alle data-strings door `esc()` (HTML-entity-escape). Test: `<script>` blijft als tekst. |
| CSS-injection via white-label `primaryColor` | `sanitizeColor()` — strikte hex-validator. Test: `red;}body{display:none` valt door, fallback naar default green. |
| Raw e-mail in rapport-titel | Loader mask't `userEmail` → `b***@example.com` wanneer caller geen `clientLabel` meegeeft. |
| PII in server-logs | `route.ts` logt alleen counts + tier + status (geen e-mail, geen ticker-namen, geen bedragen). |
| Onbevoegde toegang | Entitlement-gate `report.advisor_pdf` (ELITE+ADVISOR); auth-check eerst. |
| Cache-leak naar CDN | `Cache-Control: private, no-store` + `X-Content-Type-Options: nosniff` |

---

## 7. Entitlements

| Feature | Tier | Wat krijgt de gebruiker |
|---|---|---|
| `report.advisor_pdf` | ELITE_AND_UP | Advisor PDF-rapport (10 secties) |

**Bewuste keuze**: niet alleen ADVISOR-tier (zoals `advisor.export_reports` voor white-label), ook ELITE — vermogensbeleggers die zichzelf een client-ready overzicht willen sturen. Spec stond expliciet "Advisor/Elite of configureerbaar".

FREE/PRO zien een PaywallCard op `/advisor/report` met conversie-copy ("client-ready, 10 secties, browser-naar-PDF").

---

## 8. Topbelegger-validatie

| Lens | Hoe Module 23 hier landt |
|---|---|
| **Buffett (vertrouwen + eenvoud)** | Disclaimer-blok eerst; actiepunten in gewone taal; geen valse zekerheid in scenarios (uncertainty-warning) |
| **Dalio (risico + scenarios)** | Worst-case prominent in scenario-sectie; risk-flags op severity gesorteerd; FX-exposure expliciet |
| **Lynch (begrijpelijk)** | Section-titels in NL spreektaal; per-actie 1-zin rationale; "—" voor ontbrekende metrics i.p.v. fake-data |
| **Simons (meetbaar + reproduceerbaar)** | Pure-functie builder + 16 tests; data-only `AdvisorReportData`-shape; schema-versie 1 |
| **Wood (AI-native, toekomstgericht)** | Renderer-agnostiek — v2 kan Puppeteer/pdfmake plug-in zonder breaking change; data-only shape kan ook door AI-explain-layer worden geconsumeerd |
| **Technisch beheerder** | Faal-safe loaders (try/catch per sub-engine); structured logs zonder PII; entitlement-gated; no-store cache |
| **Langetermijnbelegger** | Rust: focus op aandachtspunten, niet op orders; goal-sectie toont voortgang en haalbaarheid |
| **Hedge fund (data + signals)** | Datakwaliteit-sectie expliciet: positions-with-price/factor/fundamentals counts + sector/asset-class warnings |
| **Risicoanalist** | Top-5 risk-flags + drempel-metrics; behavioral-section voor systematische gedragspatronen; warnings-blok bij data-issues |
| **Marketeer** | Sterke conversie-aanker voor Elite-upgrade; concrete preview ("10 secties, browser-naar-PDF") op `/advisor/report` |
| **CEO (B2B-omzet)** | Direct verkoopbaar als Advisor-feature; white-label-ready (brand-name + logo + footer); migratie-pad naar v2 Puppeteer voor verzendbare PDF zonder breaking change |

---

## 9. Tests — 16 in totaal

| Categorie | Tests | Coverage |
|---|---|---|
| Sectie-shape | 9 | 10 secties aanwezig, title bevat geen raw e-mail, health-mapping, risk-cap-op-5, allocation-cash-weight, dataQuality-warnings, action-items (lege/critical/cap), disclaimers ≥1 |
| HTML-rendering | 4 | DOCTYPE + sectie-headers, XSS-escape, white-label-branding, primaryColor-sanitization |
| Spec-conformance | 3 | 10 section-IDs, disclaimer-tekst aanwezig, geen koop/verkoop-orders in actiepunten |

**Niet in deze pas**:
- E2E-test van `/advisor/report` UI (vereist Playwright)
- Loader-tests (DB + market-data afhankelijk; engine-tests dekken de logica)
- PDF-render-test (v2 work)

---

## 10. Resterende risico's

| Risk | Mitigatie |
|---|---|
| HTML-renderer vereist user-actie (Ctrl+P) voor PDF — geen automatische PDF-mail | v2: Puppeteer-headless route met `Content-Type: application/pdf`; backlog |
| White-label-config staat in `DEFAULT_WHITE_LABEL` — geen per-user override-UI in v1 | Acceptabel — Module 14 voorbereiding is data-shape compleet; UI-flow zelf komt met eerste pilot-advisor |
| Fundamentals-coverage telt per-ticker → N×getFundamentals-calls | Acceptabel — `getFundamentals` heeft caching; voor groot portfolio (>50 posities) komt rate-limit-policy in beeld; backlog: bulk-fundamentals-fetch |
| Geen e-mail-export — alleen download/browser-open | Bewust: SMTP-flow + cliënt-attachment-UX is een eigen sprint |
| Disclaimer-set is jurisdictie-default zonder org-context | Module 14 ondersteunt al `organization.jurisdiction` voor selectie; loader gebruikt het niet (v1 = privé-context). Backlog: org-aware loader-variant |
| Schema-versie hardcoded op `1` | Bewust — bumpen bij breaking change in `AdvisorReportData`-shape; audit-trail blijft reconstrueerbaar |
| Geen audit-event geschreven bij rapport-generatie | Backlog: hook `recordAdvisorAudit` aan route (org-context vereist v2) |
| Stap "Open rapport" opent als `inline` — sommige browsers kunnen dat blokkeren | Acceptabel — fallback `?download=1` is altijd beschikbaar; UI biedt beide opties expliciet |

---

## 11. Decision-log

**Vraag**: waarom geen pdfmake/Puppeteer in v1?

**Antwoord**:
1. Bundle-grootte: pdfmake voegt ~500kb toe; Puppeteer ~150MB native-chromium. Voor MVP overkill
2. Print-CSS via `@page A4 + @media print` levert client-ready output zonder native deps
3. Data-shape is renderer-agnostiek → v2 plug-in zonder breaking change
4. Spec eiste expliciet "fallback HTML print-friendly report" — die maken we de primary

**Vraag**: waarom `report.advisor_pdf` als nieuwe feature-key i.p.v. `advisor.export_reports` (bestaand)?

**Antwoord**:
1. `advisor.export_reports` = white-label-branded export, alleen ADVISOR-tier (Module 14)
2. Module 23 MVP = breder verkoopbaar (Elite + Advisor); andere prijspunt
3. Nieuwe key houdt downgrade-paden voorspelbaar (verbod op "automatic tier-stapeling")
4. Marketingruimte: "Advisor PDF-rapport" als Elite-upsell + apart "white-label PDF" als Advisor-upsell
