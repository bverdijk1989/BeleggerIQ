import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Coins,
  Compass,
  Crown,
  Database,
  HeartPulse,
  Layers,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TrackedLink } from "@/components/marketing/track-event-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveUserFromServer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BeleggerIQ — AI-beleggingscoach voor langetermijnbeleggers",
  description:
    "Maandelijks rust, inzicht en een concreet actieplan. Portfolio Health, AI-briefing, risico-analyse en maandbeslissing — voor Nederlandse langetermijnbeleggers.",
};

/**
 * Root page — Module 33.
 *
 * **Conditional rendering**:
 *  - Ingelogde gebruikers → redirect naar /dashboard (zelfde gedrag als voorheen)
 *  - Niet-ingelogde gebruikers → publieke landing-page met 10 secties
 *
 * **Buffett-toon**: vertrouwen, eenvoud, geen hype. Geen "10x je rendement",
 * geen percentage-claims, geen verzonnen koersdoelen.
 */
export default async function RootPage() {
  const auth = await resolveUserFromServer();
  if (auth.ok) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 md:py-16">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <DemoCardsSection />
        <ForWhoSection />
        <PricingTeaserSection />
        <TrustSection />
        <FaqSection />
        <AdvisorPilotSection />
        <FooterCta />
      </main>
      <MarketingFooter />
    </div>
  );
}

// ============================================================
//  Marketing chrome (header + footer)
// ============================================================

function MarketingHeader() {
  return (
    <header className="border-b border-border/40 bg-background/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href={"/" as never}
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          BeleggerIQ
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={"/pricing" as never}>Pricing</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={"/login" as never}>Inloggen</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={"/login" as never}>Begin gratis</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/40">
      <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">BeleggerIQ</p>
            <p className="mt-1">
              Portfolio-intelligentie voor langetermijnbeleggers.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Belangrijk</p>
            <p className="mt-1">
              BeleggerIQ is geen broker en geen vergunninghoudende
              beleggingsonderneming. We bieden informatie, geen persoonlijk
              financieel advies.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Links</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                <Link href={"/pricing" as never} className="hover:underline">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href={"/login" as never} className="hover:underline">
                  Inloggen
                </Link>
              </li>
              <li>
                <Link href={"/privacy" as never} className="hover:underline">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href={"/terms" as never} className="hover:underline">
                  Voorwaarden
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-[10px] text-muted-foreground/70">
          © {new Date().getFullYear()} BeleggerIQ. Informatie wordt zorgvuldig
          samengesteld maar is geen aanbod, geen aanbeveling en geen
          persoonlijk advies.
        </p>
      </div>
    </footer>
  );
}

// ============================================================
//  1. Hero
// ============================================================

function HeroSection() {
  return (
    <section className="space-y-6 py-8 md:py-12">
      <div className="space-y-3">
        <Badge variant="outline" className="text-[10px]">
          Voor Nederlandse langetermijnbeleggers
        </Badge>
        <h1 className="text-3xl font-semibold leading-tight text-foreground md:text-5xl">
          De AI-beleggingscoach die je{" "}
          <span className="text-primary">elke maand</span> rust, inzicht en
          een concreet actieplan geeft.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
          Geen koerstickers, geen hype, geen koopadvies. Wel: één plek die je
          portefeuille meet, je risico&apos;s signaleert en je maandelijkse
          beslissing helder maakt — zonder dat je elke dag hoeft te kijken.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <TrackedLink
            href="/login"
            event="landing_cta_hero_clicked"
            source="hero-primary"
          >
            <span className="flex items-center gap-2">
              Begin gratis
              <ArrowRight className="h-4 w-4" />
            </span>
          </TrackedLink>
        </Button>
        <Button asChild variant="outline" size="lg">
          <TrackedLink
            href="/pricing"
            event="landing_cta_pricing_clicked"
            source="hero-secondary"
          >
            Bekijk pricing
          </TrackedLink>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Geen creditcard nodig · Free tier · Geen broker — alleen
        intelligentie-laag boven je bestaande portfolio
      </p>
    </section>
  );
}

