import type { Route } from "next";
import Link from "next/link";

export const metadata = {
  title: "Privacy & gegevensbescherming",
};

/**
 * /privacy — publieke pagina (buiten /(app)/-group, zonder auth).
 *
 * **Status**: drafte versie — vóór commerciële launch advocaat-review
 * vereist. Deze tekst is gebaseerd op AVG-richtlijnen + interne
 * privacy-architectuur (zie `docs/COMMUNITY_PRIVACY_MODEL.md`).
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-foreground">
      <header className="border-b border-border/40 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          BeleggerIQ
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Privacy & gegevensbescherming</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Laatst bijgewerkt: 2026-05-10 · Versie 1
        </p>
      </header>

      <div className="prose prose-sm prose-invert mt-8 max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold">1. Wie is verantwoordelijk?</h2>
          <p className="text-sm text-muted-foreground">
            BeleggerIQ is een Nederlandse beleggingsanalyse-platform.
            Verwerkingsverantwoordelijke is BeleggerIQ B.V. (KvK-nummer in te
            vullen). Voor vragen of verzoeken: privacy@beleggeriq.nl.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Welke gegevens verwerken we?</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>Account-gegevens: e-mailadres, naam (optioneel), aanmelddatum</li>
            <li>Portefeuille-gegevens: holdings, transacties, kostprijzen — door jou ingevoerd</li>
            <li>Voorkeursinstellingen: risicotolerantie, doelen, alert-configuratie</li>
            <li>Sessie-gegevens: HMAC-signed cookie voor authenticatie</li>
            <li>Operationele logs: IP-hash (geen ruwe IP), request-id voor debugging</li>
            <li>
              Optionele opt-in: anonieme cohort-bijdrage aan community-benchmark
              (alleen wanneer expliciet gegeven; zie{" "}
              <Link href="/community" className="text-primary hover:underline">
                /community
              </Link>
              )
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Wat doen we NIET?</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>Geen verkoop van gegevens aan derden</li>
            <li>Geen tracking-cookies of advertentie-pixels</li>
            <li>Geen gepersonaliseerde advertenties</li>
            <li>Geen ruwe e-mailadressen of IP-adressen in logs (PII-redactie)</li>
            <li>
              Geen tickers, namen of bedragen naar AI-providers buiten de scope
              van portefeuille-analyse die je expliciet activeert
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Jouw rechten (AVG)</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Recht op inzage</strong> (art. 15) — download je
              volledige data als JSON via de instellingen-pagina
            </li>
            <li>
              <strong>Recht op vergetelheid</strong> (art. 17) — verwijder je
              account met cascadering naar alle persoonlijke data
            </li>
            <li>
              <strong>Recht op rectificatie</strong> (art. 16) — wijzig je
              gegevens via de profielpagina
            </li>
            <li>
              <strong>Recht op bezwaar</strong> (art. 21) — trek opt-ins voor
              community-benchmark of nieuwsbrief in
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. AI-providers</h2>
          <p className="text-sm text-muted-foreground">
            We gebruiken externe AI-providers (Anthropic en/of OpenAI) voor de
            uitleg-laag van scores en briefings. Wat naar de provider gaat:
            geanonimiseerde portefeuille-statistieken (tickers + percentages
            voor de specifieke explanation; geen e-mail, naam, of exacte
            bedragen). Een AI-prompt-guard voorkomt dat PII per ongeluk in een
            prompt belandt.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Bewaartermijn</h2>
          <p className="text-sm text-muted-foreground">
            Account-data: zolang je account actief is + 90 dagen na delete voor
            compliance-trail (audit-log met geanonimiseerde verwijzing).
            Audit-logs: 12 maanden voor reguliere events, 5 jaar voor
            financial-tracing-events.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Cookies</h2>
          <p className="text-sm text-muted-foreground">
            We gebruiken alleen functionele cookies:
          </p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>
              <code className="rounded bg-surface/50 px-1 text-xs">
                biq_session
              </code>{" "}
              — HMAC-signed session-cookie (httpOnly, sameSite=Lax, 7 dagen)
            </li>
            <li>
              <code className="rounded bg-surface/50 px-1 text-xs">
                biq_locale
              </code>{" "}
              — taalkeuze (nl/en, 1 jaar)
            </li>
            <li>
              <code className="rounded bg-surface/50 px-1 text-xs">
                biq_cookie_ack
              </code>{" "}
              — bevestiging dat je deze tekst hebt gezien (1 jaar)
            </li>
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            Geen tracking, geen analytics-cookies, geen third-party-scripts.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Vragen of klachten</h2>
          <p className="text-sm text-muted-foreground">
            Voor privacy-vragen: privacy@beleggeriq.nl. Niet tevreden? Je hebt
            het recht een klacht in te dienen bij de Autoriteit
            Persoonsgegevens (autoriteitpersoonsgegevens.nl).
          </p>
        </section>
      </div>

      <footer className="mt-12 border-t border-border/40 pt-6 text-xs text-muted-foreground">
        <Link href="/" className="text-primary hover:underline">
          ← terug naar home
        </Link>
        {" · "}
        <Link href={"/terms" as Route} className="text-primary hover:underline">
          Algemene voorwaarden
        </Link>
        {" · "}
        <Link href="/methodologie" className="text-primary hover:underline">
          Methodologie
        </Link>
      </footer>
    </main>
  );
}
