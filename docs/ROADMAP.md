# BeleggerIQ 2.0 — Feature roadmap

> Laatste update: 2026-04-24. Prioriteiten zijn indicatief, niet contractueel. Kleiner = eerder.

Drie categorieën:

- **🔴 Engineering-schuld** — dingen die al werken maar zonder fix risico blijven (auth shortcut, geen backups, ...).
- **🟡 Feature-gap** — functionaliteit die de tool écht bruikbaarder maakt voor real-world gebruik.
- **🟢 Nice-to-have** — speculatief, alleen oppakken als core stabiel draait en er duidelijke vraag is.

Binnen elke categorie: **top = eerst**.

---

## 🔴 Engineering-schuld (eerst aanpakken)

### 1. Echte login-flow
**Waarom**: nu staat `BIQ_ALLOW_DEMO_AUTH=true` aan. Iedereen met de URL ziet de demo-user. De auth-resolver ondersteunt al signed cookies (`biq_session`), maar er is geen UI om die uit te geven.

**Aanpak**:
- Magic-link via e-mail (simpelste, geen OAuth provider nodig)
- `/login`-pagina met email-input → server action → mail met link
- Clicking link → signed cookie zetten → redirect naar `/dashboard`
- Rate-limit op magic-link requests (2/min per IP)
- `BIQ_ALLOW_DEMO_AUTH=false` in productie, opt-in per omgeving

**Effort**: ~1 dag. SMTP-setup (bv. Resend, Postmark, of direct via Hetzner mail) is het grootste onbekende.

**Gerelateerd**: multi-user support — nu is alles demo-user. Na login-flow kan elke user z'n eigen portfolio hebben.

---

### 2. Prisma migrations (echt)
**Waarom**: nu `db push` — schema-sync zonder history. Eerstvolgende schema-wijziging kan data breken.

**Aanpak**:
- Genereer initial migration: `npx prisma migrate dev --name init --create-only`
- Tegen lokale Postgres of via SSH-tunnel naar productie
- Commit `prisma/migrations/`
- Deploy-script draait al `prisma migrate deploy` — wordt nu functioneel

**Effort**: 30 min. Gelegenheid om meteen missende indexen toe te voegen (bv. op `Holding.isin`, `PortfolioSnapshot.capturedAt`).

---

### 3. Automatische backups
**Waarom**: één Hetzner VPS = één point of failure. Nu geen pg_dump, geen offsite backup. Als de server omvalt ben je alles kwijt.

**Aanpak**:
- Daily cron: `pg_dump | gzip | encrypt | upload` naar S3-compatible (bv. Hetzner Object Storage, Backblaze B2)
- 7 dagen retentie dagelijks, 4 weken wekelijks, 12 maanden maandelijks
- Weekly restore-test (download laatste backup naar `/tmp`, `pg_restore --dry-run`)
- Monitoring: als backup ouder dan 30u, alert

**Effort**: ~2 uur. Script in `deploy/backup.sh`, systemd timer ernaast.

---

### 4. CI/CD
**Waarom**: nu handmatig `./deploy.sh`. Bij elke kleine PR een SSH-sessie is niet schaalbaar. Risico: iets merged in main dat niet deploybaar is.

**Aanpak**:
- GitHub Actions workflow:
  1. Checkout + npm ci + npm test + tsc --noEmit
  2. Bij push naar main: SSH naar Hetzner, triggert `./deploy.sh` als beleggeriq-user
  3. Post-deploy smoke-test: `curl https://<url>/api/health` → moet 200 zijn (health endpoint nog bouwen)
- Secret management: SSH-key als GitHub secret, repo-deploy-key op server
- Rollback-button: workflow dat laatste deploy terugdraait

**Effort**: ~3 uur inclusief health-endpoint en smoke-test.

---

### 5. Observability
**Waarom**: structured logger staat er, maar geen emitter naar een backend. Bij productie-issues moet je via `journalctl` grepen — onvindbaar voor trends.

