import { AlertTriangle, Crosshair, Info, Timer } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  MISPRICING_SIGNAL_LABELS,
  type MispricingCandidate,
  type MispricingConfidenceTier,
  type MispricingReport,
  type MispricingSignal,
} from "@/lib/analytics/mispricing";
import { cn } from "@/lib/utils";

/**
 * MispricingCard — rendert de output van de Mispricing Scanner.
 *
 * Pure presentatie: alle cijfers (score, confidence, holding, expiry,
 * risk-flags, rationale) komen uit `scanMispricing`. Geen rekenwerk in
 * de UI.
 *
 * UX-regels:
 *  - Elke kandidaat toont expliciet **mispricing-score**, **confidence**,
 *    **verwachte holding-periode** en **vervaldatum** zodat een
 *    belegger direct ziet hoe hard of hoe zacht het signaal is.
 *  - Risk-flags worden getoond als badges met NL-labels; de ` riskNote`
 *    per onderliggend signaal verschijnt bij uitklappen (hier: altijd
 *    zichtbaar om defensief te zijn).
 *  - Waar data ontbreekt of confidence laag is, toont de UI dat
 *    **expliciet** (onzekerheidsflag + LOW-confidence badge).
 */

interface Props {
  report: MispricingReport;
  /** Limiteer het aantal zichtbare kandidaten op de pagina (sticky). */
  limit?: number;
}

const CONFIDENCE_BADGE: Record<
  MispricingConfidenceTier,
  { label: string; className: string }
> = {
  HIGH: {
    label: "Hoge zekerheid",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  MEDIUM: {
    label: "Matige zekerheid",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  LOW: {
    label: "Lage zekerheid",
    className: "border-red-500/40 bg-red-500/10 text-red-200",
  },
};

export function MispricingCard({ report, limit }: Props) {
  const candidates =
    limit && limit > 0 ? report.candidates.slice(0, limit) : report.candidates;
  const hasCandidates = candidates.length > 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Header ttlDays={report.signalTtlDays} />

        {!hasCandidates ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-4 text-sm text-muted-foreground">
            Geen mispricing-signalen boven de drempel. De scanner loopt
            elke pagina-refresh opnieuw; verlaag de minimum-score als je
            zwakkere signalen ook wilt zien.
          </p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((c, i) => (
              <MispricingRow key={c.ticker} candidate={c} rank={i + 1} />
            ))}
          </ul>
        )}

        <Footer
          tickersScanned={report.tickersScanned}
          candidateCount={report.candidateCount}
          scannedAt={report.scannedAt}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function Header({ ttlDays }: { ttlDays: number }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
        <Crosshair className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Mispricing scanner
        </p>
        <p className="text-sm text-foreground">
          Structurele prijs/kans-afwijkingen met verwachte holding-periode
          en expliciete vervaldatum.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Signalen vervallen automatisch na {ttlDays} dagen; geen
          koopsignaal, geen leverage, geen auto-execution.
        </p>
      </div>
    </div>
  );
}

function Footer({
  tickersScanned,
  candidateCount,
  scannedAt,
}: {
  tickersScanned: number;
  candidateCount: number;
  scannedAt: string;
}) {
  const scannedLabel = new Date(scannedAt).toLocaleString("nl-NL");
  return (
    <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {candidateCount} kandidaten uit {tickersScanned} gescande tickers.
        Scan uitgevoerd op {scannedLabel}. Elk signaal is reproduceerbaar
        uit dezelfde input (pure functies in `src/lib/analytics/mispricing`).
      </span>
    </p>
  );
}

function MispricingRow({
  candidate,
  rank,
}: {
  candidate: MispricingCandidate;
  rank: number;
}) {
  const expiresAt = new Date(candidate.earliestExpiresAt);
  const daysLeft = Math.max(
    0,
    Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)),
  );
  const expiresLabel = expiresAt.toLocaleDateString("nl-NL");

  return (
    <li className="rounded-md border border-border/60 bg-surface/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            #{rank}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {candidate.name}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {candidate.ticker}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScoreBadge value={candidate.aggregateScore} />
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium",
              CONFIDENCE_BADGE[candidate.aggregateConfidenceTier].className,
            )}
          >
            {CONFIDENCE_BADGE[candidate.aggregateConfidenceTier].label} ·{" "}
            {(candidate.aggregateConfidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Samenvatting */}
      <p className="mt-3 text-sm text-foreground">{candidate.summary}</p>

      {/* Metrics-strip: holding + expiry */}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric
          label="Verwachte holding"
          value={`± ${candidate.medianHoldingPeriodDays} d`}
        />
        <Metric
          label="Vervalt"
          value={daysLeft > 0 ? `${expiresLabel} (${daysLeft}d)` : expiresLabel}
          icon={<Timer className="h-3 w-3" />}
        />
        <Metric
          label="Signalen"
          value={candidate.signals.length.toString()}
        />
      </dl>

      {/* Per-signaal details */}
      <ul className="mt-4 space-y-3 border-t border-border/60 pt-3">
        {candidate.signals.map((s, i) => (
          <SignalDetail key={`${s.type}-${i}`} signal={s} />
        ))}
      </ul>

      {/* Risk-flags als badges */}
      {candidate.riskFlagCodes.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Risk flags
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {candidate.riskFlagCodes.map((code) => (
              <li
                key={code}
                className="inline-flex items-center gap-1 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200"
              >
                <AlertTriangle className="h-3 w-3" />
                {code}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function SignalDetail({ signal }: { signal: MispricingSignal }) {
  return (
    <li className="rounded-md border border-border/60 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {MISPRICING_SIGNAL_LABELS[signal.type]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {signal.mispricingScore}/100 · conf{" "}
          {(signal.confidence * 100).toFixed(0)}% · hold{" "}
          {signal.expectedHoldingPeriodDays}d
        </span>
      </div>
      {signal.rationale.length > 0 && (
        <ul className="mt-2 space-y-1">
          {signal.rationale.map((r, i) => (
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
          {signal.riskNote}
        </span>
      </p>
      {!signal.dataQuality.met && (
        <p className="mt-2 flex items-start gap-2 text-[11px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Data-kwaliteit niet volledig gedekt:{" "}
          {signal.dataQuality.missing.join(", ")}
        </p>
      )}
    </li>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 80
      ? "border-success/40 bg-success/10 text-success"
      : value >= 60
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-muted-foreground/40 bg-surface/60 text-muted-foreground";
  return (
    <div
      className={cn(
        "flex min-w-[4.5rem] flex-col items-center justify-center rounded-md border px-2 py-1",
        tone,
      )}
    >
      <span className="font-mono text-lg font-semibold tabular-nums leading-none">
        {Math.round(value)}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-[0.18em] opacity-80">
        misprice
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
