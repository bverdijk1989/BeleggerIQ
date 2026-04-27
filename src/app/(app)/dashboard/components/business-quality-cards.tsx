import { Award, Shield, ShieldAlert, Sparkles, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type {
  BusinessLabel,
  BusinessQualityResult,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Twee dashboard-cards: sterkste en zwakste bedrijven in de
 * portefeuille op basis van `businessQualityScore`. Pure presentatie;
 * alle scores komen uit `loadBusinessQualityBatch`.
 */

interface Props {
  results: BusinessQualityResult[];
  /** Aantal items per kaart. Default 5. */
  limit?: number;
}

const LABEL_BADGE: Record<BusinessLabel, string> = {
  COMPOUNDER: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  CYCLICAL: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  SPECULATIVE: "border-red-500/40 bg-red-500/10 text-red-200",
};

const LABEL_NL: Record<BusinessLabel, string> = {
  COMPOUNDER: "Compounder",
  CYCLICAL: "Cyclisch",
  SPECULATIVE: "Speculatief",
};

export function BusinessQualityCards({ results, limit = 5 }: Props) {
  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Nog geen business-quality-data — voeg posities toe of wacht tot
          fundamentals zijn opgehaald.
        </CardContent>
      </Card>
    );
  }
  // Sorted DESC al; pak top en bottom.
  const top = results.slice(0, limit);
  const bottom = [...results].reverse().slice(0, limit);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <RankCard
        title="Sterkste bedrijven"
        subtitle="Hoogste business-quality-score in je portefeuille"
        Icon={Award}
        results={top}
        tone="good"
      />
      <RankCard
        title="Zwakste bedrijven"
        subtitle="Posities met lage moat / earnings / capital efficiency"
        Icon={ShieldAlert}
        results={bottom}
        tone="bad"
      />
    </div>
  );
}

// ============================================================
//  Rank-card
// ============================================================

function RankCard({
  title,
  subtitle,
  Icon,
  results,
  tone,
}: {
  title: string;
  subtitle: string;
  Icon: typeof Award;
  results: BusinessQualityResult[];
  tone: "good" | "bad";
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              tone === "good"
                ? "bg-emerald-500/15 text-emerald-200"
                : "bg-red-500/15 text-red-200",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {title}
            </p>
            <p className="text-sm text-foreground">{subtitle}</p>
          </div>
        </div>
        <ul className="space-y-2">
          {results.map((r, i) => (
            <BusinessRow key={r.ticker} result={r} rank={i + 1} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BusinessRow({
  result,
  rank,
}: {
  result: BusinessQualityResult;
  rank: number;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        #{rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {result.ticker}
          </p>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {result.businessQualityScore}/100
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              LABEL_BADGE[result.label],
            )}
          >
            {LABEL_NL[result.label]}
          </span>
          {result.canHoldLongTerm && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
              <Sparkles className="h-3 w-3" />
              10y-hold
            </span>
          )}
          <span className="rounded-sm bg-surface-elevated/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            conf {(result.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <dl className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          <Pill
            icon={<Shield className="h-2.5 w-2.5" />}
            label="moat"
            value={result.moatScore}
          />
          <Pill
            icon={<Target className="h-2.5 w-2.5" />}
            label="earn"
            value={result.earningsStability}
          />
          <Pill
            icon={<Award className="h-2.5 w-2.5" />}
            label="cap"
            value={result.capitalEfficiency}
          />
        </dl>
      </div>
    </li>
  );
}

function Pill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-surface-elevated/40 px-1.5 py-0.5 font-mono tabular-nums">
      {icon}
      {label} {value}
    </span>
  );
}
