import { resolveUserFromServer } from "@/lib/auth";
import { prisma, portfolioRepository } from "@/lib/data";
import { cookies } from "next/headers";

import { SELECTION_COOKIE } from "@/lib/portfolios/selector";

import { PortfolioSwitcherClient } from "./portfolio-switcher-client";

/**
 * Server-component wrapper: laadt de portefeuilles van de actieve user
 * en stuurt 'em naar de client-side dropdown. Wordt geplaatst in de
 * top-bar; bij single-portfolio (of niet ingelogd) toont 'em niets
 * zodat de UX niet onnodig druk wordt.
 */
export async function PortfolioSwitcher() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return null;

  const user = await prisma.user.findUnique({
    where: { email: auth.user.email },
    select: { id: true },
  });
  if (!user) return null;

  const portfolios = await portfolioRepository.findByUserId(user.id);
  if (portfolios.length === 0) return null;

  // Single-portfolio user → geen extra UI-complexity. Acceptance-criterium.
  if (portfolios.length === 1) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SELECTION_COOKIE)?.value ?? null;

  return (
    <PortfolioSwitcherClient
      portfolios={portfolios.map((p) => ({
        id: p.id,
        name: p.name,
        isPrimary: p.isPrimary,
      }))}
      cookieValue={cookieValue}
    />
  );
}
