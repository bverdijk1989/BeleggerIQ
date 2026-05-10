/**
 * Source-tracing helpers.
 *
 * Bouwt een lijst `SourceTrace`-objecten per domein. De UI toont 'em zodat
 * de gebruiker kan zien WELKE engines/bronnen gebruikt zijn voor de uitleg
 * — een audit-trail én een transparantie-indicator.
 */

import type { SourceTrace } from "./types";

export function trace(
  source: string,
  fields: string[],
  asOf?: string,
): SourceTrace {
  return { source, fields, asOf };
}

/** Dedupe op `source` — we groeperen velden van dezelfde engine. */
export function mergeTraces(traces: SourceTrace[]): SourceTrace[] {
  const bySource = new Map<string, SourceTrace>();
  for (const t of traces) {
    const existing = bySource.get(t.source);
    if (!existing) {
      bySource.set(t.source, {
        source: t.source,
        fields: [...t.fields],
        asOf: t.asOf,
      });
      continue;
    }
    for (const field of t.fields) {
      if (!existing.fields.includes(field)) existing.fields.push(field);
    }
    if (!existing.asOf && t.asOf) existing.asOf = t.asOf;
  }
  return [...bySource.values()];
}
