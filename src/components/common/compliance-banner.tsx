import { Info } from "lucide-react";

import { t, type Locale } from "@/lib/i18n";

/**
 * Globale compliance-banner — verschijnt op elke authenticated pagina
 * boven de inhoud. Doel: voorkomen dat de gebruiker de output van
 * BeleggerIQ aanziet voor formeel beleggings- of belastingadvies.
 *
 * Validation-board markeerde dit als blocker voor publieke launch
 * (Taleb/Marks-laag + Kahneman/Thaler-laag). Eén globale plek > 14
 * losse banners per pagina.
 *
 * Visueel bewust ingetogen — geen rode alarm-toon, geen popup. Een
 * subtiele info-bar bovenaan de main-area zodat 'em nooit afleidt
 * maar altijd aanwezig blijft (compliance + cognitive-priming).
 *
 * i18n-aware (M26): de banner-tekst leest van `compliance.body` in de
 * actieve locale. Defaults op NL.
 */
export function ComplianceBanner({ locale = "nl" }: { locale?: Locale }) {
  return (
    <div
      role="note"
      aria-label={t("compliance.title", locale)}
      className="flex items-start gap-2 rounded-md border border-border/60 bg-surface/40 px-3 py-2 text-[11px] text-muted-foreground"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p>{t("compliance.body", locale)}</p>
    </div>
  );
}
