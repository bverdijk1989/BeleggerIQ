/**
 * Kleine client-side fetch helper zodat alle UI-componenten dezelfde
 * foutboodschap-afhandeling krijgen. Parst de body hoogstens één keer;
 * `Response.json()` kan anders niet twee keer gelezen worden.
 */

import type { ApiError } from "./errors";

export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  status: number;
  error: string;
  code?: string;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  init: Omit<RequestInit, "body" | "method"> = {},
): Promise<ApiResult<T> | ApiFailure> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error:
        err instanceof Error ? err.message : "Netwerkfout — geen verbinding.",
    };
  }

  const parsed = await readJson<unknown>(response);

  if (!response.ok) {
    const apiError = parsed as Partial<ApiError> | null;
    return {
      ok: false,
      status: response.status,
      error:
        (apiError && typeof apiError.error === "string"
          ? apiError.error
          : undefined) ?? `Onbekende fout (${response.status}).`,
      code:
        apiError && typeof apiError.code === "string" ? apiError.code : undefined,
    };
  }

  return { ok: true, data: parsed as T };
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
