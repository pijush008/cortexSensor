import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Self-contained server output, for the container image.
   *
   * Without this a production image has to carry the whole node_modules tree —
   * hundreds of megabytes of build-time dependencies that never run. Standalone
   * emits .next/standalone with only the files the server actually reaches, so
   * the runtime stage copies that and nothing else.
   *
   * Ignored by `next dev`; it only changes what `next build` writes.
   */
  output: "standalone",

  /**
   * Hide the Next.js dev-tools badge.
   *
   * The small rounded square with a status dot that the dev server injects at
   * the corner of every page. It is not part of this app and never appears in a
   * production build, but it sits on top of the console's own chrome and reads
   * as one of its controls.
   */
  devIndicators: false,

  /**
   * Hosts allowed to load /_next/* from the DEV server.
   *
   * Next's dev server treats a request whose Host is not the one it is serving
   * on as cross-origin and refuses the dev assets. Reached through a tunnel
   * (cloudflared, ngrok) the HMR client then cannot hold its connection and the
   * dev runtime reloads the page over and over — which looks like the app
   * refreshing in a loop rather than like a configuration problem.
   *
   * Read from the environment rather than hardcoded: a quick tunnel gets a new
   * hostname every run, and a throwaway host does not belong in the repo.
   * Comma-separated, e.g.
   *   DEV_ALLOWED_ORIGINS=abc-def.trycloudflare.com npm run dev
   *
   * Dev only — `next build` ignores it.
   */
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),

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
