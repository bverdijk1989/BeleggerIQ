import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  matchesSessionUser,
  resolveUser,
  signSessionCookie,
  verifySessionCookie,
  type AuthenticatedUser,
  type RequestLike,
} from "./session";

const SECRET = "test-secret-test-secret-test-secret-test-secret";
const ORIGINAL_ENV = { ...process.env };

function mockRequest(
  opts: {
    cookie?: string;
    header?: string;
  } = {},
): RequestLike {
  return {
    cookies: {
      get: (name) =>
        name === "biq_session" && opts.cookie
          ? { value: opts.cookie }
          : undefined,
    },
    headers: {
      get: (name) =>
        name.toLowerCase() === "x-beleggeriq-user" ? (opts.header ?? null) : null,
    },
  };
}

function setEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  // Reset naar "niets ingesteld" zodat elke test zelf zijn env opbouwt.
  setEnv({
    NODE_ENV: "test",
    BIQ_SESSION_SECRET: undefined,
    BIQ_ALLOW_DEMO_AUTH: undefined,
    DEMO_USER_EMAIL: undefined,
  });
});

afterEach(() => {
  // Restore original env zodat geen andere test beïnvloed wordt.
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("signSessionCookie + verifySessionCookie", () => {
  it("round-trip: signed cookie verifieert naar originele email", () => {
    const cookie = signSessionCookie("bart@example.com", SECRET);
    expect(verifySessionCookie(cookie, SECRET)).toBe("bart@example.com");
  });

  it("afgewezen cookie met verkeerd secret", () => {
    const cookie = signSessionCookie("bart@example.com", SECRET);
    expect(verifySessionCookie(cookie, "a-different-secret-a-different-secret")).toBeNull();
  });

  it("afgewezen cookie bij getampered payload", () => {
    const cookie = signSessionCookie("bart@example.com", SECRET);
    // Vervang email-deel door andere base64url zonder signature bij te werken.
    const parts = cookie.split(".");
    const tampered = `${Buffer.from("aanvaller@example.com", "utf8").toString("base64url")}.${parts[1]}`;
    expect(verifySessionCookie(tampered, SECRET)).toBeNull();
  });

  it("afgewezen cookie bij ongeldig formaat", () => {
    expect(verifySessionCookie("no-dot", SECRET)).toBeNull();
    expect(verifySessionCookie("", SECRET)).toBeNull();
    expect(verifySessionCookie("xxx.yyy", SECRET)).toBeNull();
  });

  it("signSessionCookie weigert ongeldige email", () => {
    expect(() => signSessionCookie("not-an-email", SECRET)).toThrow();
  });
});

describe("resolveUser — signed cookie pad", () => {
  it("accepteert een geldig signed cookie wanneer secret is gezet", () => {
    setEnv({ BIQ_SESSION_SECRET: SECRET });
    const cookie = signSessionCookie("bart@example.com", SECRET);
    const auth = resolveUser(mockRequest({ cookie }));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.user.email).toBe("bart@example.com");
      expect(auth.user.source).toBe("session-cookie");
    }
  });

  it("weigert een signed cookie zonder geconfigureerd secret", () => {
    const cookie = signSessionCookie("bart@example.com", SECRET);
    const auth = resolveUser(mockRequest({ cookie }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(403);
  });

  it("weigert een getampered cookie met 401", () => {
    setEnv({ BIQ_SESSION_SECRET: SECRET });
    const auth = resolveUser(mockRequest({ cookie: "bad.bad" }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });
});

describe("resolveUser — dev header pad", () => {
  it("accepteert dev header in NON-productie", () => {
    setEnv({ NODE_ENV: "development" });
    const auth = resolveUser(mockRequest({ header: "Tester@Example.com" }));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.user.email).toBe("tester@example.com");
      expect(auth.user.source).toBe("dev-header");
    }
  });

  it("negeert dev header in productie", () => {
    setEnv({ NODE_ENV: "production" });
    const auth = resolveUser(mockRequest({ header: "tester@example.com" }));
    expect(auth.ok).toBe(false);
  });

  it("weigert ongeldige email in dev header", () => {
    setEnv({ NODE_ENV: "development" });
    const auth = resolveUser(mockRequest({ header: "not-an-email" }));
    expect(auth.ok).toBe(false);
  });
});

describe("resolveUser — demo fallback", () => {
  it("accepteert demo email wanneer BIQ_ALLOW_DEMO_AUTH=true", () => {
    setEnv({
      BIQ_ALLOW_DEMO_AUTH: "true",
      DEMO_USER_EMAIL: "demo@beleggeriq.nl",
    });
    const auth = resolveUser(mockRequest());
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.user.email).toBe("demo@beleggeriq.nl");
      expect(auth.user.source).toBe("demo-fallback");
    }
  });

  it("weigert demo fallback wanneer BIQ_ALLOW_DEMO_AUTH niet is gezet", () => {
    const auth = resolveUser(mockRequest());
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });

  it("weigert demo fallback bij ongeldige DEMO_USER_EMAIL", () => {
    setEnv({
      BIQ_ALLOW_DEMO_AUTH: "true",
      DEMO_USER_EMAIL: "niet-een-email",
    });
    const auth = resolveUser(mockRequest());
    expect(auth.ok).toBe(false);
  });

  it("WEIGERT demo fallback in productie ook als BIQ_ALLOW_DEMO_AUTH=true (security-guard)", () => {
    setEnv({
      BIQ_ALLOW_DEMO_AUTH: "true",
      DEMO_USER_EMAIL: "demo@example.com",
      NODE_ENV: "production",
    });
    const auth = resolveUser(mockRequest());
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });
});

describe("matchesSessionUser", () => {
  const session: AuthenticatedUser = {
    email: "bart@example.com",
    source: "session-cookie",
  };

  it("true wanneer requestedEmail ontbreekt", () => {
    expect(matchesSessionUser(session)).toBe(true);
  });

  it("true bij case-insensitive match", () => {
    expect(matchesSessionUser(session, "BART@example.com")).toBe(true);
    expect(matchesSessionUser(session, " bart@example.com ")).toBe(true);
  });

  it("false bij verschillende email", () => {
    expect(matchesSessionUser(session, "aanvaller@example.com")).toBe(false);
  });
});
