import { ShieldAlert, Users } from "lucide-react";

import { ConsentCard } from "@/components/community/consent-card";
import { BenchmarkCard } from "@/components/community/benchmark-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { PaywallCard } from "@/components/entitlements/paywall-card";
import { resolveUserFromServer } from "@/lib/auth";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";
import { loadCommunityBenchmark } from "@/lib/community/loader";

export const metadata = {
  title: "Community benchmark",
};

export const dynamic = "force-dynamic";

/**
 * /community — Community Intelligence (M13).
 *
 * Privacy-first vergelijking met je cohort. Opt-in per scope; zonder
 * opt-in tonen we alleen het consent-formulier en het privacy-model.
 *
 * Topbelegger-laag:
 *  - Buffett: geen sociale-feed-prikkels, alleen sober vergelijken.
 *  - Dalio: focus op risico/spreiding-vergelijking.
 *  - Lynch: één-zin verdict per kaart.
 *  - Simons: aggregatie-bron + sample-size altijd zichtbaar.
 *  - Wood: opt-in datadeling = netwerk-effect (synthetic-baseline → real
 *    cohort zodra k bereikt is).
 */
export default async function CommunityPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Community"
          title="Community benchmark"
          description="Authenticatie vereist."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Niet ingelogd"
          description={auth.error}
        />
      </>
    );
  }

  // Entitlement: PRO+.
  const tierResult = await resolveCurrentTier(auth.user.email);
  const entitlement = canUseFeature(
    tierResult.tier,
    "community.benchmark",
    { overrideActive: tierResult.overrideActive },
  );
  if (!entitlement.allowed) {
    const feature = getFeature("community.benchmark")!;
    return (
      <>
        <PageHeader
          eyebrow="Community"
          title="Community benchmark"
          description="Vergelijk anoniem hoe je portefeuille zich verhoudt tot je cohort — zonder ooit tickers, namen of bedragen te delen."
        />
        <Section
          title="Beschikbaar in Pro"
          description="Privacy-first cohort-vergelijking met opt-in per scope."
        >
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={entitlement}
            bonusCopy="Aggregatie gebeurt op cohort-niveau (leeftijd × risicoprofiel × portfoliogrootte) met k-anonimiteit. Geen tickers, namen of bedragen verlaten je portefeuille."
          />
        </Section>
      </>
    );
  }

  const { report, consent, noPortfolio, notContributing } =
    await loadCommunityBenchmark({ userEmail: auth.user.email });

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Community benchmark"
        description="Vergelijk anoniem met je cohort. Privacy-first: opt-in per scope, geen tickers of bedragen worden gedeeld."
        actions={
          report ? (
            <Badge variant="outline" className="text-[10px]">
              Cohort: {report.cohort.age} · {report.cohort.risk} · {report.cohort.size}
            </Badge>
          ) : undefined
        }
      />

      {/* Privacy-first banner — altijd zichtbaar bovenaan */}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-xs text-primary-foreground/80">
        <p className="leading-relaxed">
          <span className="font-semibold text-foreground">Privacy-first.</span>{" "}
          Alleen scopes waar je expliciet opt-in op gaf, dragen bij aan
          aggregaten. Cohort-resultaten zijn pas zichtbaar bij minstens 25
          bijdragers; daaronder vergelijken we tegen een synthetische baseline
          (gelabeld als zodanig). Niets wat je portefeuille uniek herleidbaar
          maakt — geen tickers, geen namen, geen exacte bedragen — verlaat de
          server.
        </p>
      </div>

      {/* Consent-flow — altijd zichtbaar */}
      <Section
        title="Mijn deelname"
        description="Bepaal per categorie wat je anoniem wilt delen."
      >
        <ConsentCard consent={consent} />
      </Section>

      {/* Benchmark-resultaten */}
      {notContributing ? (
        <Section
          title="Vergelijking"
          description="Activeer minstens één scope hierboven om je cohort-vergelijking te zien."
        >
          <EmptyState
            icon={Users}
            title="Nog geen scope geactiveerd"
            description="Geef opt-in op één of meer categorieën om hier benchmarks te zien tegen je cohort."
          />
        </Section>
      ) : noPortfolio || !report ? (
        <Section
          title="Vergelijking"
          description="Maak een portefeuille aan om je benchmark te zien."
        >
          <EmptyState
            icon={Users}
            title="Geen portefeuille"
            description="Voeg eerst een portefeuille toe; we kunnen anders niets vergelijken."
          />
        </Section>
      ) : (
        <>
          {/* Attention-point — coachende kop */}
          {report.attentionPoint && report.attentionPoint.tone === "attention" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                Aandachtspunt
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {report.attentionPoint.label}
              </p>
              <p className="mt-1 text-xs text-amber-200/90">
                {report.attentionPoint.verdict}
              </p>
            </div>
          )}

          <Section
            title="Anonieme cohort-vergelijking"
            description={`Voor cohort ${report.cohort.age} · ${report.cohort.risk} · ${report.cohort.size}. ${report.activeScopes.length} scope(s) actief.`}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {report.comparisons.map((c) => (
                <BenchmarkCard key={c.scope} comparison={c} />
              ))}
            </div>
          </Section>

          <Section
            title="Hoe we hierop komen"
            description="Korte samenvatting van het privacy-model achter dit rapport."
          >
            <div className="rounded-md border border-border/60 bg-surface/30 p-4 text-xs text-muted-foreground">
              <p>{report.privacyNotice}</p>
              <p className="mt-2">
                Volledige methodologie:{" "}
                <a
                  href="/methodologie#community"
                  className="text-primary hover:underline"
                >
                  /methodologie
                </a>{" "}
                — sectie Community Privacy Model.
              </p>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
