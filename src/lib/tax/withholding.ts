/**
 * Withholding-rates per bronland (NL-resident perspectief).
 *
 * **DISCLAIMER.** Deze tarieven zijn een redelijke startwaarde voor
 * inschattingen — geen formeel belastingadvies. Verdragen wijzigen,
 * bijzondere situaties (REIT, MLP, ADR) kennen afwijkende tarieven, en
 * de daadwerkelijke verrekenbaarheid hangt af van persoonlijke
 * omstandigheden + Box 3 vs Box 1 vs Box 2 classificatie.
 *
 * Velden:
 *   - `defaultRate`     gangbaar inhoudings-% bij bronstaat (zonder verdrag)
 *   - `treatyRate`      inhoudings-% wanneer NL-verdrag wordt toegepast
 *                       (vaak via W-8BEN o.i.d.). 15% is een typische
 *                       benchmark voor portfolio-dividend.
 *   - `reclaimable`     het verschil tussen actueel ingehouden en
 *                       treatyRate dat je via verdrag terug kunt vragen.
 *                       Hier modelleren we 'em als (defaultRate - treatyRate)
 *                       wanneer dat positief is.
 *
 * Bron: NL belastingdienst overzichten verdragen + IBFD samenvatting
 * (high-level). Cross-check altijd met de daadwerkelijke broker-noten.
 */

export interface WithholdingRule {
  countryCode: string;
  /** Default bronstaat-tarief (geen verdrag toegepast). */
  defaultRate: number;
  /** Verdrags-tarief NL-resident (typisch 15% voor portfolio-dividend). */
  treatyRate: number;
  /** Korte note voor de UI. */
  note?: string;
}

const RULES: Record<string, WithholdingRule> = {
  NL: { countryCode: "NL", defaultRate: 0.15, treatyRate: 0.15, note: "NL-bron: dividendbelasting verrekenbaar in NL" },
  US: { countryCode: "US", defaultRate: 0.30, treatyRate: 0.15, note: "Verlaagd via W-8BEN" },
  DE: { countryCode: "DE", defaultRate: 0.26375, treatyRate: 0.15, note: "DE: 25% + 5,5% Soli; rest terugvragen" },
  FR: { countryCode: "FR", defaultRate: 0.30, treatyRate: 0.15, note: "FR-broker houdt 30% in; 15% terugvragen" },
  CH: { countryCode: "CH", defaultRate: 0.35, treatyRate: 0.15, note: "CH 35% verrekenbaar tot 15% via verdrag" },
  BE: { countryCode: "BE", defaultRate: 0.30, treatyRate: 0.15 },
  GB: { countryCode: "GB", defaultRate: 0.0, treatyRate: 0.0, note: "VK heft typisch geen withholding op dividenden" },
  IE: { countryCode: "IE", defaultRate: 0.25, treatyRate: 0.15, note: "Veel ETF-domiciles gebruiken IE — check fund-level" },
  LU: { countryCode: "LU", defaultRate: 0.15, treatyRate: 0.15 },
  CA: { countryCode: "CA", defaultRate: 0.25, treatyRate: 0.15 },
  IT: { countryCode: "IT", defaultRate: 0.26, treatyRate: 0.15 },
  ES: { countryCode: "ES", defaultRate: 0.19, treatyRate: 0.15 },
  PT: { countryCode: "PT", defaultRate: 0.25, treatyRate: 0.15 },
  SE: { countryCode: "SE", defaultRate: 0.30, treatyRate: 0.15 },
  NO: { countryCode: "NO", defaultRate: 0.25, treatyRate: 0.15 },
  DK: { countryCode: "DK", defaultRate: 0.27, treatyRate: 0.15 },
  FI: { countryCode: "FI", defaultRate: 0.30, treatyRate: 0.15 },
  AU: { countryCode: "AU", defaultRate: 0.30, treatyRate: 0.15, note: "Franked-dividend regels niet meegerekend" },
  JP: { countryCode: "JP", defaultRate: 0.20315, treatyRate: 0.15 },
  HK: { countryCode: "HK", defaultRate: 0.0, treatyRate: 0.0 },
};

const FALLBACK: WithholdingRule = {
  countryCode: "??",
  defaultRate: 0.15,
  treatyRate: 0.15,
};

export function withholdingRule(countryCode: string | null | undefined): WithholdingRule {
  if (!countryCode) return FALLBACK;
  return RULES[countryCode.toUpperCase()] ?? FALLBACK;
}

/**
 * Bereken het *theoretisch* terug te vragen bedrag — verschil tussen
 * actuele inhouding en het verdrags-tarief op de bruto-dividenduitkering.
 * Niet wat de gebruiker daadwerkelijk gaat krijgen, maar geeft een
 * eerste indicatie waar potentieel reclaim-werk te doen valt.
 *
 * Conventie:
 *   - `gross`   bruto-dividend in lokale currency
 *   - `withheld` daadwerkelijk ingehouden (uit broker-feed) — positief
 *   - return: max(0, withheld - gross × treatyRate)
 */
export function reclaimableAmount(
  countryCode: string | null,
  gross: number,
  withheld: number,
): number {
  const rule = withholdingRule(countryCode);
  const treaty = gross * rule.treatyRate;
  const diff = withheld - treaty;
  return diff > 0 ? diff : 0;
}
