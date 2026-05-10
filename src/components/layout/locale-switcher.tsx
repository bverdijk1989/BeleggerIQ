"use client";

import { Globe } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setLocale } from "@/lib/i18n/actions";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  current: Locale;
}

const FLAGS: Record<Locale, string> = {
  nl: "🇳🇱",
  en: "🇬🇧",
};

const LABELS: Record<Locale, string> = {
  nl: "NL",
  en: "EN",
};

/**
 * Compact locale-switcher in de topbar. Cycle-toggle voor 2 locales
 * (NL/EN); bij meer dan 2 zou een dropdown beter zijn.
 *
 * **Geen URL-update** in de MVP — we schrijven alleen de cookie en
 * `router.refresh()` om server components te re-renderen met de nieuwe
 * resolveServerLocale. URL-routing (`/en/dashboard`) volgt later.
 */
export function LocaleSwitcher({ current }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const idx = SUPPORTED_LOCALES.indexOf(current);
    const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length] ?? "nl";
    startTransition(async () => {
      await setLocale(next);
      // Soft-refresh zodat server components opnieuw renderen met de
      // nieuwe locale. Geen volledige page-reload.
      if (typeof window !== "undefined") window.location.reload();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      aria-label={`Wissel taal naar ${LABELS[current === "nl" ? "en" : "nl"]}`}
      className={cn("gap-1.5", isPending && "opacity-60")}
    >
      <Globe className="h-3.5 w-3.5" />
      <span className="text-xs font-mono">
        {FLAGS[current]} {LABELS[current]}
      </span>
    </Button>
  );
}
