import { cn } from "@/lib/utils";

interface EmptyChartProps {
  /** Optionele hoogte; default matcht de chart-containers (360px). */
  height?: number | string;
  message?: string;
  className?: string;
}

/**
 * Lichtgewicht placeholder voor chart-containers zonder data. Houdt de
 * rest van de layout (titel + subtitle) intact, i.p.v. een volledige
 * `EmptyState` Card die boven/onder witruimte forceert.
 */
export function EmptyChart({
  height = 220,
  message = "Geen datapunten beschikbaar.",
  className,
}: EmptyChartProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full items-center justify-center rounded-md border border-dashed border-border/60 bg-surface/40 text-xs text-muted-foreground",
        className,
      )}
      style={{ height }}
    >
      {message}
    </div>
  );
}
