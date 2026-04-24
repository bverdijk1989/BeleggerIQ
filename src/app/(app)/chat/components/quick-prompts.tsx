"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface QuickPromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

/**
 * Vijf vaste prompts die 1-op-1 mappen naar de engine-use-cases.
 * Klik = direct verzenden zodat de gebruiker geen onnodige extra stap heeft.
 */

const PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "Wat moet ik deze maand bijkopen?",
    prompt: "Wat moet ik deze maand bijkopen?",
  },
  {
    label: "Waar zit mijn grootste risico?",
    prompt: "Waar zit mijn grootste risico?",
  },
  {
    label: "Welke positie is te groot?",
    prompt: "Welke positie is te groot of fragiel geconcentreerd?",
  },
  {
    label: "Waarom is deze positie nog gezond geconcentreerd?",
    prompt: "Waarom is mijn grootste positie nog gezond geconcentreerd?",
  },
  {
    label: "Hoe defensief is mijn portfolio nu?",
    prompt: "Hoe defensief is de markt nu en wat betekent dit regime?",
  },
];

export function QuickPrompts({ onSelect, disabled }: QuickPromptsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Quick prompts
      </span>
      {PROMPTS.map((item) => (
        <Button
          key={item.label}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onSelect(item.prompt)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
