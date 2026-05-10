import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16: typedRoutes is uit `experimental` verhuisd naar top-level.
  typedRoutes: true,

  /**
   * Security-headers worden globaal toegepast op alle responses.
   * Bron-van-waarheid: `src/lib/security/headers.ts`. Hier alleen
   * het mappen naar het Next-shape.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
};

export default nextConfig;
