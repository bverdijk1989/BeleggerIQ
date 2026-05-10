import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Sparkles, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TONE_STYLES,
} from "@/components/dashboard/decision-cockpit/tone";
import {
  getTierDefinition,
} from "@/lib/entitlements/catalog";
import type {
  BillingTier,
  EntitlementCheck,
} from "@/lib/entitlements/types";
import { cn } from "@/lib/utils";

/**
 * PaywallCard — vervangt de inhoud van een blocked feature met een
 * uitleg + upgrade-CTA.
 *
 * UX: premium fintech — geen alarmistische "you can't access this" maar
 * "deze feature past bij Pro/Elite" met directe link naar /pricing en
 * een korte vergelijking met de gebruiker's huidige tier.
 */

interface Props {
  /** Feature-titel (bv. "Investment Confidence Score"). */
  featureLabel: string;
  /** 1-zin beschrijving van wat de feature doet. */
  description: string;
  /** Resultaat van `canUseFeature(...)`. */
  entitlement: EntitlementCheck;
  /** Optioneel: extra context-zin onder de upgrade-CTA. */
  bonusCopy?: string;
}

export function PaywallCard({
  featureLabel,
  description,
  entitlement,
  bonusCopy,
}: Props) {
  if (entitlement.allowed) {
    // Defensive: gebruikt zou deze component niet moeten renderen wanneer
    // de feature beschikbaar is. We tonen niets om geen ruis te veroorzaken.
    return null;
  }

  const upgradeTier = entitlement.upgradeOptions[0] ?? "PRO";
  const upgradeDef = getTierDefinition(upgradeTier);
  const styles = TONE_STYLES.neutral;

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {featureLabel}
          </CardTitle>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Star className="h-2.5 w-2.5" aria-hidden /> {upgradeDef.label}
          </Badge>
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-primary">
          <p className="flex items-center gap-1 font-semibold">
            <Sparkles className="h-3 w-3" aria-hidden /> Beschikbaar in {upgradeDef.label}
          </p>
          <p className="mt-1 text-foreground">{upgradeDef.description}</p>
          {upgradeDef.monthlyPriceEur !== null ? (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              vanaf €{upgradeDef.monthlyPriceEur.toFixed(2).replace(".", ",")}/maand
              {upgradeDef.yearlyPriceEur !== null && (
                <> · €{upgradeDef.yearlyPriceEur}/jaar</>
              )}
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Op aanvraag — neem contact op voor een gesprek.
            </p>
          )}
        </div>

        {bonusCopy && <p className="text-muted-foreground">{bonusCopy}</p>}

        <p className="text-[10px] text-muted-foreground">
          Huidige tier: <span className="font-semibold uppercase">{entitlement.tier}</span>
          {entitlement.overrideActive && (
            <span className="ml-1 text-amber-300">(dev override)</span>
          )}
        </p>

        <div className="flex items-center justify-end pt-1">
          <Link
            href={"/pricing" as Route}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            Bekijk pricing
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact upgrade-CTA — 1-regel banner voor binnen bestaande secties.
 *
 * Gebruik wanneer de hoofdcontent gewoon getoond mag worden maar je wel
 * wilt nudgen. Bv. "Wil je dit dagelijks i.p.v. wekelijks? → Upgrade".
 */
export function UpgradeCTA({
  message,
  upgradeTier,
}: {
  message: string;
  upgradeTier: BillingTier;
}) {
  const def = getTierDefinition(upgradeTier);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
      <p className="flex items-center gap-1 text-foreground">
        <Sparkles className="h-3 w-3 text-primary" aria-hidden />
        {message}
      </p>
      <Link
        href={"/pricing" as Route}
        className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
      >
        {def.ctaLabel}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
