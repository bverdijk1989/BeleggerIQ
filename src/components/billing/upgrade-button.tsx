"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BillingTier } from "@/types/profile";

interface Props {
  tier: BillingTier;
  defaultInterval?: "monthly" | "yearly";
  label: string;
}

/**
 * UpgradeButton — start een Stripe Checkout-sessie en redirect.
 *
 * Toont een interval-toggle (monthly/yearly) zodat de gebruiker de
 * korting van yearly direct ziet. Yearly is typisch ~20% goedkoper
 * dan 12×monthly.
 *
 * Bij `STRIPE_NOT_CONFIGURED` (503-response): toon "Binnenkort beschikbaar"-
 * fallback in plaats van een dead-link.
 */
export function UpgradeButton({ tier, defaultInterval = "monthly", label }: Props) {
  const [interval, setInterval] = useState<"monthly" | "yearly">(
    defaultInterval,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);

  function go() {
    setError(null);
    setComingSoon(false);
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, interval }),
        });
        if (res.status === 503) {
          setComingSoon(true);
          return;
        }
        const body = await res.json();
        if (!res.ok || !body.url) {
          setError(body.error ?? "Kon checkout niet starten.");
          return;
        }
        window.location.href = body.url;
      } catch {
        setError("Netwerkfout — probeer het opnieuw.");
      }
    });
  }

  if (comingSoon) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-center text-xs text-amber-200">
        Stripe wordt nog geconfigureerd. Binnenkort beschikbaar.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Factuur-interval"
        className="inline-flex gap-1 rounded-md border border-border/60 bg-surface/40 p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={interval === "monthly"}
          onClick={() => setInterval("monthly")}
          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            interval === "monthly"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Maandelijks
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={interval === "yearly"}
          onClick={() => setInterval("yearly")}
          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            interval === "yearly"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Jaarlijks <span className="text-emerald-400">−20%</span>
        </button>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={go}
        disabled={pending}
        className="w-full"
      >
        {pending ? "Bezig…" : label}
      </Button>
      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
