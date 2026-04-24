"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/http/client";

/**
 * Client-actie die `/api/snapshots/portfolio` aanroept. De route valt terug
 * op de primary portfolio van de demo-user als er geen `portfolioId` mee
 * wordt gestuurd. Na succes refreshen we de server-componenten zodat de
 * nieuwe snapshot in de historiek-charts verschijnt.
 */
export function SnapshotButton({ portfolioId }: { portfolioId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    setStatus("idle");
    setMessage(null);
    startTransition(async () => {
      const result = await postJson<{ snapshotId: string; portfolioId: string }>(
        "/api/snapshots/portfolio",
        portfolioId ? { portfolioId } : {},
      );
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setStatus("ok");
      setMessage("Snapshot opgeslagen.");
      router.refresh();
    });
  };

  const Icon = isPending ? Loader2 : status === "ok" ? Check : Camera;

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleClick}
        disabled={isPending}
        size="sm"
        variant="outline"
      >
        <Icon className={isPending ? "animate-spin" : undefined} />
        {isPending ? "Snapshotten…" : "Snapshot nu"}
      </Button>
      {message && (
        <p
          className={
            status === "error"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
