"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  resetAlertPreferencesAction,
  updateAlertPreferencesAction,
} from "@/lib/alerts/actions";
import {
  ALERT_CATALOG,
  ALERT_CATEGORY_LABELS,
} from "@/lib/alerts/catalog";
import type {
  AlertPreferences,
  AlertSeverity,
  AlertType,
} from "@/lib/alerts/index";
import { cn } from "@/lib/utils";

const SEVERITY_OPTIONS: AlertSeverity[] = ["INFO", "WARNING", "CRITICAL"];

interface Props {
  preferences: AlertPreferences;
}

export function AlertPreferencesForm({ preferences }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(type: AlertType) {
    startTransition(async () => {
      const current = preferences[type];
      await updateAlertPreferencesAction({
        patch: {
          [type]: { ...current, enabled: !current.enabled },
        } as Partial<Record<AlertType, AlertPreferences[AlertType]>>,
      });
      router.refresh();
    });
  }

  function setMinSeverity(type: AlertType, severity: AlertSeverity) {
    startTransition(async () => {
      const current = preferences[type];
      await updateAlertPreferencesAction({
        patch: {
          [type]: { ...current, minSeverity: severity },
        } as Partial<Record<AlertType, AlertPreferences[AlertType]>>,
      });
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      await resetAlertPreferencesAction();
      router.refresh();
    });
  }

  // Groepeer per categorie.
  type AlertDef = (typeof ALERT_CATALOG)[number];
  const byCategory: Record<string, AlertDef[]> = {};
  for (const def of ALERT_CATALOG) {
    const list = byCategory[def.category] ?? [];
    list.push(def);
    byCategory[def.category] = list;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reset} disabled={pending}>
          Reset naar defaults
        </Button>
      </div>

      {(Object.keys(byCategory) as Array<keyof typeof ALERT_CATEGORY_LABELS>).map(
        (cat) => (
          <div key={cat} className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {ALERT_CATEGORY_LABELS[cat]}
            </p>
            <div className="space-y-2">
              {byCategory[cat]!.map((def) => {
                const pref = preferences[def.type];
                const enabled = pref.enabled;
                return (
                  <div
                    key={def.type}
                    className={cn(
                      "rounded-md border p-3 transition-colors",
                      enabled
                        ? "border-border/60 bg-surface/40"
                        : "border-border/30 bg-muted/20 opacity-70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {def.label}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {def.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggle(def.type)}
                        disabled={pending}
                      >
                        {enabled ? (
                          <>
                            <Bell className="mr-1 h-3 w-3" aria-hidden />
                            Aan
                          </>
                        ) : (
                          <>
                            <BellOff className="mr-1 h-3 w-3" aria-hidden />
                            Uit
                          </>
                        )}
                      </Button>
                    </div>
                    {enabled && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground">
                          Min. severity:
                        </span>
                        {SEVERITY_OPTIONS.map((sev) => (
                          <button
                            key={sev}
                            type="button"
                            disabled={pending}
                            onClick={() => setMinSeverity(def.type, sev)}
                            className={cn(
                              "rounded-full border px-2 py-0.5 transition-colors",
                              pref.minSeverity === sev
                                ? "border-primary/60 bg-primary/10 text-primary"
                                : "border-border/40 text-muted-foreground hover:border-primary/30",
                            )}
                          >
                            {sev}
                          </button>
                        ))}
                        <Badge variant="outline" className="ml-auto text-[9px]">
                          Default {def.defaultSeverity}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
