"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { markOnboardingComplete } from "../actions";

interface Props {
  /** Vertaalde "Klaar"-label uit de actieve locale. */
  label: string;
  /** Vertaalde "Klaar"-redirect-tekst (na succes). */
  redirectLabel: string;
}

export function CompleteButton({ label, redirectLabel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      const r = await markOnboardingComplete();
      if (r.ok) {
        router.push("/dashboard");
      } else {
        setError(r.message ?? "Onbekende fout.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={isPending} size="lg">
        <CheckCircle2 className="h-4 w-4" />
        {isPending ? redirectLabel : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
