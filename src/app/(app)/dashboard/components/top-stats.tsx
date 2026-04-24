import {
  Activity,
  Briefcase,
  Coins,
  ShieldCheck,
} from "lucide-react";

import { MetricCard } from "@/components/common/metric-card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import type { MarketRegimeScore, MarketRegimeStance } from "@/types/regime";

interface TopStatsProps {
  view: PortfolioView;
  regime: MarketRegimeScore | null;
}

/**
 * Vier metric cards: totale waarde, health, marktregime, grootste positie.
 * Puur server-component dat analytics outputs naar bestaande `MetricCard`
 * mapt.
 */
export function TopStats({ view, regime }: TopStatsProps) {
  const { summary, health } = view;
  const pnlTrend =
    summary.unrealizedPnl > 0
      ? "up"
      : summary.unrealizedPnl < 0
        ? "down"
        : "flat";
  const healthTrend =
    health.score >= 70 ? "up" : health.score < 40 ? "down" : "flat";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Totale waarde"
        value={formatCurrency(summary.totalValue, summary.baseCurrency)}
        trend={pnlTrend}
        trendLabel={formatPercent(summary.unrealizedPnlPct)}
        helper={`${summary.positionCount} posities · ${formatCurrency(
          summary.unrealizedPnl,
          summary.baseCurrency,
        )} P&L`}
        icon={Briefcase}
      />
      <MetricCard
        label="Health grade"
        value={`${health.grade} · ${health.score}/100`}
        trend={healthTrend}
        trendLabel={`${health.signals.length} signaal${
          health.signals.length === 1 ? "" : "en"
        }`}
        helper={
          health.signals.length === 0
            ? "Geen aandachtspunten"
            : "Zie risicocentrum"
        }
        icon={ShieldCheck}
      />
      <MetricCard
        label="Marktregime"
        value={regime ? regimeLabel(regime) : "—"}
        trend={regime ? regimeTrend(regime.stance) : "flat"}
        trendLabel={
          regime
            ? `Coverage ${formatPercent(regime.confidence)}`
            : "Geen data"
        }
        helper={regime?.narrative?.split(".")[0] ?? "Onbekend"}
        icon={Activity}
      />
      <MetricCard
        label="Grootste positie"
        value={summary.largestPosition?.name ?? "—"}
        helper={
          summary.largestPosition
            ? `${formatPercent(summary.largestPosition.weight)} · ${summary.largestPosition.ticker}`
            : "Geen posities"
        }
        icon={Coins}
      />
    </div>
  );
}

const STANCE_LABEL: Record<MarketRegimeStance, string> = {
  RISK_ON: "Risk-on",
  NEUTRAL: "Neutraal",
  DEFENSIVE: "Defensief",
};

function regimeLabel(regime: MarketRegimeScore): string {
  return `${STANCE_LABEL[regime.stance]} · ${regime.score}/100`;
}

function regimeTrend(stance: MarketRegimeStance): "up" | "flat" | "down" {
  if (stance === "RISK_ON") return "up";
  if (stance === "DEFENSIVE") return "down";
  return "flat";
}
