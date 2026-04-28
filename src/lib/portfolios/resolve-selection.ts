import { cookies } from "next/headers";

import { prisma } from "@/lib/data";
import { portfolioRepository } from "@/lib/data";
import type { Portfolio } from "@/types/portfolio";

import {
  resolveSelection,
  SELECTION_COOKIE,
  type PortfolioStub,
  type Selection,
} from "./selector";

/**
 * Server-side resolver. Combineert:
 *
 *   1. De portefeuilles van de actieve user (Prisma)
 *   2. De `?p=` URL-param die de page binnen kreeg
 *   3. De `biq_portfolio_id` cookie (sticky preference)
 *
 * Levert óf een specifieke `Portfolio` (met holdings) óf een
 * `kind: "all"` aggregate-payload met de volledige set.
 *
 * **Belangrijk: dit is óók een security-laag.** We laden alleen
 * portefeuilles die aan de gegeven email-adres user toebehoren. Een
 * URL-param met een vreemde portfolioId zal nooit doorkomen — het
 * `available` array bevat 'em niet, dus de selector valt terug op de
 * primary. Cross-user-leak is daarmee onmogelijk via deze entry-point.
 */

export type ResolvedSelection =
  | {
      kind: "single";
      portfolio: Portfolio;
      available: PortfolioStub[];
      selection: Selection;
    }
  | {
      kind: "all";
      portfolios: Portfolio[];
      available: PortfolioStub[];
      selection: Selection;
    }
  | { kind: "empty"; available: []; selection: { kind: "empty" } };

export interface ResolveInput {
  email: string;
  searchParams?: { [key: string]: string | string[] | undefined } | undefined;
}

async function readCookieValue(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(SELECTION_COOKIE)?.value ?? null;
  } catch {
    // `cookies()` werkt alleen in een server-component / route-handler.
    // Bij gebruik vanuit een test of een ander context kan 'em throwen —
    // in dat geval is `null` correct (geen sticky-pref bekend).
    return null;
  }
}

function pickUrlParam(
  searchParams: ResolveInput["searchParams"],
): string | null {
  if (!searchParams) return null;
  const v = searchParams.p;
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export async function resolveActiveSelection(
  input: ResolveInput,
): Promise<ResolvedSelection> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (!user) {
    return { kind: "empty", available: [], selection: { kind: "empty" } };
  }

  // We laden alleen *mijn* portefeuilles. Dit is de security-grens.
  const all = await portfolioRepository.findByUserId(user.id);
  if (all.length === 0) {
    return { kind: "empty", available: [], selection: { kind: "empty" } };
  }

  const stubs: PortfolioStub[] = all.map((p) => ({
    id: p.id,
    name: p.name,
    isPrimary: p.isPrimary,
  }));

  const urlParam = pickUrlParam(input.searchParams);
  const cookieValue = await readCookieValue();

  const selection = resolveSelection({
    available: stubs,
    urlParam,
    cookieValue,
  });

  if (selection.kind === "all") {
    return { kind: "all", portfolios: all, available: stubs, selection };
  }
  if (selection.kind === "empty") {
    return { kind: "empty", available: [], selection };
  }

  const picked = all.find((p) => p.id === selection.portfolioId);
  if (!picked) {
    // Onmogelijk in theorie omdat selector alleen ids uit `available`
    // doorlaat — maar we vangen 'em alsnog af in plaats van te crashen.
    return {
      kind: "single",
      portfolio: all[0]!,
      available: stubs,
      selection: {
        kind: "single",
        portfolioId: all[0]!.id,
        source: "primary",
        isExplicit: false,
      },
    };
  }
  return {
    kind: "single",
    portfolio: picked,
    available: stubs,
    selection,
  };
}
