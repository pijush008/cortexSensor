import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * In production, a request reaches the application only through nginx.
 *
 * That is a deployment invariant rather than a preference: the app services
 * hold the database credentials and serve every authenticated route, and nginx
 * is where TLS terminates, where the security headers are added and where the
 * single X-Forwarded-For hop the rate limiter trusts is created. A service that
 * publishes its own port is reachable around all of it.
 *
 * The invariant is expressed in docker-compose.prod.yml by giving the app
 * services `expose` and nginx alone `ports`. Nothing stops a later edit from
 * adding `ports` to the backend "just to check something" and leaving it there,
 * and the result is silent: the stack works perfectly, and the API is simply
 * also answering the internet directly.
 *
 * It would not show up in a firewall either. Docker writes its own iptables
 * rules ahead of ufw's, so ufw reports such a port closed while it is serving.
 * A test is the only thing that notices.
 */

const COMPOSE = join(__dirname, "..", "..", "docker-compose.prod.yml");

interface ComposeFile {
  name?: string;
  services: Record<string, { ports?: unknown[]; expose?: unknown[] }>;
}

function compose(): ComposeFile {
  return parse(readFileSync(COMPOSE, "utf8")) as ComposeFile;
}

/** The one service allowed to accept traffic from outside the compose network. */
const PUBLIC_SERVICE = "nginx";

describe("the production deployment", () => {
  test("publishes ports from nginx and nothing else", () => {
    const { services } = compose();
    const publishing = Object.entries(services)
      .filter(([, s]) => Array.isArray(s.ports) && s.ports.length > 0)
      .map(([name]) => name);

    expect(
      publishing,
      "Only nginx may map a host port. A service listed here is reachable " +
        "directly, bypassing TLS, the security headers and the proxy hop the " +
        "rate limiter counts on.",
    ).toEqual([PUBLIC_SERVICE]);
  });

  test("keeps the application services on expose only", () => {
    const { services } = compose();
    for (const [name, s] of Object.entries(services)) {
      if (name === PUBLIC_SERVICE) continue;
      expect(s.ports ?? [], `${name} must not publish a host port`).toEqual([]);
      expect(
        (s.expose ?? []).length,
        `${name} should declare its port with expose so nginx can reach it`,
      ).toBeGreaterThan(0);
    }
  });

  test("nginx terminates TLS and redirects plain HTTP", () => {
    const conf = readFileSync(
      join(__dirname, "..", "..", "nginx", "nginx.conf"),
      "utf8",
    );
    expect(conf, "port 443 must be served").toMatch(/listen\s+443\s+ssl/);
    expect(conf, "a certificate must be configured").toMatch(/ssl_certificate\s/);
    // Session cookies are issued with `secure: true` in production, and a
    // browser will not store a Secure cookie that arrived over http://. Serving
    // the app on port 80 therefore produces a login that returns 200 and does
    // not log anyone in.
    expect(conf, "port 80 must redirect rather than serve the app").toMatch(
      /return\s+301\s+https:/,
    );
    expect(conf, "deprecated TLS versions must stay disabled").toMatch(
      /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;/,
    );
  });

  test("runs as its own compose project", () => {
    // Without this, both files derive the project name from the directory and
    // produce containers with identical names. Starting production while a dev
    // container of that name exists reuses the dev one — which publishes 3000,
    // 3001, 8000, 50051, 5432 and 6379 on every interface.
    expect(
      compose().name,
      "docker-compose.prod.yml needs its own `name:` so its containers cannot " +
        "collide with the development stack's",
    ).toBeTruthy();
    expect(compose().name).not.toBe("shm");
  });
});
