import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Proxy the API through the Next server.
   *
   * The browser calls the API at the relative path `/api`, so it goes to
   * whatever origin served the page. Through nginx (port 80) that reaches the
   * backend. Opening the app on the Next dev server's own port did NOT — `/api`
   * matched no route there, Next answered with its 404 page, and sign-in failed
   * with a misleading error.
   *
   * These rewrites make the dev server self-sufficient: it forwards /api to the
   * backend itself, so the app works on whichever port it is opened on and the
   * question "which port?" stops mattering. nginx is unaffected — it proxies
   * /api before Next ever sees it.
   */
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:3001";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },
};

// Optional isolated output directory (e.g. CI or when the default .next is
// controlled by another process): NEXT_DIST_DIR=/tmp/shm-next-build next build
if (process.env.NEXT_DIST_DIR) {
  nextConfig.distDir = process.env.NEXT_DIST_DIR;
}

export default nextConfig;
