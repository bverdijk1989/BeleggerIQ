"use client";

import { Cookie, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

const COOKIE_ACK_KEY = "biq_cookie_ack";
const COOKIE_ACK_VERSION = "1";

/**
 * Cookie-banner — functional-only acknowledgement.
 *
 * **Status**: we gebruiken alleen functionele cookies (sessie + locale +
 * deze acknowledgement). Wettelijk is een banner voor functional-only
 * niet verplicht maar wel transparant; de banner legt expliciet uit dat
 * er GEEN tracking/analytics-cookies zijn.
 *
 * Gebruikt `localStorage` ipv een server-side cookie zodat de banner
 * geen request-cycle nodig heeft. Dismiss is permanent (tot major
 * version-bump).
 */
export function CookieBanner() {
  const [dismissed, setDismissed] = useState(true); // safe-default tijdens SSR

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COOKIE_ACK_KEY);
      setDismissed(stored === COOKIE_ACK_VERSION);
    } catch {
      // localStorage geblokkeerd → toon banner; geen breaking failure
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(COOKIE_ACK_KEY, COOKIE_ACK_VERSION);
    } catch {
      /* swallow */
    }
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Cookie-melding"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-4 px-4 py-3 sm:items-center">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0" aria-hidden />
        <p className="flex-1 text-xs text-foreground">
          We gebruiken alleen functionele cookies (sessie + taalkeuze).{" "}
          <span className="text-muted-foreground">
            Geen tracking, geen advertenties, geen third-party-scripts.
          </span>{" "}
          <Link href={"/privacy" as Route} className="text-primary hover:underline">
            Lees meer
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Sluit cookie-melding"
          className="rounded-md border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Begrepen
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Sluit cookie-melding"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
