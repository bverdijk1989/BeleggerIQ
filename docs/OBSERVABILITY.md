# Observability — BeleggerIQ

> Doel: production-issues vinden zonder `journalctl | grep` archeologie.

BeleggerIQ logt **structured JSON** naar stdout. Dat is bewust spartaans:
één pipe naar Loki, Datadog, of `journald` is genoeg om dashboards te
bouwen. Geen agent, geen sidecar, geen lock-in.

## Pillars

| Pillar | Bron | Hoe je 'm leest |
|---|---|---|
| **Logs** | [`src/lib/log.ts`](../src/lib/log.ts) | `journalctl -u beleggeriq -o cat` (server) of stdout (lokaal) |
| **Request-correlation** | [`src/middleware.ts`](../src/middleware.ts) | filter op `requestId` in alle events |
| **Provider metrics** | [`src/lib/observability/metrics.ts`](../src/lib/observability/metrics.ts) | filter op `metric=provider_call` |
| **Cache metrics** | idem | filter op `metric=cache_event` |
| **Errors / alerts** | [`src/lib/observability/sentry.ts`](../src/lib/observability/sentry.ts) | Sentry-UI (alleen als DSN gezet is) |
| **Health probes** | [`/api/health`](../src/app/api/health/route.ts), [`/api/health/backup`](../src/app/api/health/backup/route.ts) | UptimeRobot / Healthchecks.io |

## Logger-API (geen API-break)

Bestaande callsites blijven werken:

```ts
log.info("scope:name", "human-readable msg", { extra: 123 });
log.warn(...); log.error(...); log.debug(...);
```

Nieuwe features (opt-in):

```ts
// 1. Custom sink (Sentry, Datadog, in-memory test capture, …)
import { addLogSink } from "@/lib/log";
addLogSink({
  name: "datadog-http",
  emit: (event) => fetch("https://...", { body: JSON.stringify(event) }),
});

// 2. Auto-redactie van secrets
log.info("auth", "login", { email, password });
//                                  ^^^^^^^^ → "[redacted]" in output
```

Geredacteerde keys (case-insensitive): `password`, `passwd`, `pwd`,
`token`, `secret`, `cookie`, `set-cookie`, `authorization`, `auth`,
`apikey`, `api_key`, `access_token`, `refresh_token`, `session`,
`x-api-key`. Werkt op nested objects (max 4 levels diep).

## Lokale logs

```bash
npm run dev
# stdout = pretty terminal output van de Next-server.
# Filter op scope:
npm run dev | grep '"scope":"market:provider"'
# JSON-veld extraheren met jq:
npm run dev | grep '^{' | jq 'select(.metric == "provider_call")'
```

## Productie-logs

```bash
ssh beleggeriq
sudo journalctl -u beleggeriq -f -o cat
# Volg request van begin tot eind:
sudo journalctl -u beleggeriq --since "10 min ago" -o cat \
  | grep '"requestId":"req_abc123def456"'
```

Voor Loki / Datadog: pipe stdout via `vector` of `promtail`. Geen agent
nodig — de logs zijn al machine-leesbaar.

## Request-correlation

Elk request krijgt een **`X-Request-ID`** in de middleware. De ID:

- komt uit een binnenkomende `X-Request-ID` header (mits formaat
  `[A-Za-z0-9._-]+` en ≤ 128 chars), of wordt gegenereerd als
  `req_<32-hex>`;
- wordt op de **inkomende** request gezet zodat downstream-handlers
  `request.headers.get("x-request-id")` kunnen lezen;
- wordt op de **response** gezet zodat de client + ingress 'em ziet.

Gebruik in een route-handler:

```ts
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? "unknown";
  log.info("api:foo", "starting", { requestId });
  // pass naar provider-call:
  await instrumentProvider({ provider, operation, fn, requestId });
}
```

## Provider metrics

```ts
import { instrumentProvider } from "@/lib/observability/metrics";

const quote = await instrumentProvider({
  provider: "yahoo",
  operation: "quote",
  fn: () => yahooClient.quote("AAPL"),
});
```

Emit-shape:
```json
{
  "scope": "metric:provider",
  "level": "info",
  "msg": "provider_call",
  "metric": "provider_call",
  "provider": "yahoo",
  "operation": "quote",
  "latencyMs": 142,
  "success": true,
  "fallbackUsed": false,
  "requestId": "req_..."
}
```

Bij failure: `level=warn`, `success=false`, `error=<message>`.
`fallbackUsed=true` zet je expliciet vanuit caller wanneer de primaire
provider faalde en je nu een fallback aanspreekt (bv. yahoo → stub).

## Cache metrics

