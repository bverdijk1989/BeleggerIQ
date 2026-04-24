"use client";

import {
  Area,
  AreaChart,
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
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { PortfolioSnapshotRow } from "@/lib/data/snapshot-repository";
import type { Currency } from "@/types/common";

interface HistoryChartsProps {
  snapshots: PortfolioSnapshotRow[];
  baseCurrency: Currency;
}

const PRIMARY = "#3fc2ff";
const NEGATIVE = "#ef4444";
const MUTED = "#a1a8b4";
const GRID = "#1f2937";
const CURRENCY_PALETTE = ["#3fc2ff", "#a1a8b4", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];

/**
 * Vijf time-series charts op basis van `PortfolioSnapshot`-rijen:
 *  1. Portfolio value
 *  2. Drawdown
 *  3. Valuta-exposure (stacked area)
 *  4. Gemiddelde factor composite
 *  5. Grootste positie (gewicht)
 *
 * Puur presentationeel. Alle datatransformaties zijn hier inline; de
 * component ontvangt enkel de snapshot-rijen en render-context.
 */
export function HistoryCharts({
  snapshots,
  baseCurrency,
}: HistoryChartsProps) {
  if (snapshots.length === 0) {
    return <EmptyHistory />;
  }

  const dataset = snapshots.map((snap) => ({
    date: snap.capturedAt.slice(0, 10),
    value: snap.totalValue,
    drawdown: snap.drawdown !== null ? snap.drawdown : 0,
    factor: snap.metrics?.avgFactorComposite ?? null,
    largestWeight: snap.metrics?.largestPosition?.weight ?? null,
    largestTicker: snap.metrics?.largestPosition?.ticker ?? null,
    currencySlices: snap.metrics?.allocationByCurrency ?? [],
  }));

  const currencyLabels = extractCurrencyLabels(dataset);
  const stackedCurrencyData = dataset.map((row) => {
    const out: Record<string, number | string | null> = { date: row.date };
    for (const label of currencyLabels) {
      const slice = row.currencySlices.find((s) => s.label === label);
      out[label] = slice ? slice.weight : 0;
    }
    return out;
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Portefeuille-waarde"
        description={`In ${baseCurrency}, op basis van snapshots.`}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dataset} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(v: number) =>
                formatCurrency(v, baseCurrency, { maximumFractionDigits: 0 })
              }
              width={80}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [
                formatCurrency(value, baseCurrency, { maximumFractionDigits: 0 }),
                "Waarde",
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={PRIMARY}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Drawdown"
        description="Peak-to-trough in percentage van piek."
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dataset} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(v: number) => formatPercent(v)}
              width={60}
              domain={[(dataMin: number) => Math.min(-0.05, dataMin), 0]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [formatPercent(value), "Drawdown"]}
            />
            <Area
              type="monotone"
              dataKey="drawdown"
              stroke={NEGATIVE}
              fill={NEGATIVE}
              fillOpacity={0.2}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Valuta-exposure"
        description="Verdeling over valuta door de tijd."
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={stackedCurrencyData}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            stackOffset="expand"
          >
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(v: number) => formatPercent(v)}
              width={60}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => formatPercent(value)}
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
            {currencyLabels.map((label, index) => (
              <Area
                key={label}
                type="monotone"
                dataKey={label}
                stackId="currency"
                stroke={CURRENCY_PALETTE[index % CURRENCY_PALETTE.length]}
                fill={CURRENCY_PALETTE[index % CURRENCY_PALETTE.length]}
                fillOpacity={0.45}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Gemiddelde factor-composite"
        description="Over alle holdings op de snapshot-datum."
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dataset} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              domain={[0, 100]}
              width={40}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [
                typeof value === "number" && Number.isFinite(value)
                  ? `${Math.round(value)}/100`
                  : "—",
                "Composite",
              ]}
            />
            <Line
              type="monotone"
              dataKey="factor"
              stroke={PRIMARY}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Grootste positie"
        description="Aandeel van de zwaarste holding door de tijd."
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dataset} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              stroke={MUTED}
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(v: number) => formatPercent(v)}
              width={60}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, _name, payload) => {
                const ticker =
                  (payload?.payload as { largestTicker?: string } | undefined)
                    ?.largestTicker ?? "—";
                return [
                  typeof value === "number" && Number.isFinite(value)
                    ? formatPercent(value)
                    : "—",
                  `Largest (${ticker})`,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="largestWeight"
              stroke={PRIMARY}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ============================================================
//  Internals
// ============================================================

function extractCurrencyLabels(
  rows: Array<{ currencySlices: Array<{ label: string }> }>,
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const slice of row.currencySlices) set.add(slice.label);
  }
  return Array.from(set).sort();
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {title}
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyHistory() {
  return (
    <Card className="bg-surface/40">
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Nog geen snapshots
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          Klik op &quot;Snapshot nu&quot; om de eerste time-series vast te
          leggen. Historiek verschijnt hier zodra er meerdere snapshots zijn.
        </p>
      </CardContent>
    </Card>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "hsl(222 32% 10%)",
  border: "1px solid hsl(222 20% 18%)",
  borderRadius: 6,
  fontSize: 12,
};
