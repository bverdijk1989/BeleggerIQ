import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16: typedRoutes is uit `experimental` verhuisd naar top-level.
  typedRoutes: true,
};

export default nextConfig;
