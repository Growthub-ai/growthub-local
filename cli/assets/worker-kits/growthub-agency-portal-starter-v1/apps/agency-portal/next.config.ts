import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
