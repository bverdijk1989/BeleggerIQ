import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { matchesSessionUser, resolveUser } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import {
  expectObject,
  jsonError,
  jsonServerError,
  parseString,
  safeJson,
} from "@/lib/http";
import { snapshotPortfolio } from "@/lib/services/snapshot-service";

/**
 * POST /api/snapshots/portfolio
 *
 * Body (optioneel):
 * ```json
 * { "portfolioId": "pId" }
 * ```
 *
 * Auth: vereist een ingelogde user (zie `src/lib/auth/session.ts`). Als er
 * geen `portfolioId` wordt meegestuurd, valt de route terug op de primary
 * portfolio van de sessie-user. Cross-user snapshots zijn niet toegestaan:
 * de route verifieert dat de portfolio toebehoort aan de sessie-user.
 *
 * Retourneert `{ snapshotId, portfolioId }`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const body = expectObject(await safeJson(request));
    if (!body.ok) return jsonError(body.error, 400);

    const portfolioId = parseString(body.value.portfolioId, "portfolioId", {
      optional: true,
      minLength: 1,
      maxLength: 64,
    });
    if (!portfolioId.ok) return jsonError(portfolioId.error, 400);

    // We accepteren geen `userEmail` meer uit de body — dat gaf cross-user
    // risico. De sessie bepaalt wie snapshot'en mag.
    if ("userEmail" in body.value) {
      return jsonError(
        "`userEmail` is niet meer toegestaan; de sessie bepaalt de user.",
        400,
        "FORBIDDEN_FIELD",
      );
    }

    let resolvedPortfolioId = portfolioId.value;
    if (!resolvedPortfolioId) {
      const portfolio = await portfolioRepository.findPrimaryByEmail(
        auth.user.email,
      );
      if (!portfolio) {
        return jsonError(
          "Geen portefeuille gevonden voor deze user.",
          404,
          "PORTFOLIO_NOT_FOUND",
        );
      }
      resolvedPortfolioId = portfolio.id;
    } else {
      // Authorization check: de meegestuurde portfolioId moet van de user zijn.
      const ownership = await portfolioRepository.findOwnerEmailById(
        resolvedPortfolioId,
      );
      if (!ownership) {
        return jsonError(
          `Portfolio ${resolvedPortfolioId} bestaat niet.`,
          404,
          "PORTFOLIO_NOT_FOUND",
        );
      }
      if (!matchesSessionUser(auth.user, ownership)) {
        return jsonError(
          "Geen rechten voor deze portefeuille.",
          403,
          "FORBIDDEN",
        );
      }
    }

    const result = await snapshotPortfolio({ portfolioId: resolvedPortfolioId });
    if (!result) {
      return jsonError(
        `Portfolio ${resolvedPortfolioId} bestaat niet.`,
        404,
        "PORTFOLIO_NOT_FOUND",
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/portfolio");
    return NextResponse.json({
      snapshotId: result.snapshotId,
      portfolioId: resolvedPortfolioId,
    });
  } catch (error) {
    return jsonServerError(
      "api:snapshots:portfolio",
      error,
      "Kon snapshot niet aanmaken.",
    );
  }
}
