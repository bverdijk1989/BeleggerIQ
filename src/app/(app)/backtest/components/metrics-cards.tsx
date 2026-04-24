import {
  Activity,
  ArrowLeftRight,
  Percent,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { MetricCard } from "@/components/common/metric-card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type { BacktestResult } from "@/types/backtest";

interface MetricsCardsProps {
  result: BacktestResult;
}

/**
 * Vijf cards met de headline-metrics van de backtest. Pure transformatie
 * van `BacktestResult` naar MetricCard props.
 */
export function MetricsCards({ result }: MetricsCardsProps) {
  const vsBench =
    result.benchmark !== undefined
      ? result.totalReturn - result.benchmark.totalReturn
      : null;

  const cagrTrend = result.cagr > 0 ? "up" : result.cagr < 0 ? "down" : "flat";
  const drawdownTrend =
    result.maxDrawdown <= -0.2
      ? "down"
      : result.maxDrawdown >= -0.05
        ? "up"
        : "flat";
  const sharpeTrend =
    result.sharpe >= 1 ? "up" : result.sharpe < 0 ? "down" : "flat";
  const vsTrend =
    vsBench === null ? "flat" : vsBench > 0 ? "up" : vsBench < 0 ? "down" : "flat";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <MetricCard
        label="CAGR"
        value={formatPercent(result.cagr)}
        trend={cagrTrend}
        trendLabel={`Totaal ${formatPercent(result.totalReturn)}`}
        helper={`Eindwaarde ${formatCurrency(
          result.finalValue,
          result.config.baseCurrency,
        )}`}
        icon={TrendingUp}
      />
      <MetricCard
        label="Volatility (ann.)"
        value={formatPercent(result.volatility)}
        helper={
          result.volatility < 0.15
            ? "Rustig"
            : result.volatility < 0.25
              ? "Normaal"
              : "Verhoogd"
        }
        icon={Activity}
      />
      <MetricCard
        label="Max drawdown"
        value={formatPercent(result.maxDrawdown)}
        trend={drawdownTrend}
        trendLabel={
          result.calmar !== undefined
            ? `Calmar ${formatNumber(result.calmar, 2)}`
            : undefined
        }
        helper="Peak-to-trough"
        icon={TrendingDown}
      />
      <MetricCard
        label="Sharpe"
        value={formatNumber(result.sharpe, 2)}
        trend={sharpeTrend}
        trendLabel={
          result.sortino !== undefined
            ? `Sortino ${formatNumber(result.sortino, 2)}`
            : undefined
        }
        helper="Risk-free 2% p.a."
        icon={Percent}
      />
      <MetricCard
        label="Strategie vs Benchmark"
        value={
          vsBench === null ? "—" : formatPercent(vsBench)
        }
        trend={vsTrend}
        trendLabel={
          result.benchmark
            ? `Benchmark ${formatPercent(result.benchmark.totalReturn)}`
            : undefined
        }
        helper={
          result.benchmark
            ? `${result.benchmark.ticker} · max DD ${formatPercent(result.benchmark.maxDrawdown)}`
            : "Geen benchmark gekozen"
        }
        icon={ArrowLeftRight}
      />
    </div>
  );
}