**Aanpak** (fases):
1. **Kort**: ship logs naar een Loki-instance of gewoon `rsync` naar een tweede server. Alerting via `promtail` + `alertmanager`.
2. **Middel**: Sentry voor unhandled errors (één JS SDK + DSN in env, klaar).
3. **Lang**: Prometheus metrics-endpoint (`/metrics`), dashboards in Grafana voor:
   - Cache hit-rate per namespace
   - Provider latency (p50/p95/p99)
   - Symbol-resolver miss-rate
   - API request volume + error rate

**Effort**: fase 1 = ~2 uur, fase 2 = ~1 uur, fase 3 = ~1 dag.

---

### 6. Rate limiting op API routes
**Waarom**: nu geen limieten. Een kwaadwillende kan `/api/snapshots/factors` duizend keer triggeren en de Yahoo-API quota opmaken, of een DoS op `/api/chat` doen.

**Aanpak**: simpel middleware-pattern in `src/middleware.ts`. In-memory bucket per IP (token-bucket, 10 req/min, burst 20). Voor multi-instance later naar Redis.

**Effort**: ~2 uur.

---

### 7. Decimal → Number precision guard
**Waarom**: Prisma Decimal velden worden nu via `Number(...)` naar JS number gecast. Voor portefeuilles > 2^53 EUR (onrealistisch) verliest dit precisie. Relevanter: accumulatie-bugs in backtest met veel trades.

**Aanpak**: audit alle `Number(row.xxx)` in repositories. Vervang door `toFiniteNumber` helper die ook een `precision guard` check doet. Log warning bij verlies.

**Effort**: ~3 uur voor full audit + fixes.

---

## 🟡 Feature-gap (hoge waarde)

### 8. ETF-specifieke factor scoring
**Waarom**: ~30% van typische portefeuilles zijn ETFs (VWCE, IWDA, VUAA, etc.). Nu krijgen ze allemaal factor-scores 50 en actie `WATCH` omdat Yahoo geen company-fundamentals heeft voor fondsen. Dat is *correct* (geen ROIC voor een index), maar niet *behulpzaam*.

**Aanpak**: aparte ETF-scoring met andere factors:
- **Cost** (TER / expense ratio, lager = beter)
- **Scale** (AUM, groter = beter voor liquiditeit)
- **Track record** (age + tracking error, hoger = beter)
- **Distribution** (accumulating vs distributing — match met user objective)
- **Exposure fit** (hoe goed dekt deze ETF de gewenste regio/sector/factor)

Provider-kant: Yahoo's `quoteSummary` levert `fundProfile` module met TER + size. Plus `fundPerformance`.

**Effort**: ~2-3 dagen. Design + engine + UI-aanpassing (factor-legend moet context-aware zijn per assetClass).

---

### 9. Transaction-log
**Waarom**: BeleggerIQ ziet nu alleen de *huidige* staat van je portefeuille (uit DEGIRO-CSV). Geen historie van transacties, dividenden, kosten. Betekent:
- Realized PnL is onbekend
- Dividend-yield is schatting, geen werkelijkheid
- Kosten-analyse onmogelijk
- Belastingaangifte (box 3 fallback-waardering) niet te ondersteunen

**Aanpak**:
- Nieuw Prisma model `Transaction { id, portfolioId, ticker, type, quantity, price, fee, executedAt, metadata }`
- DEGIRO transactie-export parser (andere CSV dan portefeuille-export)
- UI: `/transacties` met filters + gegroepeerde jaaroverzichten
- Cost basis berekening: FIFO-methode default, optioneel LIFO
- Dividend-tracker met bronbelasting-kolom

**Effort**: ~4-5 dagen. Parser is het grootste werk want DEGIRO heeft ~15 transactie-types (Buy, Sell, Dividend, Tax Reclaim, Cash Adjustment, etc.).

---

### 10. NL box 3 + buitenlandse bronbelasting
**Waarom**: BeleggerIQ is NL-specifiek, maar de tool helpt nu niet met de werkelijke NL-belasting pain. Elke belegger moet:
- Peildatum-waarde (1 januari) bepalen
- Forfaitaire rendement berekenen
- Buitenlandse bronbelasting op dividenden terugvorderen (US tot 15%, FR tot 15% verdragstarief)

