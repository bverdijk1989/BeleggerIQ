import type { StressTestResult } from "@/lib/analytics/stress-tests";
import { cn } from "@/lib/utils";

/**
 * ImpactChart — horizontale staafdiagram die per scenario het portfolio-
 * impact-percentage toont. Pure SVG, geen library.
 *
 * Negatieve impact = amber/rood (links); positieve = groen (rechts).
 * Worst-case wordt geannoteerd voor extra aandacht.
 */

interface Props {
  results: ReadonlyArray<StressTestResult>;
  className?: string;
}

const ROW_HEIGHT = 38;
const PADDING = { top: 8, bottom: 30, left: 160, right: 16 };

export function ImpactChart({ results, className }: Props) {
  if (results.length === 0) return null;

  const height = PADDING.top + results.length * ROW_HEIGHT + PADDING.bottom;
  const width = 720;
  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  // Vind absolute max voor symmetric scaling.
  const maxAbs = Math.max(
    ...results.map((r) => Math.abs(r.portfolioImpactPct)),
    0.05,
  );
  // Schaal: -maxAbs links → 0 midden → +maxAbs rechts.
  const xCenter = PADDING.left + innerWidth / 2;
  const xScale = (impact: number) =>
    xCenter + (impact / maxAbs) * (innerWidth / 2);

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Stress-test impact per scenario"
      >
        {/* Vertical center line (0%) */}
        <line
          x1={xCenter}
          x2={xCenter}
          y1={PADDING.top}
          y2={height - PADDING.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeDasharray="2,3"
        />

        {/* X-axis ticks: -50%, -25%, 0%, +25% (only those within range) */}
        {[-0.5, -0.25, 0, 0.25].map((pct) => {
          if (Math.abs(pct) > maxAbs && pct !== 0) return null;
          return (
            <g key={`xt-${pct}`}>
              <line
                x1={xScale(pct)}
                x2={xScale(pct)}
                y1={height - PADDING.bottom}
                y2={height - PADDING.bottom + 4}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              <text
                x={xScale(pct)}
                y={height - PADDING.bottom + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {pct === 0 ? "0%" : `${(pct * 100).toFixed(0)}%`}
              </text>
            </g>
          );
        })}

        {/* Bars per scenario */}
        {results.map((r, i) => {
          const y = PADDING.top + i * ROW_HEIGHT + ROW_HEIGHT / 2;
          const x0 = xCenter;
          const x1 = xScale(r.portfolioImpactPct);
          const negative = r.portfolioImpactPct < 0;
          const fill = negative
            ? r.portfolioImpactPct < -0.15
              ? "#dc2626" // red
              : "#f59e0b" // amber
            : "#10b981"; // emerald
          return (
            <g key={r.scenario}>
              {/* Label */}
              <text
                x={PADDING.left - 8}
                y={y}
                dy="0.32em"
                textAnchor="end"
                className="fill-foreground text-[10px]"
              >
                {r.label}
              </text>

              {/* Bar */}
              <rect
                x={Math.min(x0, x1)}
                y={y - ROW_HEIGHT / 3}
                width={Math.abs(x1 - x0)}
                height={(ROW_HEIGHT * 2) / 3}
                fill={fill}
                fillOpacity={0.55}
                stroke={fill}
                strokeWidth={1.25}
                rx={2}
              />

              {/* Value label aan einde van bar */}
              <text
                x={x1 + (negative ? -6 : 6)}
                y={y}
                dy="0.32em"
                textAnchor={negative ? "end" : "start"}
                className={cn(
                  "text-[10px] font-mono",
                  negative ? "fill-amber-200" : "fill-emerald-200",
                )}
              >
                {r.portfolioImpactPct >= 0 ? "+" : ""}
                {(r.portfolioImpactPct * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-red-500/60" />
          Severe (&lt; -15%)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-amber-500/60" />
          Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500/60" />
          Positief
        </span>
      </div>
    </div>
  );
}
