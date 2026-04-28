"use client";

import type { Route } from "next";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Briefcase, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setActivePortfolio } from "@/lib/portfolios/actions";
import {
  ALL_PORTFOLIOS_KEYWORD,
  buildSwitchHref,
  resolveSelection,
  type PortfolioStub,
} from "@/lib/portfolios/selector";
import { cn } from "@/lib/utils";

interface Props {
  portfolios: PortfolioStub[];
  cookieValue: string | null;
}

export function PortfolioSwitcherClient({ portfolios, cookieValue }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const urlParam = searchParams?.get("p");
  const selection = resolveSelection({
    available: portfolios,
    urlParam,
    cookieValue,
  });

  const activeLabel =
    selection.kind === "all"
      ? "Alle portefeuilles"
      : selection.kind === "single"
      ? portfolios.find((p) => p.id === selection.portfolioId)?.name ?? "—"
      : "—";

  function navigate(target: string) {
    setOpen(false);
    const href = buildSwitchHref(
      pathname,
      searchParams?.toString() ?? "",
      target,
    );
    // 1) URL bijwerken (deelbaar, browser-back)
    router.push(href as Route);
    // 2) Cookie zetten zodat directe navigatie zonder ?p= ook
    //    de juiste keuze onthoudt.
    startTransition(() => {
      void setActivePortfolio(target);
    });
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="gap-1.5"
      >
        {selection.kind === "all" ? (
          <Layers className="h-4 w-4" />
        ) : (
          <Briefcase className="h-4 w-4" />
        )}
        <span className="max-w-[160px] truncate">{activeLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </Button>

      {open && (
        <>
          {/* Click-away overlay */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-md border border-border/60 bg-surface shadow-lg"
          >
            <button
              type="button"
              role="option"
              aria-selected={selection.kind === "all"}
              onClick={() => navigate(ALL_PORTFOLIOS_KEYWORD)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-elevated",
                selection.kind === "all" && "bg-surface-elevated font-medium",
              )}
            >
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Alle portefeuilles</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                aggregaat
              </span>
            </button>
            <div className="border-t border-border/40" />
            {portfolios.map((p) => {
              const isActive =
                selection.kind === "single" && selection.portfolioId === p.id;
              return (
                <button
                  type="button"
                  role="option"
                  key={p.id}
                  aria-selected={isActive}
                  onClick={() => navigate(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-elevated",
                    isActive && "bg-surface-elevated font-medium",
                  )}
                >
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.isPrimary && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      primair
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
