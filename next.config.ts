import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. A lockfile in a parent directory (e.g. the user's
    // home folder) would otherwise make Turbopack pick the wrong root.
    root: import.meta.dirname,
  },
};

export default nextConfig;
