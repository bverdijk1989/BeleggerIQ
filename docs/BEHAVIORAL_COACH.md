# Behavioral Finance Coach — Module 3

Een coachende laag die 8 gedragspatronen meet in je portefeuille en transactiehistorie. Stelt **reflectievragen**, geeft **geen koop/verkoop-advies**. De toon is uitnodigend (Lynch-laag), de drempels zijn meetbaar (Simons-laag), het risico is expliciet (Dalio-laag), de horizon is lange termijn (Buffett-laag).

> **Toon-norm**: NOOIT "je hebt fout gehandeld". WEL "je portefeuille wijkt nu af van je strategie — wil je deze keuze bewust maken?".

---

## 1. De 8 patronen

| # | Key | Detectie | Default-drempel |
|---|---|---|---|
| 1 | `OVERCONCENTRATION` | Position-weight ≥ 10% of sector ≥ 35% | 15% / 35% |
| 2 | `OVERTRADING` | # BUY/SELL trades in 30d | ≥ 8 |
| 3 | `PANIC_SELLING` | SELL waar prijs in 7d ervoor ≤ -8% daalde | -8% / -15% |
| 4 | `FOMO_BUYING` | BUY waar prijs in 30d ervoor ≥ +15% steeg | +15% / +30% |
| 5 | `STRATEGY_DRIFT` | Equity-share wijkt > 20pt af van objective-target | ±20pt |
| 6 | `UNDER_DIVERSIFICATION` | positionCount < 8 (Markowitz-floor) | 8 |
| 7 | `CASH_MISMATCH` | Cash > maxCashShare (drag) of < cashBufferPct × 0.4 (no buffer) | policy-driven |
| 8 | `PERFORMANCE_CHASING` | BUY in positie die ≥ +40% PnL toont | +40% / +80% |

Elk patroon levert een `BehavioralSignal` met:
- `severity`: low / moderate / elevated / high
- `title` + `message` (coachende tekst)
- `metric` + `threshold` (audit + transparantie)
- 1–3 `reflectionQuestions` met optionele hint
- `nextStep` — geen advies, wel een prikkel

---

## 2. Architectuur

```
src/lib/analytics/behavioral/
├── types.ts              # BehavioralSignal, severity, status, reflection
├── detector-types.ts     # input-shape voor de 8 detectors
├── detectors.ts          # 8 pure detector-functies
├── engine.ts             # orchestrator: run all, dedupe, severity-sort
├── state.ts              # apply user-state (dismiss/snooze) op signalen
├── loader.ts             # server-side: portfolio + tx + history → engine
├── actions.ts            # server actions voor dismiss/snooze
├── fixtures.ts           # test-fixtures
├── detectors.test.ts     # 35 tests — per detector
├── engine.test.ts        # 11 tests — orchestrator + state-merge
└── index.ts

src/lib/data/
└── behavioral-state-repository.ts   # Prisma CRUD

prisma/
├── schema.prisma                     # +BehavioralWarningState model
└── migrations/20260510140000_add_behavioral_warning_state/

src/components/behavioral/
├── coach-card.tsx        # dashboard widget
└── warning-card.tsx      # individuele kaart (client — useTransition)

src/app/(app)/coach/
└── page.tsx              # detail-pagina (active / snoozed / dismissed)
```

**Twee lagen**:
- **Pure laag**: detectoren + engine + state-merge → testbaar zonder DB
- **Server laag**: loader (DB-fetch) + actions (mutaties) → integratie

---

## 3. State-model (dismiss / snooze)

Prisma-model `BehavioralWarningState`:
```
unique (userId, signalId)
status   ACTIVE | DISMISSED | SNOOZED
snoozedUntil   DateTime?
reasonNote     String?
```

**Semantiek**:
- Geen rij = ACTIVE (default).
- Rij met `status=DISMISSED` = permanent genegeerd; user kan via /coach reactiveren.
- Rij met `status=SNOOZED` + `snoozedUntil > now` = SNOOZED.
- Rij met `status=SNOOZED` + `snoozedUntil ≤ now` = wordt door `applyWarningStates` weer als ACTIVE behandeld; geen housekeeping-job nodig.

**Server actions** (`actions.ts`):
- `updateBehavioralWarningStateAction({ signalId, status, snoozedUntil?, reasonNote? })`
- `resetBehavioralWarningAction({ signalId })`

Beide doen `revalidatePath("/dashboard")` + `revalidatePath("/coach")` — UI refresht zonder client-state-glue.

---

## 4. Reflectievragen (per signaal-key)

Elk signaal heeft 1–3 vragen met een optionele hint. Voorbeelden:

**OVERCONCENTRATION**:
- "Wat zou je doen als deze positie morgen 30% daalt?"
- *Hint*: Een positie waarvan een 30%-daling je nachtrust kost is wellicht te groot voor je risicotolerantie.
- "Past de overweging bij een bewuste convictie, of is het 'gegroeid' zonder dat je trimde?"

**PANIC_SELLING**:
- "Was er nieuw bedrijfs-/macro-nieuws dat je thesis veranderde, of reageerde je op de prijs?"
- *Hint*: Buffett — "Be fearful when others are greedy and greedy when others are fearful."

**FOMO_BUYING**:
- "Past deze positie nog bij je 5-jarig plan, of koop je achter het peloton aan?"
- *Hint*: Lynch — "Most stocks lose money in the year after their best year."

**STRATEGY_DRIFT**:
- "Wijkt je portefeuille bewust af, of is het 'er zo gegroeid'?"
- *Hint*: Drift is normaal door koersbeweging; bewust herijken houdt je portefeuille bij je profiel.

