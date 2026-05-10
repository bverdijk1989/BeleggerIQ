# Alerts Engine — Module 10

In-app notification-center bovenop de bestaande outbound `NotificationDelivery`-laag (e-mail/digest). Tien alert-typen, drie severity-niveaus, per-type preferences, read/unread/dismiss-state, en een idempotente persist-laag op (userId, dedupeKey).

> **UX-norm**: alerts moeten relevant zijn, niet spammy. Drempels zijn streng (Buffett-laag); zelfde gebeurtenis genereert ÉÉN rij ongeacht hoe vaak de engine draait.

---

## 1. De 10 alert-typen

| # | Type | Default-severity | Wanneer |
|---|---|---|---|
| 1 | `HEALTH_DROP` | WARNING | Health Score < 50, of −5pt drop (CRITICAL bij −12pt) |
| 2 | `CONCENTRATION_RISING` | WARNING | Positie ≥ 20% (CRITICAL bij ≥ 30%); sector ≥ 45%; +3pt rising |
| 3 | `PRICE_MOVE` | INFO | ±5% dag (WARNING bij ±10%); skip mini-posities < 1% |
| 4 | `MACRO_REGIME_CHANGE` | WARNING | GOLDILOCKS/REFLATION/STAGFLATION/DEFLATION-flip |
| 5 | `BEHAVIORAL_WARNING` | WARNING | Coach-signaal moderate+ dat nog niet bekend was (CRITICAL bij high) |
| 6 | `EARNINGS_EVENT` | INFO | Kwartaalcijfers nadert (vereist external feed) |
| 7 | `DIVIDEND_EVENT` | INFO | Ex-dividend-datum (vereist external feed) |
| 8 | `WATCHLIST_OPPORTUNITY` | INFO | Watchlist-ticker bereikt target-prijs |
| 9 | `VALUATION_SIGNAL` | INFO | Value-score ≥ 70 of FCF-yield ≥ 7% (max 5/run) |
| 10 | `AI_BRIEFING_READY` | INFO | Daily Briefing klaar (één per dag per user) |

---

## 2. Architectuur

```
src/lib/alerts/
├── types.ts              # AlertType, AlertSeverity, AlertStatus, Alert(Candidate)
├── catalog.ts            # Per-type definities (label, default-severity, category)
├── preferences.ts        # AlertPreferences (per type enabled + minSeverity)
├── generators.ts         # 10 pure event-generators
├── service.ts            # evaluateAlerts(...) orchestrator
├── actions.ts            # Server actions: markRead/markAllRead/dismiss/undismiss + prefs
├── generators.test.ts    # 31 tests
├── service.test.ts       # 13 tests (44 totaal)
└── index.ts

src/lib/data/
└── alert-repository.ts   # Prisma CRUD met idempotente persistCandidates

prisma/
├── schema.prisma         # +Alert model + AlertType/Severity/Status enums
└── migrations/20260510210000_add_alerts/

src/components/alerts/
├── notification-bell.tsx        # Top-bar bell met unread-badge
├── alert-row.tsx                # Eén alert in de center
└── alert-preferences-form.tsx   # Per-type aan/uit + min-severity

src/app/(app)/alerts/
└── page.tsx              # Notification-center: ongelezen / gelezen / genegeerd / voorkeuren
```

**Twee lagen** in `src/lib/notifications/` (bestaand) en `src/lib/alerts/` (nieuw):
- `NotificationDelivery` — outbound: e-mail, digest, push (later)
- `Alert` — in-app: read/unread/dismiss, popover, notification-center

---

## 3. Datamodel

```prisma
model Alert {
  id           String         @id @default(cuid())
  userId       String         → User
  type         AlertType
  severity     AlertSeverity  @default(INFO)
  status       AlertStatus    @default(UNREAD)
  dedupeKey    String         // unique (userId, dedupeKey)
  title        String
  body         String
  context      Json?
  link         String?
  occurredAt   DateTime
  readAt       DateTime?
  dismissedAt  DateTime?
}
```

**Idempotency-grens**: `(userId, dedupeKey)` is unique. `persistCandidates` doet upsert: bij conflict worden alleen `severity` / `title` / `body` / `context` / `link` ge-update — `status` + read/dismiss-state blijven onaangetast (engine mag user-acties niet overschrijven).

---

## 4. dedupeKey-conventie

Stable per "real-world" gebeurtenis. Format:
```
<TYPE>:<userId>:<bucket>:<salient>
```

Voorbeelden:
- `HEALTH_DROP:u-1:2026-05-10:below-50`
- `CONCENTRATION_RISING:u-1:2026-05-10:position:ASML`
- `PRICE_MOVE:u-1:2026-05-10:ASML`
- `MACRO_REGIME_CHANGE:u-1:2026-05-10:GOLDILOCKS-STAGFLATION`
- `AI_BRIEFING_READY:u-1:2026-05-10`

`<bucket>` is typisch `YYYY-MM-DD` zodat de engine 6× per dag draaien één rij oplevert, niet zes.

---

## 5. Preferences

Per-type config, opgeslagen in `UserProfile.preferences.alerts` (Json-blob):

```ts
type AlertPreferences = Record<AlertType, {
  enabled: boolean;
  minSeverity: "INFO" | "WARNING" | "CRITICAL";
}>;
```