**Aanpak**:
- Snapshot op 1 januari automatisch (bestaande snapshot-infra)
- `/belasting` pagina: per jaar de box 3-cijfers + exportbaar naar M-formulier
- Dividend-tracker uit #9 + tarieven-tabel per bronland
- Per-positie indicator: "is FBI, geen bronbelasting" vs "is US-REIT, 15% tarief"

**Effort**: ~3 dagen na #9. Rates zijn publiek; de berekening is stabiel.

**Waarde**: groot voor Nederlandse users. Dit zou een kern-differentiator zijn versus generic tools zoals Beleggersdata.

---

### 11. Data-provider redundantie + fallback
**Waarom**: Yahoo Finance is unofficial. `yahoo-finance2` v2 → v3 breekte al in onze deploy. Bij een outage of lib-bug is de hele app blind.

**Aanpak**:
- Tweede provider implementatie: Alpha Vantage (25 calls/dag gratis), Finnhub (60 req/min gratis), of IEX Cloud.
- Fallback-chain in `providers/index.ts`: probeer primary, bij throw na retries → secondary.
- Provider-health in `/status` endpoint (nieuw).

**Effort**: ~1 dag per secondary provider. Key management via `.env`.

---

### 12. Notificaties + weekly digest
**Waarom**: users kijken BeleggerIQ niet dagelijks. Belangrijke events (positie boven cap, risico-flag nieuw, regime switch) gaan gemist.

**Aanpak**:
- E-mail via dezelfde SMTP als #1
- Event-triggers in de engines (reeds aanwezig: risk flags, rebalance actions)
- Weekly digest: Friday evening, 5-bullet samenvatting
- Urgency rules: FRAGILE concentration > 2× cap → instant alert
- `/profiel` uitbreiden met notification preferences

**Effort**: ~3 dagen. Template-engine voor nette emails is het meeste werk.

---

### 13. Multi-portfolio
**Waarom**: serieuze beleggers hebben vaak gescheiden potjes: *pensioen* (IWDA-only), *speculatief* (kwaliteitsaandelen), *IB-portefeuille* (pay-yourself-first). Nu alles in één.

**Aanpak**:
- `Portfolio` model bestaat al; UI-laag die er één tegelijk laat kiezen
- Portfolio-switcher in sidebar
- Cross-portfolio aggregation view op `/dashboard` (totaal + per-portfolio)
- Elke engine al portfolio-aware; geen engine-changes nodig

**Effort**: ~2 dagen. Meeste werk is URL-state management voor de geselecteerde portfolio.

---

### 14. Watchlist feature af bouwen
**Waarom**: het model staat (`WatchlistItem`), de `/screener` kan toevoegen, maar er is **geen `/watchlist` pagina**. Dead-end.

**Aanpak**:
- `/watchlist` pagina: lijst met toegevoegde tickers, live factor-scores, actie = "voeg toe aan portefeuille" of "verwijder".
- Price-alert drempels per ticker (bv. "waarschuw als onder €100").
- Integratie met #12 notificaties.

**Effort**: ~1 dag voor UI + actions. Alerts = halve dag extra.

---

### 15. Rebalance-plan → DEGIRO-orderlijst
**Waarom**: /maandbeslissing zegt "koop €350 NVDA, €150 RHM.DE". Je moet die orders handmatig in DEGIRO zetten — foutgevoelig.

**Aanpak**:
- Export-knop op /maandbeslissing: "Download als DEGIRO-compatibele CSV"
- Format: ISIN, quantity, order-type (market/limit), limit-price (optioneel, uit huidige quote)
- Bestand te uploaden in DEGIRO's bulk-order tool (niet 100% zeker of DEGIRO dit aanbiedt — check)

**Alternatief**: copy-to-clipboard tekst-format per order voor manual entry.

**Effort**: ~0.5 dag. Afhankelijk van DEGIRO's API/bulk-format.

---

## 🟢 Nice-to-have (alleen als ruimte + vraag)

### 16. PWA / mobile layout
Dashboard leesbaar op telefoon. Manifest + service worker voor offline view van laatste snapshot. ~2 dagen.