// ============================================================
//  2. Probleem
// ============================================================

function ProblemSection() {
  const issues = [
    "Tientallen tabs, dashboards en YouTube-influencers — maar geen helder weekoverzicht",
    "Risico's en concentratie blijven verstopt tot 't te laat is",
    "Maandelijkse beslissingen voelen als gokken in plaats van plan",
    "Drie portefeuilles bij drie brokers, geen geconsolideerd zicht",
    "AI-tools beloven veel, maar voelen als black-box met verzonnen feiten",
  ];
  return (
    <section className="space-y-6 border-t border-border/40 py-12">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Het probleem
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Beleggers verdrinken in data en twijfel.
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          De meeste long-term-beleggers maken niet te wéinig analyses — ze
          maken er teveel, ongericht. Resultaat: een gevoel van
          onzekerheid bij elke koersbeweging.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {issues.map((i, idx) => (
          <li
            key={idx}
            className="flex items-start gap-2 rounded-md border border-border/40 bg-surface/40 p-3 text-sm text-muted-foreground"
          >
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
//  3. Oplossing
// ============================================================

function SolutionSection() {
  const pillars = [
    {
      icon: HeartPulse,
      title: "Portfolio Health Score",
      body: "Eén cijfer 0–100 voor de gezondheid van je portefeuille — sectoren, factor-balans, risk-alignment, drawdown. Met uitleg per component.",
    },
    {
      icon: Brain,
      title: "AI-briefing per dag of week",
      body: "Een korte memo over wat er beweegt in jouw posities — niet de wereldnieuws-stream. Met source-tracing en guardrails tegen verzonnen feiten.",
    },
    {
      icon: Shield,
      title: "Risk Control Tower",
      body: "12 risicocategorieën in één scherm: concentratie, sector, regio, valuta, rente, macro, drawdown, vola, liquiditeit, datakwaliteit, crypto, behavioral.",
    },
    {
      icon: Target,
      title: "Concrete maandactie",
      body: "Elke maand: koop dit, trim dat, of houd vast — met onderliggende rationale en confidence-score. Geen koopadvies, wel een plan.",
    },
  ];
  return (
    <section className="space-y-6 border-t border-border/40 py-12">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          De oplossing
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Vier kernlagen die samen rust geven.
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Geen losse tools die je zelf moet samenvoegen. Eén platform dat
          deze lagen voor je orchestreert — met uitlegbare AI en harde
          guardrails.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {pillars.map((p, i) => (
          <Card key={i} className="border-border/60 bg-surface/40">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <p.icon className="h-4 w-4 text-primary" aria-hidden />
                {p.title}
              </p>
              <p className="text-xs text-muted-foreground">{p.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ============================================================
//  4. Demo cards
// ============================================================

function DemoCardsSection() {
  const demos = [
    {
      icon: BarChart3,
      title: "Health Score 76/100 · Grade B",
      caption:
        "Spreiding solide. Eén concentratie-flag op tech (43%). Stress-test toont -22% in recessie-scenario.",
    },
    {
      icon: TrendingUp,
      title: "Confidence MSFT: 78/100 · POSITIVE",
      caption:
        "Quality 82, valuation 65, momentum 70 — Buffett-laag aanwezig. Volg yield-curve voor regime-shift.",
    },
    {
      icon: Compass,
      title: "Maandbeslissing: koop 1 aandeel VWCE",
      caption:
        "Cash €450 beschikbaar. Sector-balans suggereert wereldspreiding. Geen actie op crypto deze maand.",
    },
    {
      icon: Layers,
      title: "Risk Control Tower: 8 groen, 2 oranje, 1 rood",
      caption:
        "Rood: concentratie ASML 22%. Oranje: vola, dividend safety. Bekijk per-categorie suggesties.",
    },
  ];
  return (
    <section className="space-y-6 border-t border-border/40 py-12">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Hoe ziet &apos;t eruit?
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Vier voorbeelden van wat je elke maand ziet.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {demos.map((d, i) => (
          <Card key={i} className="border-primary/20 bg-surface/60">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <d.icon className="h-4 w-4 text-primary" aria-hidden />
                {d.title}
              </p>
              <p className="text-xs text-muted-foreground">{d.caption}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                voorbeeld-output · illustratief
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ============================================================
//  5. Voor wie
// ============================================================

function ForWhoSection() {
  const personas = [
    {
      icon: Layers,
      title: "ETF-belegger",
      body: "Brede spreiding zonder dagelijkse aandacht? Health Score + maandactie houdt je op koers.",
    },
    {
      icon: Coins,
      title: "Dividendbelegger",
      body: "Dividend-kalender + DRIP-simulator + payout-ratio-veiligheid. Voor cash-flow-georiënteerde portefeuille.",
    },
    {
      icon: Wallet,
      title: "Aandelenbelegger",
      body: "Confidence-score per ticker, factor-analyse, Moat & Owner Earnings — voor wie zelf bedrijven kiest.",
    },
    {
      icon: Crown,
      title: "Gevorderd / Elite",
      body: "Signal Performance Lab, cross-asset correlatie-matrix, scenario-testing, CSV-export. Research-grade.",
    },
    {
      icon: Users,
      title: "Advisor",
      body: "Multi-client workspace, advisor-PDF-rapport per cliënt, audit-logging. White-label-ready.",
    },
  ];
  return (
    <section className="space-y-6 border-t border-border/40 py-12" id="for-who">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Voor wie
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          BeleggerIQ past bij vijf type beleggers.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {personas.map((p, i) => (
          <Card key={i} className="border-border/60 bg-surface/40">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <p.icon className="h-4 w-4 text-primary" aria-hidden />
                {p.title}
              </p>
              <p className="text-xs text-muted-foreground">{p.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ============================================================
//  6. Pricing teaser
// ============================================================

function PricingTeaserSection() {
  const tiers = [
    {
      name: "Free",
      price: "€0",
      desc: "10 posities, basis health, weekly briefing.",
      tone: "neutral",
    },
    {
      name: "Pro",
      price: "€9,95/m",
      desc: "Volledige Health Score, dagelijkse AI-briefing, behavioral coach.",
      tone: "highlight",
    },
    {
      name: "Elite",
      price: "€24,95/m",
      desc: "Signal Fusion, AI explainability, research-laag, scenario-analyse.",
      tone: "neutral",
    },
    {
      name: "Advisor",
      price: "Op aanvraag",
      desc: "Multi-client, white-label, advisor-PDF, audit.",
      tone: "neutral",
    },
  ];
  return (
    <section className="space-y-6 border-t border-border/40 py-12">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Pricing
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Eerlijk geprijsd — geen verborgen kosten.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t) => (
          <Card
            key={t.name}
            className={
              t.tone === "highlight"
                ? "border-primary/40 bg-primary/5"
                : "border-border/60"
            }
          >
            <CardContent className="space-y-2 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t.name}
              </p>
              <p className="font-mono text-lg font-bold text-foreground">
                {t.price}
              </p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button asChild variant="outline">
        <TrackedLink
          href="/pricing"
          event="landing_cta_pricing_clicked"
          source="pricing-teaser"
        >
          Volledig pricing-overzicht
        </TrackedLink>
      </Button>
    </section>
  );
}

// ============================================================
//  7. Trust
// ============================================================

function TrustSection() {
  return (
    <section className="space-y-6 border-t border-border/40 py-12">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Vertrouwen
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Wat we wel en niet zijn.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Wat we wel zijn
            </p>
            <ul className="space-y-1 text-xs text-emerald-100">
              <li>· Informatie- en intelligentie-laag boven je portfolio</li>
              <li>· Pure-function engines, deterministisch, testbaar</li>
              <li>
                · Uitlegbare AI met source-tracing en hallucination-guardrails
              </li>
              <li>· Privacy-by-default: geen 3rd-party tracking</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Wat we niet zijn
            </p>
            <ul className="space-y-1 text-xs text-rose-100">
              <li>· Geen broker en geen handelsplatform</li>
              <li>
                · Geen persoonlijk financieel advies (geen vergunninghoudende
                onderneming)
              </li>
              <li>· Geen koopaanbevelingen of koersdoelen</li>
              <li>· Geen rendementsgaranties</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ============================================================
//  8. CTA naar onboarding
// ============================================================

function FooterCta() {
  return (
    <section className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-6 md:p-10">
      <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
        Start vandaag — gratis en zonder creditcard.
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Voeg minimaal één positie toe en je krijgt direct je Health Score,
        risico-flags en eerste maandactie. Onboarding duurt ~3 minuten.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <TrackedLink
            href="/login"
            event="landing_cta_demo_clicked"
            source="footer-primary"
          >
            <span className="flex items-center gap-2">
              Begin gratis
              <ArrowRight className="h-4 w-4" />
            </span>
          </TrackedLink>
        </Button>
        <Button asChild variant="outline" size="lg">
          <TrackedLink
            href="/pricing"
            event="landing_cta_pricing_clicked"
            source="footer-secondary"
          >
            Bekijk pricing
          </TrackedLink>
        </Button>
      </div>
    </section>
  );
}

// ============================================================
//  9. FAQ
// ============================================================

function FaqSection() {
  const faqs = [
    {
      q: "Is BeleggerIQ een broker?",
      a: "Nee. Wij voeren geen transacties uit. We zijn een informatie- en analyse-laag bovenop je bestaande broker-account. Voor de daadwerkelijke koop/verkoop gebruik je je eigen broker.",
    },
    {
      q: "Geven jullie koopadvies?",
      a: "Nee. We geven inzicht — health scores, risico-flags, scenario-impact en een maandelijkse suggestie. De beslissing om wel of niet te kopen ligt altijd bij jezelf.",
    },
    {
      q: "Hoe gaan jullie om met mijn data?",
      a: "Privacy-by-default. We slaan geen 3rd-party tracking-cookies, geen Google Analytics. Je portfolio-data staat in een EU-database; conversion-events zijn anoniem en gehasht.",
    },
    {
      q: "Wat als de AI iets verkeerd zegt?",
      a: "Elk AI-uitvoer doorloopt guardrails die hallucinations, koersdoelen en niet-gebackte claims tegenhouden. Bij twijfel valt het systeem terug op deterministic uitleg, gegrond in feiten.",
    },
    {
      q: "Werkt dit voor mijn broker (DEGIRO/BUX/IBKR)?",
      a: "Ja. Je kunt je portefeuille handmatig invoeren of een DEGIRO-CSV importeren. Andere brokers via copy-paste of via de positie-toevoegen-flow.",
    },
    {
      q: "Wat kost het?",
      a: "Free voor 10 posities + basis-features. Pro €9,95/maand voor volledige Health Score + dagelijkse AI-briefing. Elite €24,95/maand voor Signal Fusion + research-laag. Advisor op aanvraag.",
    },
  ];
  return (
    <section className="space-y-6 border-t border-border/40 py-12" id="faq">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Veelgestelde vragen
        </p>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Antwoorden op wat je het vaakst hoort.
        </h2>
      </div>
      <div className="space-y-2">
        {faqs.map((f, i) => (
          <details
            key={i}
            className="rounded-md border border-border/40 bg-surface/40 p-3"
          >
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              {f.q}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ============================================================
//  10. Advisor pilot CTA
// ============================================================

function AdvisorPilotSection() {
  return (
    <section className="space-y-4 rounded-lg border border-border/60 bg-surface/40 p-6 md:p-10">
      <Badge variant="outline" className="text-[10px]">
        B2B Pilot
      </Badge>
      <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
        Beheer je meerdere klantportefeuilles?
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Advisor-pilot: multi-client workspace met audit-logging, PDF-rapport
        per cliënt, white-label-ready. We zoeken eerste 3-5 pilot-firma&apos;s
        voor co-development. Geen kant-en-klaar product — een pilot.
      </p>
      <Button asChild variant="outline" size="lg">
        <TrackedLink
          href="/login?next=/advisor"
          event="landing_cta_advisor_clicked"
          source="advisor-pilot"
        >
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Plan een pilot-gesprek
          </span>
        </TrackedLink>
      </Button>
    </section>
  );
}
