import type { Route } from "next";
import Link from "next/link";

export const metadata = {
  title: "Algemene voorwaarden",
};

/**
 * /terms — publieke pagina (buiten /(app)/-group, zonder auth).
 *
 * **Status**: drafte versie — vóór commerciële launch advocaat-review
 * vereist. Deze tekst is een redelijke startset gebaseerd op publieke
 * AFM/MiFID-richtlijnen, NIET juridisch advies.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-foreground">
      <header className="border-b border-border/40 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          BeleggerIQ
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Algemene voorwaarden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Laatst bijgewerkt: 2026-05-10 · Versie 1
        </p>
      </header>

      <div className="prose prose-sm prose-invert mt-8 max-w-none space-y-6">
        <section className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">
          <strong>Concept-versie.</strong> Deze tekst is een startset gebaseerd
          op publieke richtlijnen. Voor commercieel gebruik dient een advocaat
          deze voorwaarden te reviewen. Tot dan: gebruik op eigen
          verantwoordelijkheid.
        </section>

        <section>
          <h2 className="text-xl font-semibold">1. Wie zijn wij?</h2>
          <p className="text-sm text-muted-foreground">
            BeleggerIQ is een beleggingsanalyse-platform. We bieden
            informatie, scores, scenario-analyses en uitleg over portefeuilles.
            We bieden GEEN beleggingsadvies, vermogensbeheer of executie van
            transacties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Geen beleggingsadvies</h2>
          <p className="text-sm text-muted-foreground">
            De getoonde data, scores, signalen, scenario-uitkomsten en
            AI-uitleg zijn uitsluitend informatief. Ze vormen geen
            beleggingsadvies, aanbeveling of aanbod. Rendementen uit het
            verleden bieden geen garantie voor de toekomst. Beleg met geld dat
            je kunt missen en pas je beslissingen aan jouw persoonlijke
            situatie en risicotolerantie aan.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Vergunning</h2>
          <p className="text-sm text-muted-foreground">
            BeleggerIQ heeft GEEN AFM-vergunning voor beleggingsadvies of
            vermogensbeheer onder de Wft. Het platform is alleen bedoeld voor
            informatieve doeleinden. Voor persoonlijk advies over jouw
            specifieke situatie: raadpleeg een vergunninghoudende
            beleggingsonderneming.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Modelresultaten</h2>
          <p className="text-sm text-muted-foreground">
            Scores, signaal-fusion, stress-test-uitkomsten en macro-regimes
            zijn modelresultaten. Werkelijke uitkomsten kunnen substantieel
            afwijken. Aannames per analyse zijn expliciet beschikbaar in de
            methodologie-sectie. We claimen geen voorspellende kracht.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Data-bronnen</h2>
          <p className="text-sm text-muted-foreground">
            Marktdata komt van externe providers (Yahoo Finance, Alpha
            Vantage, e.a.). We doen ons best om kwaliteit te borgen maar
            kunnen geen garantie geven op accuraatheid, volledigheid of
            tijdigheid. Bij hiaten markeren we de data-quality expliciet in de
            UI.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Aansprakelijkheid</h2>
          <p className="text-sm text-muted-foreground">
            Voor zover wettelijk toegestaan: BeleggerIQ is niet aansprakelijk
            voor schade die voortvloeit uit beslissingen genomen op basis van
            de informatie op het platform. Het platform is een hulpmiddel; de
            verantwoordelijkheid voor beleggingsbeslissingen blijft bij de
            gebruiker.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Accounts en betaling</h2>
          <p className="text-sm text-muted-foreground">
            Een gratis account is voldoende voor basisgebruik. Premium tiers
            (Pro / Elite / Advisor) worden afgerekend volgens de prijslijst op{" "}
            <Link href="/pricing" className="text-primary hover:underline">
              /pricing
            </Link>
            . Voor Advisor-accounts geldt een aparte overeenkomst per
            organisatie.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Wijzigingen</h2>
          <p className="text-sm text-muted-foreground">
            We kunnen deze voorwaarden aanpassen. Bij ingrijpende wijzigingen
            informeren we je per e-mail. De huidige versie staat altijd op
            deze pagina met datum.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. Toepasselijk recht</h2>
          <p className="text-sm text-muted-foreground">
            Op deze voorwaarden is Nederlands recht van toepassing. Geschillen
            worden voorgelegd aan de bevoegde rechter in Nederland.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. Contact</h2>
          <p className="text-sm text-muted-foreground">
            Voor vragen: support@beleggeriq.nl. Voor privacy-zaken:{" "}
            <Link href={"/privacy" as Route} className="text-primary hover:underline">
              privacy-pagina
            </Link>
            .
          </p>
        </section>
      </div>

      <footer className="mt-12 border-t border-border/40 pt-6 text-xs text-muted-foreground">
        <Link href="/" className="text-primary hover:underline">
          ← terug naar home
        </Link>
        {" · "}
        <Link href={"/privacy" as Route} className="text-primary hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link href="/methodologie" className="text-primary hover:underline">
          Methodologie
        </Link>
      </footer>
    </main>
  );
}
