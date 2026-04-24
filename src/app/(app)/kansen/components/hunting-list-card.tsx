import {
  AlertTriangle,
  Binoculars,
  CalendarClock,
  Crosshair,
  Info,
  Radar,
  Target,
  Timer,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  HUNTING_SEVERITY_LABELS,
  HUNTING_STATUS_DESCRIPTIONS,
  HUNTING_STATUS_LABELS,
  HUNTING_TRIGGER_LABELS,
  isTriggerExpired,
  type HuntingAlertSeverity,
  type HuntingHistoryEntry,
  type HuntingListItem,
  type HuntingListReport,
  type HuntingStatus,
  type HuntingTrigger,
  type HuntingTriggerType,
} from "@/lib/analytics/hunting-list";
import { cn, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/types/common";

/**
 * HuntingListCard — pure presentatie van de `HuntingListReport`.
 *
 * Geen rekenwerk: status, severity, triggers, history en warnings
 * komen kant-en-klaar uit de engine. De UI kiest alleen kleuren,
 * labels en formatters.
 */

interface Props {
  report: HuntingListReport;
  /** Max aantal items; undefined = alles. */
  limit?: number;
}

// ============================================================
//  Kleur-maps
// ============================================================

const STATUS_BADGE: Record<HuntingStatus, string> = {
  watching: "border-muted-foreground/40 bg-surface/60 text-muted-foreground",
  "near-target": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  "signal-active": "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  expired: "border-red-500/40 bg-red-500/10 text-red-200",
};

const STATUS_ICON: Record<HuntingStatus, typeof Binoculars> = {
  watching: Binoculars,
  "near-target": Target,
  "signal-active": Crosshair,
  expired: Timer,
};

const SEVERITY_TONE: Record<HuntingAlertSeverity, string> = {
  NONE: "border-muted-foreground/30 bg-surface/40 text-muted-foreground",
  LOW: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  HIGH: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

const TRIGGER_TONE: Record<HuntingTriggerType, string> = {
  "target-zone-reached": "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  "target-zone-near": "border-sky-500/30 bg-sky-500/10 text-sky-200",
  "valuation-band-reached":
    "border-violet-500/30 bg-violet-500/10 text-violet-200",
};

// ============================================================
//  Top-level component
// ============================================================

export function HuntingListCard({ report, limit }: Props) {
  const items = limit && limit > 0 ? report.items.slice(0, limit) : report.items;
  const totalActiveTriggers = Object.values(report.triggerDistribution).reduce(
    (s, n) => s + n,
    0,
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Header />

        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-4 text-sm text-muted-foreground">
            Geen watchlist-items. Voeg tickers toe met een target-prijs of
            valuation-drempel om de hunting-list te activeren.
          </p>
        ) : (
          <>
            <StatusSummary report={report} totalTriggers={totalActiveTriggers} />
            <ul className="space-y-3">
              {items.map((it) => (
                <HuntingRow key={it.id} item={it} now={report.scannedAt} />
              ))}
            </ul>
          </>
        )}

        <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Elk signaal vervalt automatisch na de ingestelde TTL. Geen
            koopadvies; controleer altijd risico, allocatie en kwaliteit
            voordat je instapt.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function Header() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
        <Radar className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Hunting list
        </p>
        <p className="text-sm text-foreground">
          Actieve kansenlijst: watchlist-tickers met target-zone en
          valuation-band triggers. Alleen observaties — de gebruiker
          beslist.
        </p>
      </div>
    </div>
  );
}

function StatusSummary({
  report,
  totalTriggers,
}: {
  report: HuntingListReport;
  totalTriggers: number;
}) {
  const entries: Array<[HuntingStatus, number]> = [
    ["signal-active", report.statusDistribution["signal-active"]],
    ["near-target", report.statusDistribution["near-target"]],
    ["watching", report.statusDistribution["watching"]],
    ["expired", report.statusDistribution["expired"]],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {entries.map(([status, count]) => {
        const Icon = STATUS_ICON[status];
        return (
          <div
            key={status}
            className={cn(
              "rounded-md border p-3",
              STATUS_BADGE[status],
            )}
          >
            <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
              <Icon className="h-3 w-3" />
              {HUNTING_STATUS_LABELS[status]}
            </dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
              {count}
            </dd>
          </div>
        );
      })}
      <div className="col-span-2 sm:col-span-4 text-[11px] text-muted-foreground">
        Totaal {totalTriggers} actieve trigger{totalTriggers === 1 ? "" : "s"}{" "}
        op {report.items.length} items.
      </div>
    </dl>
  );
}

// ============================================================
//  Rij per hunting-list item
// ============================================================

