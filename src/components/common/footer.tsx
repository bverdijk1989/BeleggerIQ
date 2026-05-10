import type { Route } from "next";
import Link from "next/link";

/**
 * Globale footer — Privacy / Terms / Methodology / Status.
 *
 * Plakt onderaan de app-layout. Niet gebruikt op publieke (auth-loze)
 * pagina's want die hebben hun eigen footer.
 */
export function AppFooter() {
  return (
    <footer className="mt-12 border-t border-border/40 px-4 py-6 text-xs text-muted-foreground md:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p>
          © {new Date().getFullYear()} BeleggerIQ —{" "}
          <span className="text-muted-foreground/70">
            Informatief platform, geen beleggingsadvies.
          </span>
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href={"/privacy" as Route}
            className="hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Privacy
          </Link>
          <Link
            href={"/terms" as Route}
            className="hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Voorwaarden
          </Link>
          <Link
            href="/methodologie"
            className="hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Methodologie
          </Link>
          <Link
            href="/pricing"
            className="hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Prijzen
          </Link>
        </nav>
      </div>
    </footer>
  );
}
