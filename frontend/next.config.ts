import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Optional isolated output directory (e.g. CI or when the default .next is
// controlled by another process): NEXT_DIST_DIR=/tmp/shm-next-build next build
if (process.env.NEXT_DIST_DIR) {
  nextConfig.distDir = process.env.NEXT_DIST_DIR;
}

export default nextConfig;
