import { Check, Star } from "lucide-react";

import { UpgradeButton } from "@/components/billing/upgrade-button";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { TierSwitcher } from "@/components/entitlements/tier-switcher";
import { Badge } from "@/components/ui/badge";
import { resolveUserFromServer } from "@/lib/auth";
import {
  FEATURE_CATALOG,
  TIER_CATALOG,
  TIER_RANK,
  resolveCurrentTier,
  type BillingTier,
  type FeatureCategory,
} from "@/lib/entitlements";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Pricing",
};

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  tracking: "Tracking & portefeuille",
  analytics: "Analytics & engines",
  ai: "AI laag",
  alerts: "Alerts & notificaties",
  advisor: "Advisor / Enterprise",
};

const ORDERED_CATEGORIES: FeatureCategory[] = [
  "tracking",
  "analytics",
  "ai",
  "alerts",
  "advisor",
];

export default async function PricingPage() {
  const auth = await resolveUserFromServer();
  const tierResult = auth.ok
    ? await resolveCurrentTier(auth.user.email)
    : { tier: "FREE" as BillingTier, overrideActive: false };

  const sortedTiers = [...TIER_CATALOG].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  // Groepeer features per categorie zodat de feature-tabel scanbaar is.
  const featuresByCategory = ORDERED_CATEGORIES.map((cat) => ({
    category: cat,
    features: FEATURE_CATALOG.filter((f) => f.category === cat),
  })).filter((g) => g.features.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Kies wat bij je past"
        description="Begin gratis. Schaal mee wanneer je portefeuille groeit. Annuleer wanneer je wilt — geen lock-in."
      />

      <Section
        title="Tiers"
        description="Vier niveaus, voorbereid op een natuurlijk groeipad. Advisor is op aanvraag beschikbaar."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {sortedTiers.map((t) => {
            const isCurrent = t.tier === tierResult.tier;
            const cheaper =
              TIER_RANK[t.tier] < TIER_RANK[tierResult.tier];
            return (
              <article
                key={t.tier}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-5 transition-colors",
                  t.highlight
                    ? "border-primary/60 bg-primary/5 shadow-premium"
                    : "border-border/60 bg-surface/40",
                  isCurrent && "ring-2 ring-primary/40",
                )}
              >
                <header className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground">
                      {t.label}
                    </h3>
                    {t.highlight && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-primary/40 bg-primary/10 text-[10px] text-primary"
                      >
                        <Star className="h-2.5 w-2.5" aria-hidden /> Aanrader
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t.tagline}
                  </p>
                </header>

                <div className="font-mono text-foreground">
                  {t.monthlyPriceEur === null ? (
                    <p className="text-2xl font-bold">Op aanvraag</p>
                  ) : t.monthlyPriceEur === 0 ? (
                    <p className="text-2xl font-bold">€0</p>
                  ) : (
                    <p>
                      <span className="text-2xl font-bold">
                        €{t.monthlyPriceEur.toFixed(2).replace(".", ",")}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">/mnd</span>
                    </p>
                  )}
                  {t.yearlyPriceEur !== null && t.yearlyPriceEur > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Of €{t.yearlyPriceEur} per jaar
                    </p>
                  )}
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.description}
                </p>

                <ul className="space-y-1.5 text-xs">
                  {FEATURE_CATALOG.filter((f) =>
                    f.availableIn.includes(t.tier),
                  )
                    .slice(0, 6)
                    .map((f) => (
                      <li
                        key={f.key}
                        className="flex items-start gap-1.5 text-foreground"
                      >
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                        <span>{f.label}</span>
                      </li>
                    ))}
                </ul>

                <div className="mt-auto pt-2">
                  {isCurrent ? (
                    <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary">
                      Huidige tier
                    </p>
                  ) : cheaper ? (
                    <p className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-center text-xs text-muted-foreground">
                      Lagere tier
                    </p>
                  ) : t.tier === "ADVISOR" || t.monthlyPriceEur === null ? (
                    <a
                      href="mailto:sales@beleggeriq.nl?subject=Advisor%20interesse"
                      className="block rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {t.ctaLabel}
                    </a>
                  ) : auth.ok ? (
                    <UpgradeButton tier={t.tier} label={t.ctaLabel} />
                  ) : (
                    <a
                      href="/login"
                      className="block rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Log in om te upgraden
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        title="Wat zit er in?"
        description="Volledige feature-vergelijking per tier. Hogere tiers stapelen niet automatisch — elke feature is expliciet."
      >
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-surface/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Feature</th>
                {sortedTiers.map((t) => (
                  <th
                    key={t.tier}
                    className={cn(
                      "px-3 py-2 text-center",
                      t.highlight && "text-primary",
                    )}
                  >
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featuresByCategory.map(({ category, features }) => (
                <Fragment key={category}>
                  <tr className="border-t border-border/60">
                    <td
                      colSpan={sortedTiers.length + 1}
                      className="bg-muted/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      {CATEGORY_LABELS[category]}
                    </td>
                  </tr>
                  {features.map((f) => (
                    <tr key={f.key} className="border-t border-border/40">
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium text-foreground">{f.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {f.description}
                        </p>
                      </td>
                      {sortedTiers.map((t) => {
                        const ok = f.availableIn.includes(t.tier);
                        const limit = f.limits?.[t.tier];
                        return (
                          <td
                            key={t.tier}
                            className="px-3 py-2 text-center text-foreground"
                          >
                            {ok ? (
                              limit !== undefined && limit !== null ? (
                                <span className="font-mono text-[11px]">
                                  tot {limit}
                                </span>
                              ) : (
                                <Check className="mx-auto h-4 w-4 text-emerald-400" />
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Tier-switcher alleen tonen wanneer dev-override actief is OF
          wanneer ENTITLEMENT_OVERRIDE_TIER expliciet aan staat. In
          productie (Stripe-checkout actief) is dit niet nodig. */}
      {auth.ok && (tierResult.overrideActive ||
        process.env.NODE_ENV !== "production") && (
        <Section
          title="Tier switcher (dev)"
          description="Voor ontwikkeling en QA: schakel je eigen tier zodat je het paywall-gedrag kunt zien."
        >
          <TierSwitcher
            current={tierResult.tier}
            overrideActive={tierResult.overrideActive}
          />
        </Section>
      )}
    </>
  );
}

function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
