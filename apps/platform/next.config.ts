import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Tell Turbopack that the root is 2 levels up (../../)
    // because we are in apps/platform
    root: path.resolve(process.cwd(), "../../"),
  },
};

export default nextConfig;