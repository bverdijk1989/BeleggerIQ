"use client";

import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ExportActionsProps {
  csvContent: string;
  fileName: string;
}

export function ExportActions({ csvContent, fileName }: ExportActionsProps) {
  function handleDownload() {
    // Geen externe lib — een Blob + anchor-click is voldoende.
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    // De CSS `@media print` (in globals) zorgt voor een nette layout —
    // hier triggeren we 'em alleen.
    window.print();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={handleDownload}>
        <Download className="h-4 w-4" />
        CSV exporteren
      </Button>
      <Button variant="outline" size="sm" onClick={handlePrint}>
        <Printer className="h-4 w-4" />
        Print / PDF
      </Button>
    </div>
  );
}
