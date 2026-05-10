"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UxMode } from "@/lib/ux-mode";
import { Sidebar } from "./sidebar";

interface Props {
  /** Actieve UX-mode — wordt doorgegeven aan de sidebar. */
  uxMode?: UxMode | null;
}

export function MobileNav({ uxMode }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigatie"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigatie</SheetTitle>
        <Sidebar
          className="h-full w-full border-r-0"
          onNavigate={() => setOpen(false)}
          uxMode={uxMode}
        />
      </SheetContent>
    </Sheet>
  );
}
