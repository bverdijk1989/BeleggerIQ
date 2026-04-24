import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "border-dashed bg-surface/40 shadow-none",
        className,
      )}
    >
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        {Icon && (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="max-w-md text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && <div className="pt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