Default = alle types `enabled=true`, `minSeverity=INFO`. `shouldDeliverAlert(prefs, type, severity)` is de filter-laag tussen generators en persistence. UI in `/alerts` heeft een per-type form + reset-button.

---

## 6. De pipeline

```
                ┌────────────────────────┐
                │  evaluateAlerts(...)   │  pure functie
                │  10 generators         │
                └──────────┬─────────────┘
                           │ AlertCandidate[]
                           ▼
                ┌────────────────────────┐
                │  in-run dedupe         │  defensive
                │  filter shouldDeliver  │  prefs.enabled + min-severity
                └──────────┬─────────────┘
                           │
                           ▼
                ┌────────────────────────┐
                │  persistCandidates()   │  idempotent upsert
                └──────────┬─────────────┘
                           │
                           ▼
                  Alert-rows in DB
                  (status=UNREAD)
                           │
                           ▼
                ┌────────────────────────┐
                │  /alerts UI            │  read / dismiss / undismiss
                │  bell-badge in topbar  │  unreadCount → badge
                └────────────────────────┘
```

**Trigger**: alerts worden gerund bij elke dashboard-load (idempotent). Zo blijft de notification-bell up-to-date zonder aparte cron-job. Eventueel kan een toekomstige cron-job 'em ook 's nachts draaien (alleen gericht op markt-data triggers).

---

## 7. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (geen ruis, geen paniek) | Streng: ±5% dag is de drempel, geen 1% kruimels. dedupeKey op dag-bucket; één event = één alert. Behavioral-low-severity wekt geen alert. |
| **Dalio** (risico + regime) | `MACRO_REGIME_CHANGE` is WARNING (niet INFO). `HEALTH_DROP` met -12pt → CRITICAL. Concentratie ≥ 30% → CRITICAL. |
| **Lynch** (begrijpelijk) | Titels in spreektaal NL, body's met concrete getallen ("ASML weegt 22% van je portefeuille"). Geen jargon. |
| **Simons** (meetbaar) | Drempels zijn `const` in code. 44 unit tests dekken elke trigger. Pure-functie generators — geen Date.now / random. |
| **Wood** (proactieve AI) | `AI_BRIEFING_READY` is een first-class alert-type. De engine kondigt zelf aan dat de AI klaar is. |

---

## 8. UX

### NotificationBell (top-bar)
- Bell-icoon met badge (1, 12, 99+) als er ongelezen alerts zijn.
- Click → `/alerts`.
- Badge update bij elke pagina-load (server-component leest `unreadCount`).

### `/alerts` notification-center
4 secties:
1. **Ongelezen (X)** — primary-border-left, "Nieuw"-badge per row
2. **Gelezen (X)** — geen border-accent, gedimd
3. **Genegeerd (X)** — collapsed style, "Activeer opnieuw"-knop
4. **Voorkeuren** — per type aan/uit + min-severity-pills (INFO / WARNING / CRITICAL)

Elke row: severity-icon + tone-kleur, title + body, type-pill, "Bekijk"-deeplink, "Markeer gelezen", "Negeer".

---

## 9. Voorbereiding op e-mail/push

De architectuur is klaar:
- **`NotificationDelivery`** (bestaand) is voor e-mail/digest met retry-state.
- **`Alert`** (nieuw) is in-app.
- **Brug**: een toekomstige `dispatchAlertsAsEmail`-job kan de twee verbinden — neem alle CRITICAL `Alert`-rows van de afgelopen N uur, render ze via `templates.ts`, schrijf ze als `NotificationDelivery`-rij voor de outbound queue.
- **Push**: zelfde patroon — een `pushAdapter` met `fcm`/`apns`-clients leest uit dezelfde `Alert`-rows, alleen WARNING+ wordt instant gepusht; INFO wordt in een dagelijkse digest verzameld.

Geen schema-wijzigingen nodig om e-mail of push toe te voegen — alleen een dispatch-laag.

---

## 10. Tests — 44 in totaal

| File | Tests | Coverage |
|---|---|---|
| `generators.test.ts` | 31 | 10 generators × 2-4 cases (drempel-checks, severity-stijging, skip-paden) |
| `service.test.ts` | 13 | Defaults + parsing + filter-logica + orchestrator + dedupe + prefs-filter |

---

## 11. Toekomstige uitbreidingen

| Idee | Waarom |
|---|---|
| **Cron-job** voor regime-/price-shifts buiten dashboard-bezoek | Detecteer regime-wissel om 9:00 ook al heeft de user nog geen dashboard geladen |
| **Push-notifications** | Werk de FCM/APNS-adapter af; CRITICAL wordt instant gepusht |
| **E-mail digest** | Bestaande `NotificationDelivery` + `digest.ts` aansluiten op `Alert`-rows |
| **Slack/Discord webhook** | Opt-in per user voor team-/community-gebruik |
| **Earnings + dividend feed** koppelen | Stubs staan klaar; aansluiting op Yahoo/EDGAR vult slot 6+7 |
| **Snooze N dagen** | Net als BehavioralWarningState — alert komt na N dagen terug als ACTIVE |
| **Group similar alerts** | "5 posities boven hun cap → 1 collapsed alert" i.p.v. 5 aparte rijen |
| **AI-explainability per alert** | Module 7 inhaken: per CRITICAL-alert een "Waarom dit telt"-paragraaf |
