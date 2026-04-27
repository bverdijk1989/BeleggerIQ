import { NextResponse, type NextRequest } from "next/server";

import {
  isValidStatusTransition,
  type DecisionStatus,
} from "@/lib/analytics/decision-history";
import { resolveUserFromServer } from "@/lib/auth";
import { decisionHistoryRepository, prisma } from "@/lib/data";
import {
  expectObject,
  jsonError,
  jsonServerError,
  safeJson,
} from "@/lib/http";

/**
 * PATCH /api/decisions/[id]/status
 *
 * Body: `{ "status": "MARKED_DONE" | "IGNORED", "note"?: string }`.
 *
 * Updates de status van één DecisionSnapshot. Authenticatie verplicht;
 * users kunnen alleen hun eigen records muteren (repository checkt
 * `userId`).
 *
 * Geen broker-call, geen orderuitvoering — puur log van wat de
 * gebruiker zegt te hebben gedaan.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TARGETS: ReadonlySet<DecisionStatus> = new Set([
  "MARKED_DONE",
  "IGNORED",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return jsonError("Ongeldig record-id.", 400);
    }

    const auth = await resolveUserFromServer();
    if (!auth.ok) return jsonError(auth.error, 401);

    const raw = await safeJson(request);
    if (raw === undefined) return jsonError("Ongeldige JSON body.", 400);
    const body = expectObject(raw);
    if (!body.ok) return jsonError(body.error, 400);

    const status = body.value.status as DecisionStatus | undefined;
    if (!status || !VALID_TARGETS.has(status)) {
      return jsonError(
        "Status moet 'MARKED_DONE' of 'IGNORED' zijn.",
        400,
      );
    }

    // Email → userId lookup; auth-laag levert alleen email.
    const sessionUser = await prisma.user.findUnique({
      where: { email: auth.user.email },
      select: { id: true },
    });
    if (!sessionUser) return jsonError("Onbekende sessie-user.", 401);

    // Eigenaar-check: alleen eigen record mag muteren.
    const target = await decisionHistoryRepository.findById(id);
    if (!target) {
      return jsonError("Advies niet gevonden of verlopen.", 404);
    }
    const owner = await decisionHistoryRepository.resolveOwner(id);
    if (!owner || owner.userId !== sessionUser.id) {
      return jsonError("Geen toegang tot dit advies.", 403);
    }
    if (!isValidStatusTransition(target.status, status)) {
      return jsonError(
        `Transitie van '${target.status}' naar '${status}' niet toegestaan.`,
        409,
      );
    }

    const note =
      typeof body.value.note === "string" && body.value.note.length > 0
        ? body.value.note.slice(0, 500)
        : null;

    const updated = await decisionHistoryRepository.updateStatus({
      id,
      userId: sessionUser.id,
      status,
      note,
    });
    if (!updated) return jsonError("Advies niet gevonden.", 404);
    return NextResponse.json(updated);
  } catch (error) {
    return jsonServerError(
      "api:decisions:status",
      error,
      "Kon advies-status niet bijwerken.",
    );
  }
}
