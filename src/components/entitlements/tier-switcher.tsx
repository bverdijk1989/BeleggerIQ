"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { setBillingTierAction } from "@/lib/entitlements/actions";
import { TIER_CATALOG } from "@/lib/entitlements/catalog";
import type { BillingTier } from "@/lib/entitlements/types";
import { cn } from "@/lib/utils";

/**
 * TierSwitcher — dev-tool om je eigen billing-tier te kiezen.
 *
 * Identiek pattern als de UxModeSelector (M28). In productie wordt deze
 * vervangen door een Stripe-checkout-flow + webhook die de tier sync't.
 */

interface Props {
  current: BillingTier;
  overrideActive: boolean;
}

export function TierSwitcher({ current, overrideActive }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<BillingTier>(current);
  const [error, setError] = useState<string | null>(null);

  function pick(tier: BillingTier) {
    if (tier === selected || pending) return;
    setError(null);
    setSelected(tier);
    startTransition(async () => {
      const result = await setBillingTierAction({ tier });
      if (!result.ok) {
        setError(result.error ?? "Onbekende fout");
        setSelected(current);
        return;
      }
      router.refresh();
    });
  }

  const sorted = [...TIER_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3">
      {overrideActive && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          Env-override actief (`ENTITLEMENT_OVERRIDE_TIER`) — DB-tier wordt
          tijdens deze sessie genegeerd.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
        {sorted.map((t) => {
          const isActive = selected === t.tier;
          return (
            <button
              key={t.tier}
              type="button"
              onClick={() => pick(t.tier)}
              disabled={pending}
              className={cn(
                "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/40 bg-surface/40 hover:border-primary/30",
                pending && "opacity-60",
              )}
              aria-pressed={isActive}
            >
              <div className="flex w-full items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {t.label}
                </p>
                {isActive && (
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                )}
              </div>
              <Badge variant="outline" className="text-[10px]">
                {t.tagline}
              </Badge>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
