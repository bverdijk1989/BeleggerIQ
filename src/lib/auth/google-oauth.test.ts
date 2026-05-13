import { describe, expect, it } from "vitest";

import {
  buildAuthorizeUrl,
  buildStateToken,
  getGoogleOAuthConfig,
  verifyStateToken,
} from "./google-oauth";

describe("getGoogleOAuthConfig", () => {
  it("returnt null als GOOGLE_CLIENT_ID ontbreekt", () => {
    const orig = { ...process.env };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(getGoogleOAuthConfig()).toBeNull();
    process.env = orig;
  });

  it("bouwt config met redirectUri uit NEXT_PUBLIC_APP_URL", () => {
    const orig = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = "client-id-x";
    process.env.GOOGLE_CLIENT_SECRET = "secret-y";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
    const config = getGoogleOAuthConfig();
    expect(config).not.toBeNull();
    expect(config?.clientId).toBe("client-id-x");
    expect(config?.clientSecret).toBe("secret-y");
    expect(config?.redirectUri).toBe(
      "https://example.test/auth/google/callback",
    );
    process.env = orig;
  });

  it("strip trailing slash van NEXT_PUBLIC_APP_URL", () => {
    const orig = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = "c";
    process.env.GOOGLE_CLIENT_SECRET = "s";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test/";
    expect(getGoogleOAuthConfig()?.redirectUri).toBe(
      "https://example.test/auth/google/callback",
    );
    process.env = orig;
  });
});

describe("buildStateToken + verifyStateToken", () => {
  const secret = "x".repeat(32);

  it("round-trip: build → verify slaagt", () => {
    const { state, nonce } = buildStateToken(secret);
    const result = verifyStateToken(state, secret);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nonce).toBe(nonce);
      expect(result.issuedAt).toBeGreaterThan(0);
    }
  });

  it("tampered signature → bad_signature", () => {
    const { state } = buildStateToken(secret);
    const tampered = `${state.slice(0, -3)}xxx`;
    const result = verifyStateToken(tampered, secret);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("verkeerde secret → bad_signature", () => {
    const { state } = buildStateToken(secret);
    const result = verifyStateToken(state, "y".repeat(32));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("malformed state (geen 3 segmenten) → malformed", () => {
    const result = verifyStateToken("just-one-segment", secret);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("nonce is uniek over multiple builds", () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 50; i++) {
      nonces.add(buildStateToken(secret).nonce);
    }
    expect(nonces.size).toBe(50);
  });
});

describe("buildAuthorizeUrl", () => {
  const config = {
    clientId: "client-x",
    clientSecret: "secret-y",
    redirectUri: "https://example.test/auth/google/callback",
  };

  it("bevat alle verplichte OAuth-params", () => {
    const url = new URL(
      buildAuthorizeUrl({ config, state: "state-z" }),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-x");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.test/auth/google/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-z");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
  });

  it("forceer account-selectie via prompt=select_account", () => {
    const url = new URL(
      buildAuthorizeUrl({ config, state: "s" }),
    );
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });
});
