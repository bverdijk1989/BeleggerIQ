import { NextResponse } from "next/server";

import { log } from "@/lib/log";

/**
 * Shared API error-shape. Alle routes retourneren `{ error, code? }` zodat
 * de client één parser kan gebruiken. `code` is optioneel en bedoeld voor
 * stabiele UI-branching (i18n, retry-dialogen).
 */
export interface ApiError {
  error: string;
  code?: string;
}

export function jsonError(
  message: string,
  status: number = 400,
  code?: string,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    code ? { error: message, code } : { error: message },
    { status },
  );
}

/**
 * Fout-formatter voor server-side catches. Logt gestructureerd en
 * retourneert een generieke 500 zonder stack traces naar de client.
 */
export function jsonServerError(
  scope: string,
  error: unknown,
  message: string = "Onverwachte fout.",
): NextResponse<ApiError> {
  log.error(scope, "route handler threw", { error });
  return NextResponse.json<ApiError>(
    { error: message, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
