import { NextResponse, type NextRequest } from "next/server";

import { buildAssistantResponse } from "@/lib/ai/chat";
import { appendChatMessage } from "@/lib/ai/chat-memory";
import { resolveUser } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import {
  expectObject,
  jsonError,
  jsonServerError,
  parseString,
  safeJson,
} from "@/lib/http";
import type { ChatResponseBody } from "@/types/chat";

import { loadChatContext } from "@/app/(app)/chat/build-chat-context";

/**
 * POST /api/chat
 *
 * Request body:
 * ```json
 * {
 *   "message": "Waar zit mijn grootste risico?",
 *   "history": []  // optioneel, voor UI roundtrip; server rebouwt context zelf
 * }
 * ```
 *
 * Response: `ChatResponseBody` met de assistant-message én een verse
 * `ChatContext`-snapshot zodat de UI chips kan verversen.
 *
 * De server bouwt de context opnieuw per call — geen session-storage
 * nodig. Eventuele engine-fouten geven een kalme fallback in plaats
 * van een 500.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_MAX_LENGTH = 2_000;
const HISTORY_MAX_ITEMS = 40;

export async function POST(request: NextRequest) {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const raw = await safeJson(request);
    if (raw === undefined) {
      return jsonError("Ongeldige JSON body.", 400);
    }
    const body = expectObject(raw);
    if (!body.ok) return jsonError(body.error, 400);

    const message = parseString(body.value.message, "message", {
      minLength: 1,
      maxLength: MESSAGE_MAX_LENGTH,
    });
    if (!message.ok) return jsonError(message.error, 400);

    // History is optioneel; de server bouwt de context zelfstandig opnieuw,
    // dus we valideren alleen de shape om crashes te voorkomen.
    const historyRaw = body.value.history;
    if (historyRaw !== undefined && !Array.isArray(historyRaw)) {
      return jsonError("`history` moet een array zijn.", 400);
    }
    if (Array.isArray(historyRaw) && historyRaw.length > HISTORY_MAX_ITEMS) {
      return jsonError(
        `History mag maximaal ${HISTORY_MAX_ITEMS} entries bevatten.`,
        400,
      );
    }

    const loaded = await loadChatContext(auth.user.email);
    if (!loaded) {
      return jsonError(
        "Geen portefeuille gevonden — chat kan geen context laden.",
        404,
        "PORTFOLIO_NOT_FOUND",
      );
    }

    const response = buildAssistantResponse({
      message: message.value ?? "",
      view: loaded.view,
      plan: loaded.plan,
      regime: loaded.regime,
      ctx: loaded.ctx,
    });

    // Persisteer beide kanten van het gesprek (chat-memory). Failure
    // mag de response niet blokkeren — opslag is best-effort.
    void (async () => {
      try {
        const userCtx = await portfolioRepository.findUserContextByEmail(
          auth.user.email,
        );
        if (userCtx?.userId) {
          await appendChatMessage({
            userId: userCtx.userId,
            role: "user",
            content: message.value ?? "",
          });
          await appendChatMessage({
            userId: userCtx.userId,
            role: "assistant",
            content: response.content,
            intent: response.intent,
          });
        }
      } catch {
        /* swallow — niet kritisch */
      }
    })();

    const payload: ChatResponseBody = {
      message: response,
      context: loaded.ctx,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return jsonServerError(
      "api:chat",
      error,
      "Kon chat-antwoord niet genereren.",
    );
  }
}
