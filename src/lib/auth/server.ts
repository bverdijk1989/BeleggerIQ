import { cookies, headers } from "next/headers";

import { resolveUser, type AuthResolution, type RequestLike } from "./session";

/**
 * Server-component variant van `resolveUser`. Wraps de Next.js
 * `cookies()` + `headers()` helpers in de `RequestLike`-shape die de
 * resolver verwacht. Gebruik in RSC pages/layouts om de ingelogde user
 * op te halen; API routes gebruiken `resolveUser(request)` rechtstreeks.
 */
export async function resolveUserFromServer(): Promise<AuthResolution> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const adapter: RequestLike = {
    cookies: {
      get: (name) => {
        const c = cookieStore.get(name);
        return c ? { value: c.value } : undefined;
      },
    },
    headers: {
      get: (name) => headerStore.get(name),
    },
  };
  return resolveUser(adapter);
}
