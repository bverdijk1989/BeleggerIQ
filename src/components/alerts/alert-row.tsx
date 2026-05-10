"use client";

import { useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ExternalLink,
  Info,
  X,
} from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dismissAlertAction,
  markAlertReadAction,
  undismissAlertAction,
} from "@/lib/alerts/actions";
import { getAlertTypeDefinition } from "@/lib/alerts/catalog";
import type { Alert, AlertSeverity } from "@/lib/alerts/types";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<AlertSeverity, CockpitTone> = {
  INFO: "neutral",
  WARNING: "warning",
  CRITICAL: "critical",
};

const SEVERITY_ICON: Record<AlertSeverity, typeof Info> = {
  INFO: Info,
  WARNING: AlertCircle,
  CRITICAL: AlertTriangle,
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  INFO: "Info",
  WARNING: "Aandacht",
  CRITICAL: "Kritiek",
};

interface Props {
  alert: Alert;
}

export function AlertRow({ alert }: Props) {
  const tone = SEVERITY_TONE[alert.severity];
  const styles = TONE_STYLES[tone];
  const Icon = SEVERITY_ICON[alert.severity];
  const typeDef = getAlertTypeDefinition(alert.type);
  const [pending, startTransition] = useTransition();

  function onClickRead() {
    if (alert.status === "READ") return;
    startTransition(async () => {
      await markAlertReadAction({ alertId: alert.id });
    });
  }

  function onDismiss() {
    startTransition(async () => {
      if (alert.status === "DISMISSED") {
        await undismissAlertAction({ alertId: alert.id });
      } else {
        await dismissAlertAction({ alertId: alert.id });
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-md border p-4 transition-colors",
        styles.container,
        alert.status === "DISMISSED" && "opacity-60",
        alert.status === "UNREAD" && "border-l-4 border-l-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className={cn("h-4 w-4 shrink-0", styles.iconFg)} aria-hidden />
            <h4 className="text-sm font-semibold text-foreground">
              {alert.title}
            </h4>
            <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
              {SEVERITY_LABEL[alert.severity]}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {typeDef.label}
            </Badge>
            {alert.status === "UNREAD" && (
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/10 text-[10px] text-primary"
              >
                Nieuw
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {alert.body}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {new Date(alert.occurredAt).toLocaleString("nl-NL", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {alert.link && (
          <Button asChild size="sm" variant="outline" disabled={pending}>
            <a href={alert.link}>
              <ExternalLink className="mr-1 h-3 w-3" aria-hidden />
              Bekijk
            </a>
          </Button>
        )}
        {alert.status === "UNREAD" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onClickRead}
          >
            <Check className="mr-1 h-3 w-3" aria-hidden />
            Markeer als gelezen
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onDismiss}
        >
          <X className="mr-1 h-3 w-3" aria-hidden />
          {alert.status === "DISMISSED" ? "Activeer opnieuw" : "Negeer"}
        </Button>
      </div>
    </div>
  );
}