```ts
import { recordCacheEvent } from "@/lib/observability/metrics";

const cached = cache.get(key);
if (cached) {
  recordCacheEvent({ namespace: "quotes", hit: true, ageSeconds: cached.age });
  return cached.value;
}
recordCacheEvent({ namespace: "quotes", hit: false });
```

Aggregeer in Loki:
```
sum by (namespace) (rate({app="beleggeriq"} | json | metric="cache_event" | hit="true"[5m]))
/
sum by (namespace) (rate({app="beleggeriq"} | json | metric="cache_event" [5m]))
```
→ hit-rate per namespace.

## Sentry (opt-in)

**Activeren:**
```bash
# 1. Install
npm install @sentry/node

# 2. Env-var op de server (.env.production)
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

Dat is genoeg. Bij volgende deploy ziet `instrumentation.ts` de DSN,
laadt `@sentry/node` dynamisch, init't de client, en hangt een sink
in de logger.

**Wat wordt verzonden:**
- `level=error` met een serialiseerde Error → `captureException`
- `level=error` zonder Error → `captureMessage`
- `level=warn` → `addBreadcrumb` (geen pagings, alleen context bij volgende error)
- `level=info|debug` → genegeerd

**Wat NIET:**
- Request-bodies, cookies, of andere PII — de logger redacteert al en de
  sink leest pas de **post-redactie** fields.
- Geen DSN of geen package → no-op (geen crash, alleen één info-log
  bij boot).

**Release-tagging:** Sentry-events krijgen `release=$BIQ_GIT_SHA`
automatisch (zelfde env-var als `/api/health` voor build-info). Source
maps uploaden is een handmatige extra stap (`sentry-cli releases files
upload-sourcemaps`) — niet wired in CI omdat het API-tokens vereist die
operator-keuze zijn.

## Alert-ideeën (suggested SLOs)

| Trigger | Tool | Drempel | Actie |
|---|---|---|---|
| `/api/health` ≠ 200 ≥ 2 polls | UptimeRobot | 5-min cadence | Page on-call |
| Backup > 30u oud | `/api/health/backup` 503 | per Healthchecks.io | Page (zie [BACKUPS.md](./BACKUPS.md)) |
| `metric=provider_call` `latencyMs` p95 > 2000 over 5 min | Loki / Datadog | per provider | Slack-warning |
| `metric=provider_call` `success=false` rate > 10% over 5 min | Loki / Datadog | per provider | Slack-warning |
| `metric=cache_event` hit-rate `quotes` < 60% over 30 min | Loki / Datadog | warn | Onderzoek TTL / preload |
| 429-rate (zie middleware-log `event=rate_limited`) > 10/s | Loki | 5-min cadence | Onderzoek bot/abuse |
| Sentry `event.frequency` > 50/h | Sentry default rules | per fingerprint | Triage |
| Sentry first-seen `release=<git-sha>` | Sentry release-rules | n.v.t. | Auto-comment op deploy-PR |

## Dashboard-ideeën (per pillar)

**HTTP / requests**
- Requests per minute, per route (top 10)
- p50/p95/p99 `durationMs` (kost data uit middleware-out, dus toevoegen
  in route-handler met dezelfde `requestId` — TODO)
- 4xx/5xx-rate per route
- 429-rate per `policy` (default-api / strict-chat / strict-login)

**Providers**
- Latency-heatmap per `provider` × `operation`
- Success-rate per provider, gestapeld
- `fallbackUsed=true` count per uur (wijst op primary-issues)

**Cache**
- Hit-rate per `namespace`
- Average `ageSeconds` per namespace (sanity-check op TTLs)
- Miss-storms: > 10× normale rate over 1 min

**Database**
- DB-ping latency uit `/api/health` body (als je 'em pollt)
- Slow-query log via Postgres `log_min_duration_statement = 500ms`

**Backup**
- Days since last successful backup (uit `/api/health/backup`)
- Backup-size groei over tijd

## Toekomstige uitbreidingen (niet nu)

- **OpenTelemetry** — distributed tracing wanneer we naar multi-service
  gaan. `instrumentation.ts` is al de juiste plek; `@vercel/otel` of
  `@opentelemetry/sdk-node` daar inplugen. Logger-sink-pattern werkt al.
- **Browser-side errors** — Sentry-browser via `_app`-level
  `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN })`. Pas op:
  client-DSN moet `NEXT_PUBLIC_*` zijn (publiek); rate-limit'em via
  Sentry-project-settings.
- **Real-user monitoring** — Vercel Analytics of `web-vitals` package
  → `recordCacheEvent`-achtige helper voor LCP/FID/CLS.
- **Audit-log** — apart channel `scope=audit:*` met andere retention.
  Trigger: legal/compliance reviewer eist een aparte event-stream.
