"use client";

import { useCallback } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Module 33 — TrackEventButton.
 *
 * Wrapt een Link of button met fire-and-forget tracking-call naar
 * `/api/marketing/track`. Geen impact op navigatie als de call faalt.
 *
 * **Privacy**: alleen vaste event-key + optionele tier/source; geen
 * user-agent of fingerprint vanuit deze laag.
 */

interface TrackedLinkProps {
  href: string;
  event: string;
  tier?: string;
  source?: string;
  className?: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}

export function TrackedLink({
  href,
  event,
  tier,
  source,
  className,
  children,
  target,
  rel,
}: TrackedLinkProps) {
  const handleClick = useCallback(() => {
    // Fire-and-forget; geen await zodat navigatie onmiddellijk gebeurt.
    void fetch("/api/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, tier, source }),
      keepalive: true,
    }).catch(() => {});
  }, [event, tier, source]);

  return (
    <Link
      href={href as never}
      onClick={handleClick}
      className={cn(className)}
      target={target}
      rel={rel}
    >
      {children}
    </Link>
  );
}
