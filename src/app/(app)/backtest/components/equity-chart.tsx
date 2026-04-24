"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyChart } from "@/components/common/empty-chart";
import { formatCurrency } from "@/lib/utils";
import type { BacktestResult } from "@/types/backtest";

interface EquityChartProps {
  result: BacktestResult;
  strategyLabel: string;
}

interface ChartPoint {
  date: string;
  strategy: number;
  benchmark: number | null;
}

const STRATEGY_COLOR = "#3fc2ff";    // matches --primary in dark theme
const BENCHMARK_COLOR = "#a1a8b4";   // neutral grey (muted-foreground)
const GRID_COLOR = "#1f2937";

/**
 * Equity curve visualisatie op basis van `BacktestResult.equityCurve`.
 * Rustig dark-theme styling; geen AI-gekleurde glow of animaties.
 */
export function EquityChart({ result, strategyLabel }: EquityChartProps) {
  const data: ChartPoint[] = result.equityCurve.map((point) => ({
    date: point.date,
    strategy: point.value,
    benchmark:
      point.benchmark !== undefined && Number.isFinite(point.benchmark)
        ? point.benchmark
        : null,
  }));

  const hasBenchmark = data.some((d) => d.benchmark !== null);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Equity curve
            </p>
            <p className="text-sm text-foreground">
              Portfolio-waarde van{" "}
              <span className="font-medium">{strategyLabel}</span>
              {hasBenchmark && result.benchmark && (
                <>
                  {" "}
                  versus benchmark{" "}
                  <span className="font-medium">
                    {result.benchmark.ticker}
                  </span>
                </>
              )}
              .
            </p>
          </div>
        </div>

        {data.length === 0 ? (
          <EmptyChart height={360} message="Geen datapunten om te tonen." />
        ) : (
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke={GRID_COLOR}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke={BENCHMARK_COLOR}
                  fontSize={11}
                  tickLine={false}
                  tickMargin={8}
                  tickFormatter={(value: string) => value.slice(0, 7)}
                  minTickGap={32}
                />
                <YAxis
                  stroke={BENCHMARK_COLOR}
                  fontSize={11}
                  tickLine={false}
                  tickMargin={8}
                  tickFormatter={(value: number) =>
                    formatCurrency(value, result.config.baseCurrency, {
                      maximumFractionDigits: 0,
                    })
                  }
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(222 32% 10%)",
                    border: "1px solid hsl(222 20% 18%)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  itemStyle={{ padding: "2px 0" }}
                  labelStyle={{ color: BENCHMARK_COLOR }}
                  formatter={(value: number, name) => [
                    formatCurrency(value, result.config.baseCurrency, {
                      maximumFractionDigits: 0,
                    }),
                    name,
                  ]}
                />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="strategy"
                  name={strategyLabel}
                  stroke={STRATEGY_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
                {hasBenchmark && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name={result.benchmark?.ticker ?? "Benchmark"}
                    stroke={BENCHMARK_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
