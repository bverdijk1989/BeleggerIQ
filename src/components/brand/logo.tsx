import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  compact?: boolean;
}

export function Logo({ className, compact = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary via-primary/80 to-primary/40 text-primary-foreground shadow-sm"
      >
        <span className="text-sm font-semibold tracking-tight">B</span>
      </div>
      {!compact && (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            BeleggerIQ
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Portfolio Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