function HuntingRow({ item, now }: { item: HuntingListItem; now: string }) {
  const Icon = STATUS_ICON[item.status];
  return (
    <li className="rounded-md border border-border/60 bg-surface/60 p-4">
      {/* Kop */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{item.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {item.ticker}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
              STATUS_BADGE[item.status],
            )}
          >
            <Icon className="h-3 w-3" />
            {HUNTING_STATUS_LABELS[item.status]}
          </span>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              SEVERITY_TONE[item.severity],
            )}
          >
            {HUNTING_SEVERITY_LABELS[item.severity]}
          </span>
        </div>
      </div>

      {/* Status-uitleg */}
      <p className="mt-2 text-xs text-muted-foreground">
        {HUNTING_STATUS_DESCRIPTIONS[item.status]}
      </p>

      {/* Metrics */}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Koers"
          value={formatPriceCell(item.currentPrice, item.currency)}
        />
        <Metric
          label="Target"
          value={formatPriceCell(item.config.targetPrice, item.currency)}
          helper={
            item.config.targetPriceHigh !== null
              ? `tot ${formatPriceCell(item.config.targetPriceHigh, item.currency)}`
              : `± ${(item.config.buyZoneTolerance * 100).toFixed(1)}% tolerantie`
          }
        />
        <Metric
          label="Valuation-drempel"
          value={
            item.config.valuationMaxPE !== null
              ? `P/E ≤ ${item.config.valuationMaxPE.toFixed(1)}`
              : item.config.valuationMinFcfYield !== null
                ? `FCF-yield ≥ ${(item.config.valuationMinFcfYield * 100).toFixed(1)}%`
                : "—"
          }
        />
        <Metric
          label="Actieve triggers"
          value={
            item.triggers.filter((t) => !isTriggerExpired(t, now)).length.toString()
          }
          helper={item.triggers.length > 0 ? `${item.triggers.length} totaal` : undefined}
        />
      </dl>

      {/* Triggers */}
      {item.triggers.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-border/60 pt-3">
          {item.triggers.map((t, i) => (
            <TriggerDetail
              key={`${t.type}-${i}`}
              trigger={t}
              expired={isTriggerExpired(t, now)}
              currency={item.currency}
            />
          ))}
        </ul>
      )}

      {/* Data-quality warnings */}
      {item.dataQuality.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/60 pt-3">
          {item.dataQuality.warnings.map((w, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Opportunity history */}
      {item.history.length > 0 && (
        <HistoryStrip history={item.history} currency={item.currency} />
      )}

      {/* Note */}
      {item.note && (
        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Notitie:</span>{" "}
          {item.note}
        </p>
      )}
    </li>
  );
}

function TriggerDetail({
  trigger,
  expired,
  currency,
}: {
  trigger: HuntingTrigger;
  expired: boolean;
  currency: Currency | null;
}) {
  const expires = new Date(trigger.expiresAt).toLocaleDateString("nl-NL");
  return (
    <li
      className={cn(
        "rounded-md border p-3",
        expired
          ? "border-border/60 bg-surface/30 opacity-70"
          : "border-border/60 bg-surface/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
            TRIGGER_TONE[trigger.type],
          )}
        >
          {HUNTING_TRIGGER_LABELS[trigger.type]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {HUNTING_SEVERITY_LABELS[trigger.severity].toLowerCase()} ·{" "}
          {expired ? "verlopen" : `vervalt ${expires}`}
        </span>
      </div>
      {trigger.rationale.length > 0 && (
        <ul className="mt-2 space-y-1">
          {trigger.rationale.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-foreground"
            >
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          <span className="font-semibold text-foreground">Keerzijde:</span>{" "}
          {trigger.riskNote}
        </span>
      </p>
      {trigger.snapshot.price !== null && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Snapshot:{" "}
          {formatPriceCell(trigger.snapshot.price, currency)}
          {trigger.snapshot.pe !== null
            ? ` · P/E ${trigger.snapshot.pe.toFixed(1)}`
            : ""}
          {trigger.snapshot.fcfYield !== null
            ? ` · FCF-yield ${(trigger.snapshot.fcfYield * 100).toFixed(1)}%`
            : ""}
        </p>
      )}
    </li>
  );
}

function HistoryStrip({
  history,
  currency,
}: {
  history: HuntingHistoryEntry[];
  currency: Currency | null;
}) {
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <CalendarClock className="h-3 w-3" />
        Eerdere triggers ({history.length})
      </p>
      <ul className="mt-2 space-y-1">
        {history.slice(0, 5).map((h, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
          >
            <span className="font-mono tabular-nums">
              {new Date(h.firedAt).toLocaleDateString("nl-NL")}
            </span>
            <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              {HUNTING_TRIGGER_LABELS[h.triggerType]}
            </span>
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                SEVERITY_TONE[h.severity],
              )}
            >
              {h.severity}
            </span>
            {h.price !== null && (
              <span className="font-mono text-[11px]">
                @ {formatPriceCell(h.price, currency)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
//  Helpers
// ============================================================

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
        {value}
      </dd>
      {helper && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

function formatPriceCell(
  value: number | null | undefined,
  currency: Currency | null,
): string {
  if (value === null || value === undefined) return "—";
  if (!currency) return value.toFixed(2);
  return formatCurrency(value, currency, { maximumFractionDigits: 2 });
}
