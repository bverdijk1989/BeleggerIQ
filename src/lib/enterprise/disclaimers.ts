/**
 * Compliance-disclaimer-catalog.
 *
 * **Centrale bron-van-waarheid** voor alle juridisch-toonbare teksten
 * die we onder advisor-rapporten, white-label-exports of algemene
 * data-weergave plakken. Niet vermomd in component-strings — één
 * catalog die juridisch reviewbaar is en in één keer geüpdatet wordt.
 *
 * **Versie-veld**: bumpen wanneer een advocaat de tekst herziet zodat
 * we audit-bewijs hebben "deze user kreeg disclaimer X versie Y te
 * zien op datum Z".
 *
 * **Niet juridisch advies**: deze teksten zijn een redelijke startset
 * o.b.v. publieke AFM/MiFID-richtlijnen. Voor productie-deployment in
 * een advisor-context HOORT er een advocaat overheen.
 */

import type { ComplianceDisclaimer, DisclaimerContext } from "./types";

export const DISCLAIMER_CATALOG: ReadonlyArray<ComplianceDisclaimer> = [
  // ============================================================
  //  Algemeen — data is informatief
  // ============================================================
  {
    context: "general.investment_data",
    jurisdiction: null,
    title: "Informatief karakter",
    body:
      "De getoonde data, scores en signalen zijn uitsluitend informatief en " +
      "vormen geen beleggingsadvies, aanbeveling of aanbod. Rendementen uit " +
      "het verleden bieden geen garantie voor de toekomst. Beleg met geld " +
      "dat je kunt missen en pas je beslissingen aan jouw persoonlijke " +
      "situatie en risicotolerantie aan.",
    version: 1,
  },

  // ============================================================
  //  Advisor-rapportage — algemeen
  // ============================================================
  {
    context: "advisor.report",
    jurisdiction: null,
    title: "Reikwijdte van dit rapport",
    body:
      "Dit rapport is opgesteld op basis van de op asOf-datum bekende posities " +
      "en marktdata. Marktbewegingen ná deze datum zijn niet verwerkt. De " +
      "analyses zijn modelresultaten — werkelijke uitkomsten kunnen substantieel " +
      "afwijken. Aanbevelingen zijn gebaseerd op signaal-aggregaten en niet op " +
      "een persoonlijke geschiktheidstoets.",
    version: 1,
  },

  // ============================================================
  //  Advisor-aanbevelingen — striktere taal
  // ============================================================
  {
    context: "advisor.recommendation",
    jurisdiction: null,
    title: "Status van aanbevelingen",
    body:
      "Aanbevelingen in dit rapport zijn signalen uit een gestandaardiseerd " +
      "model. Voor een gepersonaliseerde belegingsbeslissing dient een " +
      "geschiktheidstoets en risico-acceptatie van de cliënt vooraf te zijn " +
      "vastgelegd. Bij twijfel raadpleeg een vergunninghoudende beleggings" +
      "onderneming.",
    version: 1,
  },

  // ============================================================
  //  Nederland — AFM-context
  // ============================================================
  {
    context: "advisor.report",
    jurisdiction: "NL",
    title: "AFM-toezicht & vergunningen",
    body:
      "Beleggingsadvies en vermogensbeheer in Nederland zijn vergunningplichtig " +
      "(Wft). Indien dit rapport wordt verspreid in het kader van een " +
      "adviesrelatie, dient de afzender over de juiste vergunning te beschikken " +
      "en de cliënt voorzien te zijn van de wettelijk vereiste pre-contractuele " +
      "informatie.",
    version: 1,
  },

  // ============================================================
  //  White-label footer — generiek
  // ============================================================
  {
    context: "white_label.footer",
    jurisdiction: null,
    title: "Verantwoordelijkheid",
    body:
      "De inhoud van dit rapport valt onder verantwoordelijkheid van de " +
      "uitgevende partij. Dit platform levert uitsluitend de technische " +
      "infrastructuur; eindredactie en juridische verantwoordelijkheid " +
      "rusten bij de afzender.",
    version: 1,
  },
];

/**
 * Selecteer de relevante disclaimers voor een rapport-context. Match
 * op `context` + jurisdictie (jurisdictie-specifieke EN -neutrale
 * teksten worden teruggegeven).
 */
export function selectDisclaimers(input: {
  contexts: ReadonlyArray<DisclaimerContext>;
  jurisdiction: string | null;
}): ReadonlyArray<ComplianceDisclaimer> {
  const out: ComplianceDisclaimer[] = [];
  for (const d of DISCLAIMER_CATALOG) {
    if (!input.contexts.includes(d.context)) continue;
    if (d.jurisdiction !== null && d.jurisdiction !== input.jurisdiction) continue;
    out.push(d);
  }
  return out;
}

/**
 * Render disclaimer als platte tekst-blok — voor PDF-generators die
 * een mono-toned section verwachten. Markdown-rendering kan in v2.
 */
export function renderDisclaimerBlock(
  disclaimers: ReadonlyArray<ComplianceDisclaimer>,
): string {
  return disclaimers
    .map((d) => `${d.title}\n${"-".repeat(d.title.length)}\n${d.body}`)
    .join("\n\n");
}