### 17. Stress-test scenario builder
Nu zijn scenario's hardcoded (-20%, +10%, rate +1%). Laat user eigen scenario's definiëren: "bear case NL-economie", "olie +50%". Simpel UI + opgeslagen per user. ~1 dag.

### 18. Performance attribution
*Waar kwam mijn rendement vandaan?* Breakdown per sector, per positie, per factor. Nuttig na een jaar draaien. ~2 dagen.

### 19. Paper-trading mode
Simuleer orders zonder echt te kopen. Track hypothetical PnL. Voor strategy-testing zonder backtest-ingewikkeldheid. ~3 dagen.

### 20. ESG-scoring integratie
Externe data (MSCI ESG, Sustainalytics) — niet gratis, dus alleen relevant als user daarom vraagt + bereid is te betalen. Skip tot er vraag is.

### 21. Correlation matrix
Visualisatie van hoe je posities correleren. Nuttig voor diversificatie-analyse. ~1 dag.

### 22. Dividend calendar + forecast
Op basis van historische payment dates + yield: wanneer komt er dividend binnen, hoeveel verwacht. ~2 dagen na #9.

### 23. Voice-input in Chat
"Hey BeleggerIQ, wat zegt het regime?" via Web Speech API. Leuk demo maar marginale productiviteitswinst voor de use-case. Skip.

### 24. Onboarding wizard
Eerste-login flow: profiel → DEGIRO import → eerste maandbeslissing walkthrough. Verlaagt friction voor nieuwe users. ~1.5 dagen, wel alleen relevant zodra auth-flow (#1) er is.

---

## Wat ik bewust NIET zou doen

**Real-time prices + WebSocket push.**
BeleggerIQ is een long-term tool. Real-time voegt niets toe — en voegt wél complexity (reconnect logic, cache-invalidation bugs, resource use). 60s-cached quotes zijn ruim voldoende.

**Trading-execution via broker API.**
De app raadt aan; de user plaatst zelf. Als wij de order uitvoeren zijn we een broker en komt MiFID II in scope. Niet doen.

**AI-gedreven aanbevelingen.**
De chat-layer is expres deterministisch. Een LLM erop zou hallucinate cijfers introduceren — precies het tegenovergestelde van het "geen zwarte doos"-principe. Skip.

**Options/derivaten.**
Andere doelgroep, andere engine. Scope-creep. Als je short-dated wilt handelen: gebruik een andere tool.

**Social features / leaderboards.**
Langetermijnbeleggen is geen wedstrijd. Moedigt verkeerd gedrag aan (chasing, FOMO). Skip.

---

## Voorgestelde volgorde (mijn advies)

**Volgende 2 weken**:
1. Login-flow (#1) — blocker voor alle multi-user features
2. Prisma migrations (#2) — voorkom data-ongelukken
3. Backups (#3) — voorkom onomkeerbaar verlies

**Maand 2**:
4. CI/CD (#4) — maakt volgende iteraties sneller
5. Observability fase 1 (#5)
6. Health endpoint + rate limiting (#6)

**Maand 3-4**:
7. Transaction log (#9) — unlock belasting, dividend, cost-basis
8. ETF-specifieke scoring (#8) — adresseert de grootste "maar dit klopt niet" bij demo
9. Multi-portfolio (#13) — als er meer dan één user is

**Daarna**:
10. Notificaties + digest (#12)
11. NL box 3 module (#10) — sterk USP voor NL
12. Watchlist (#14)
13. Alles erna op basis van echte feedback.

---

## Wat NIET op deze roadmap staat, maar ik wel relevant vind

- **Feedback-loop met echte users**. Zonder 5-10 mensen die 'm dagelijks gebruiken verzin je maar wat. Boven elk feature-idee hier staat eigenlijk: *is iemand dit aan het missen?*
- **Documentatie van de engines zelf** — `docs/ENGINES.md` met formules + bronreferenties. Voor audit-trail en voor als je over 6 maanden terugkomt en denkt "waarom was de composite 0.4 quality + 0.25 value?".
- **License** — nu geen. Als je dit ooit publiek maakt, kies een license.
