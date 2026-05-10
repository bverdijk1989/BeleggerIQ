import type { GoalProjection } from "@/lib/analytics/goals/types";

/**
 * ProjectionChart — drie scenario-lijnen + horizontale doel-lijn.
 *
 * Pure SVG, geen library. Doel: snelle render, nul JS-overhead, geen
 * interactie. Gebruikt jaar-stappen uit de projectie-series.
 *
 * Y-as: bedrag (auto-scaled). X-as: jaren.
 */

interface Props {
  projection: GoalProjection;
  targetAmount: number;
  /** Currency-code, voor as-labels. */
  currency: string;
  className?: string;
}

const WIDTH = 600;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 32, left: 64 };

const SCENARIO_COLOR: Record<string, string> = {
  pessimistic: "#dc2626", // red-600
  neutral: "#3b82f6", // blue-500
  optimistic: "#10b981", // emerald-500
};

const SCENARIO_LABEL: Record<string, string> = {
  pessimistic: "Pessimistisch",
  neutral: "Verwacht",
  optimistic: "Optimistisch",
};

export function ProjectionChart({
  projection,
  targetAmount,
  currency,
  className,
}: Props) {
  const series = projection.scenarios;
  const allValues = [
    ...series.pessimistic.series.map((p) => p.value),
    ...series.neutral.series.map((p) => p.value),
    ...series.optimistic.series.map((p) => p.value),
    targetAmount,
  ];
  const yMax = Math.max(...allValues, 1);
  const yMin = 0;
  const xMax = Math.max(
    series.neutral.series[series.neutral.series.length - 1]?.yearOffset ?? 1,
    1,
  );

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const xFor = (yearOffset: number) =>
    PADDING.left + (yearOffset / xMax) * innerWidth;
  const yFor = (value: number) =>
    PADDING.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const polyline = (points: ReadonlyArray<{ yearOffset: number; value: number }>) =>
    points.map((p) => `${xFor(p.yearOffset)},${yFor(p.value)}`).join(" ");

  // Y-as ticks (5 stappen)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const fraction = i / 4;
    return yMin + fraction * (yMax - yMin);
  });

  // X-as ticks (max 6)
  const xTickCount = Math.min(6, xMax + 1);
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i / (xTickCount - 1)) * xMax),
  );

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Projectie van scenario's tot doel-datum"
      >
        {/* Y-as grid */}
        {yTicks.map((tick, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeDasharray="2,3"
            />
            <text
              x={PADDING.left - 6}
              y={yFor(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[9px]"
            >
              {formatCompact(tick, currency)}
            </text>
          </g>
        ))}

        {/* X-as ticks */}
        {xTicks.map((year, i) => (
          <g key={`xt-${i}`}>
            <line
              x1={xFor(year)}
              x2={xFor(year)}
              y1={HEIGHT - PADDING.bottom}
              y2={HEIGHT - PADDING.bottom + 4}
              stroke="currentColor"
              strokeOpacity={0.4}
            />
            <text
              x={xFor(year)}
              y={HEIGHT - PADDING.bottom + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              +{year}j
            </text>
          </g>
        ))}

        {/* Doellijn */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={yFor(targetAmount)}
          y2={yFor(targetAmount)}
          stroke="#d97706"
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />
        <text
          x={WIDTH - PADDING.right}
          y={yFor(targetAmount) - 4}
          textAnchor="end"
          className="fill-amber-300 text-[10px] font-semibold"
        >
          Doel · {formatCompact(targetAmount, currency)}
        </text>

        {/* Scenario-lijnen */}
        {(["pessimistic", "neutral", "optimistic"] as const).map((key) => (
          <polyline
            key={key}
            points={polyline(series[key].series)}
            fill="none"
            stroke={SCENARIO_COLOR[key]}
            strokeWidth={key === "neutral" ? 2.5 : 1.75}
            strokeOpacity={key === "neutral" ? 1 : 0.8}
          />
        ))}

        {/* Eindwaarde-stippen */}
        {(["pessimistic", "neutral", "optimistic"] as const).map((key) => {
          const last = series[key].series[series[key].series.length - 1];
          if (!last) return null;
          return (
            <circle
              key={`dot-${key}`}
              cx={xFor(last.yearOffset)}
              cy={yFor(last.value)}
              r={3.5}
              fill={SCENARIO_COLOR[key]}
            />
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px]">
        {(["pessimistic", "neutral", "optimistic"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{ backgroundColor: SCENARIO_COLOR[key] }}
            />
            {SCENARIO_LABEL[key]} ({(series[key].annualReturn * 100).toFixed(1)}%/jr) →{" "}
            {formatCompact(series[key].finalValue, currency)}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatCompact(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${Math.round(amount / 1000)}k ${currency}`;
  }
}