(Volledige set staat in `detectors.ts`.)

---

## 5. Drempels — rationale

| Patroon | Drempel | Waarom |
|---|---|---|
| Position weight ≥ 15% | Markowitz/Buffett — 5+ posities geeft al brede risicodemping; > 15% = single-name-risico zwaar |
| Sector weight ≥ 35% | Sectorshocks (rente, regulering) raken alle posities tegelijk |
| Trades ≥ 8/30d | Empirische "active trader"-grens; daarboven kost spread + tax meer dan winst |
| Drop ≥ 8% in 7d → SELL | -8% in een week valt buiten normale ruis, suggereert nieuws-of-paniek-respons |
| Rise ≥ 15% in 30d → BUY | Een 15%-rally suggereert dat de markt al heeft ingeprijsd wat jij ook ziet |
| Drift ± 20pt | Onder dat niveau is drift normaal; daarboven verandert je risicoprofiel materieel |
| Posities < 8 | Markowitz' diversification-curve heeft tot ~15 posities zinvolle marginale risicoreductie |
| Cash > maxCashShare | Cash-drag kost ~3–5% per jaar opportunity-cost |
| Cash < cashBufferPct × 0.4 | Te weinig buffer dwingt tot verkoop tijdens dip |
| Buy in positie +40% | Bijkopen na sterke stijging verhoogt gemiddelde kostprijs |

Drempels zijn `const` in [detectors.ts](../src/lib/analytics/behavioral/detectors.ts); wijziging vereist een PR met motivatie.

---

## 6. Topbelegger-validatie

| Lens | Waar het zit |
|---|---|
| **Buffett** (voorkomt emotioneel handelen) | PANIC_SELLING + FOMO_BUYING zijn directe Buffett-flags. Reflectievragen quoteren 'em letterlijk. |
| **Dalio** (risico's expliciet) | Severity (low/moderate/elevated/high) + numerieke metric + threshold per signaal. STRATEGY_DRIFT meet equity vs profile expliciet. |
| **Lynch** (begrijpelijk) | Coach-toon. Concrete cijfers en namen ("ASML weegt 18%"). Reflectievragen in spreektaal NL. |
| **Simons** (meetbaar) | Drempels in code, deterministisch. 46 unit tests. Reproduceerbaar zonder LLM. |
| **Wood** (AI/gedrag) | Het systeem is voorbereid op LLM-augmentatie: reflectievragen kunnen als prompt naar de Daily-Briefing-AI worden gestuurd voor gepersonaliseerde framing. |

---

## 7. Tests

**46 tests** in 2 files:

| File | Tests | Coverage |
|---|---|---|
| `detectors.test.ts` | 35 | Per detector: drempel-flips, severity-stijging, skip-paden, dedupe, edge-cases |
| `engine.test.ts` | 11 | Orchestrator (volgorde, counts, determinisme), state-merge (ACTIVE/DISMISSED/SNOOZED), partition |

Voorbeelden:
- "SELL na -10% in 7d → moderate signal"
- "SELL na -20% → elevated"
- "GROWTH-profiel met 60% cash → drift naar defensief"
- "user-policy maxPositionWeight verhoogt severity een stap"
- "SNOOZED met verlopen datum → ACTIVE"
- "twee BUYs in dezelfde ticker → één signal (dedupe)"

---

## 8. UX-design

**Dashboard widget (`CoachCard`)**:
- Toont alleen ACTIVE signalen (max 2)
- Bij 0 actieve: "geen patronen — blijf bewust handelen" (positieve bevestiging, niet leeg)
- Link naar volledige `/coach`

**Detail-pagina (`/coach`)**:
- 3 secties: ACTIVE / SNOOZED / DISMISSED
- Per kaart (`WarningCard`): titel + bericht + reflectievragen (collapsible) + acties (Snooze 7d / Negeer / Activeer)
- Methodologie-blok onderaan met aanwijzing naar dit document

**Toon-regel**: nooit imperatief ("doe dit"). Wel uitnodigend ("overweeg of"), met reflectie ("wat zou je doen als..."). De gebruiker is altijd de eindbeslisser.

---

## 9. Wat (nog) niet in scope

| Feature | Status | Reden uitstel |
|---|---|---|
| Notification-trigger | Niet | Een notificatie zou panic-signalen versterken; coach blijft passief. |
| AI-personalisatie van reflectievragen | Niet | Module 2 (briefing) heeft de AI-laag — kan later prompt-injection toevoegen. |
| Trend-tracking (signaal nu vs 30d geleden) | Niet | Eerst stabiele baseline; trend volgt uit history van state-records. |
| Multi-portfolio coach | Niet | Eerst per primary; aggregate later. |
| Reflectie-journal (user-notities per signaal) | Voorbereid via `reasonNote` | UI nog niet — server-action accepteert het al. |

---

## 10. Toekomstige uitbreidingen

- **Behavior-score** (0–100): aggregate van alle signaal-severities → één getal voor het dashboard.
- **Anomalie-detectie** met factor-engine input: BUY in laagste-momentum-bucket = mogelijk "buy the dip"; BUY in hoogste-momentum-bucket bevestigt FOMO.
- **Empirisch tunen** van drempels via gebruiker-feedback ("kloppend signaal" / "false positive").
- **AI-laag**: stuur reflectievragen + signal-context naar de Daily Briefing-AI voor een gepersonaliseerde "ochtend-coach"-paragraaf.
- **Notification opt-in**: alleen wanneer gebruiker expliciet aanvinkt; default uit.
