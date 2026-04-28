/**
 * Single source of truth voor de tax-disclaimer.
 *
 * Wordt zowel in de UI als in CSV-exports gebruikt zodat een gebruiker
 * (of accountant) die het rapport ge&iuml;soleerd ontvangt, niet kan
 * doen alsof BeleggerIQ formeel belastingadvies levert.
 *
 * Elke wijziging hieraan is een product-besluit, niet een visuele tweak —
 * dus altijd één plek.
 */

export const TAX_DISCLAIMER_TITLE =
  "Geen formeel belastingadvies";

export const TAX_DISCLAIMER_BODY =
  "BeleggerIQ levert een transparante samenvatting van peildatum-waarden, dividenden en bronbelasting op basis van je broker-historie. Dit is GEEN belastingadvies. Verdragen, verrekeningsregels en persoonlijke omstandigheden kunnen afwijken. Verifieer altijd met je accountant of de Belastingdienst voordat je gegevens overneemt in je aangifte.";

export const TAX_DISCLAIMER_SHORT =
  "Geen belastingadvies — verifieer altijd met een accountant of de Belastingdienst voor je aangifte.";
