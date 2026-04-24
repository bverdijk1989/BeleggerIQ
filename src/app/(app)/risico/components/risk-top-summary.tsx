import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatPercent } from "@/lib/utils";
import type { PortfolioRiskSummary, RiskSeverity } from "@/types/risk";

import { SEVERITY_LABEL_NL, TONE_BG, toneForSeverity } from "../severity";

interface RiskTopSummaryProps {
  risk: PortfolioRiskSummary;
  attentionCount: number;
}

/**
 * Hero-card bovenaan /risico. Rustig en zakelijk: overall severity als
 * geometrische badge links, belangrijkste drie metrics rechts. Geen rode
 * randen tenzij de score echt hoog is.
 */
export function RiskTopSummary({ risk, attentionCount }: RiskTopSummaryProps) {
  const tone = toneForSeverity(risk.overallSeverity);
  const score = risk.riskScore ?? null;

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-xl border",
              TONE_BG[tone],
            )}
          >
            <SeverityIcon severity={risk.overallSeverity} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Risico-klasse
            </p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {SEVERITY_LABEL_NL[risk.overallSeverity]}
            </p>
            {score !== null && (
              <p className="text-xs text-muted-foreground">
                Score {score}/100 · {attentionCount}{" "}
                {attentionCount === 1 ? "signaal" : "signalen"} die aandacht vragen
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniStat
            label="Grootste positie"
            value={formatPercent(risk.largestPositionWeight)}
          />
          <MiniStat
            label="Top 5 weegt"
            value={
              risk.top5Weight !== undefined
                ? formatPercent(risk.top5Weight)
                : "—"
            }
          />
          <MiniStat
            label="Vreemde valuta"
            value={
              risk.foreignCurrencyExposure !== undefined
                ? formatPercent(risk.foreignCurrencyExposure)
                : "—"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: RiskSeverity }) {
  if (severity === "high" || severity === "critical") {
    return <ShieldAlert className="h-6 w-6" />;
  }
  if (severity === "low") {
    return <ShieldCheck className="h-6 w-6" />;
  }
  return <ShieldQuestion className="h-6 w-6" />;
}
