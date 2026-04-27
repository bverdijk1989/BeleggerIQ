"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Mail, TimerReset, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requestMagicLink } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | {
      kind: "error";
      reason: "INVALID_EMAIL" | "RATE_LIMITED" | "INTERNAL";
    };

const ERROR_COPY: Record<
  "INVALID_EMAIL" | "RATE_LIMITED" | "INTERNAL",
  string
> = {
  INVALID_EMAIL: "Vul een geldig e-mailadres in.",
  RATE_LIMITED:
    "Te veel aanvragen — wacht een minuut en probeer het opnieuw.",
  INTERNAL: "Er ging iets mis. Probeer het later opnieuw.",
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setState({ kind: "submitting" });
    startTransition(async () => {
      const result = await requestMagicLink(email);
      if (result.ok) {
        setState({ kind: "success" });
      } else {
        setState({ kind: "error", reason: result.reason });
      }
    });
  }

  if (state.kind === "success") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-start gap-3 p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Check je inbox.
            </p>
            <p className="text-xs text-muted-foreground">
              Als er een account bestaat voor <strong>{email}</strong>,
              ontvang je binnen enkele seconden een inloglink. Klik op de
              link in die e-mail om verder te gaan.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              E-mailadres
            </span>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/40 px-3 py-2 transition-colors focus-within:border-primary/60">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="jij@voorbeeld.nl"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
            </div>
          </label>

          <Button
            type="submit"
            disabled={pending || email.length === 0}
            className="w-full"
          >
            {pending ? (
              <>
                <TimerReset className="mr-2 h-4 w-4 animate-spin" />
                Bezig…
              </>
            ) : (
              "Stuur inloglink"
            )}
          </Button>
        </form>

        {state.kind === "error" && (
          <p
            className={cn(
              "flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200",
            )}
          >
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>{ERROR_COPY[state.reason]}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
