"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  TimerReset,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requestMagicLink } from "@/lib/auth/actions";
import { requestPasswordLogin } from "@/lib/auth/password-actions";
import { cn } from "@/lib/utils";

type Mode = "password" | "magic-link";

type MagicLinkState =
  | { kind: "idle" }
  | { kind: "success" }
  | {
      kind: "error";
      reason: "INVALID_EMAIL" | "RATE_LIMITED" | "INTERNAL";
    };

type PasswordState =
  | { kind: "idle" }
  | {
      kind: "error";
      reason:
        | "INVALID_INPUT"
        | "RATE_LIMITED"
        | "INVALID_CREDENTIALS"
        | "INTERNAL";
    };

const MAGIC_LINK_ERROR_COPY: Record<
  "INVALID_EMAIL" | "RATE_LIMITED" | "INTERNAL",
  string
> = {
  INVALID_EMAIL: "Vul een geldig e-mailadres in.",
  RATE_LIMITED:
    "Te veel aanvragen — wacht een minuut en probeer het opnieuw.",
  INTERNAL: "Er ging iets mis. Probeer het later opnieuw.",
};

const PASSWORD_ERROR_COPY: Record<
  "INVALID_INPUT" | "RATE_LIMITED" | "INVALID_CREDENTIALS" | "INTERNAL",
  string
> = {
  INVALID_INPUT: "Vul je e-mailadres en wachtwoord in.",
  RATE_LIMITED:
    "Te veel pogingen — wacht een minuut en probeer het opnieuw.",
  INVALID_CREDENTIALS:
    "E-mailadres of wachtwoord klopt niet.",
  INTERNAL: "Er ging iets mis. Probeer het later opnieuw.",
};

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [magicLinkState, setMagicLinkState] = useState<MagicLinkState>({
    kind: "idle",
  });
  const [passwordState, setPasswordState] = useState<PasswordState>({
    kind: "idle",
  });
  const [pending, startTransition] = useTransition();

  function onSubmitPassword(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPasswordState({ kind: "idle" });
    startTransition(async () => {
      const result = await requestPasswordLogin({ email, password });
      if (result.ok) {
        // Server heeft cookie gezet — router-refresh om beveiligde
        // routes te kunnen openen.
        router.push("/dashboard");
        router.refresh();
      } else {
        setPasswordState({ kind: "error", reason: result.reason });
      }
    });
  }

  function onSubmitMagicLink(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMagicLinkState({ kind: "idle" });
    startTransition(async () => {
      const result = await requestMagicLink(email);
      if (result.ok) {
        setMagicLinkState({ kind: "success" });
      } else {
        setMagicLinkState({ kind: "error", reason: result.reason });
      }
    });
  }

  if (magicLinkState.kind === "success") {
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
        {/* Mode-switcher */}
        <div
          role="tablist"
          aria-label="Login-methode"
          className="inline-flex gap-1 rounded-md border border-border/60 bg-surface/40 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "password"}
            onClick={() => {
              setMode("password");
              setMagicLinkState({ kind: "idle" });
            }}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              mode === "password"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Wachtwoord
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "magic-link"}
            onClick={() => {
              setMode("magic-link");
              setPasswordState({ kind: "idle" });
            }}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              mode === "magic-link"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            E-mail-link
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={onSubmitPassword} className="space-y-3" noValidate>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                E-mailadres
              </span>
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/40 px-3 py-2 transition-colors focus-within:border-primary/60">
                <Mail
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
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

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Wachtwoord
              </span>
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/40 px-3 py-2 transition-colors focus-within:border-primary/60">
                <KeyRound
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Je wachtwoord"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"
                  }
                  className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </label>

            <Button
              type="submit"
              disabled={pending || email.length === 0 || password.length === 0}
              className="w-full"
            >
              {pending ? (
                <>
                  <TimerReset className="mr-2 h-4 w-4 animate-spin" />
                  Bezig…
                </>
              ) : (
                "Inloggen"
              )}
            </Button>

            {passwordState.kind === "error" && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200"
              >
                <TriangleAlert
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden
                />
                <span>{PASSWORD_ERROR_COPY[passwordState.reason]}</span>
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={onSubmitMagicLink} className="space-y-3" noValidate>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                E-mailadres
              </span>
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/40 px-3 py-2 transition-colors focus-within:border-primary/60">
                <Mail
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
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

            {magicLinkState.kind === "error" && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200"
              >
                <TriangleAlert
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden
                />
                <span>{MAGIC_LINK_ERROR_COPY[magicLinkState.reason]}</span>
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
