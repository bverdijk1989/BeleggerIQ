import { getGoogleOAuthConfig } from "@/lib/auth/google-oauth";

import { GoogleSignInButton } from "./google-sign-in-button";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Inloggen — BeleggerIQ",
};

/** User-facing foutmeldingen per error-code uit auth-redirects. */
const ERROR_MESSAGES: Record<string, string> = {
  "oauth-not-configured":
    "Google-login is op deze omgeving niet beschikbaar. Probeer de e-mail-inloglink hieronder.",
  "google-denied":
    "De Google-login werd geannuleerd. Probeer het opnieuw of gebruik de e-mail-link.",
  "missing-params": "Ongeldige callback-URL. Begin opnieuw via de inlogknop.",
  "invalid-state": "Beveiligings-token ongeldig of verlopen. Begin opnieuw.",
  "state-mismatch": "Beveiligings-token komt niet overeen. Begin opnieuw.",
  "token-exchange":
    "We konden de Google-login niet voltooien. Probeer het opnieuw.",
  userinfo: "We konden je Google-gegevens niet ophalen. Probeer opnieuw.",
  "email-not-verified":
    "Je Google-mailadres is niet geverifieerd. Verifieer 'em eerst bij Google.",
  "upsert-failed":
    "We konden je account niet aanmaken. Probeer het later opnieuw.",
  "session-config":
    "Server-configuratie-fout. Neem contact op met support.",
  expired: "Je inloglink is verlopen. Vraag een nieuwe aan hieronder.",
  used: "Deze inloglink is al gebruikt. Vraag een nieuwe aan hieronder.",
  already_used:
    "Deze inloglink is al gebruikt. Vraag een nieuwe aan hieronder.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const googleEnabled = getGoogleOAuthConfig() !== null;
  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ??
      "Inloggen is niet gelukt. Probeer opnieuw.")
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            BeleggerIQ 2.0
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Inloggen
          </h1>
          <p className="text-sm text-muted-foreground">
            Log in met Google of vraag een eenmalige inloglink aan op je
            e-mail. Geen wachtwoord nodig.
          </p>
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {errorMessage}
          </div>
        )}

        {googleEnabled && (
          <>
            <GoogleSignInButton />
            <div className="relative flex items-center gap-3">
              <span className="h-px flex-1 bg-border/60" aria-hidden />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                of
              </span>
              <span className="h-px flex-1 bg-border/60" aria-hidden />
            </div>
          </>
        )}

        <LoginForm />
        <p className="text-center text-[11px] text-muted-foreground">
          De link is 15 minuten geldig en werkt eenmalig. BeleggerIQ slaat
          geen wachtwoorden of leesbare tokens op.
        </p>
      </div>
    </main>
  );
}
