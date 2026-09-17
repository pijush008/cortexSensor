/**
 * The "what is actually connected" banner printed once the dev server is up.
 *
 * Every line is a LIVE PROBE, never a reading of configuration. Printing
 * "Supabase ✓" because a connection string is present would be worse than
 * printing nothing: it states as fact the one thing the developer is trying to
 * find out. Where a dependency cannot be probed from here, the line says so
 * rather than guessing.
 *
 * Nothing is imported beyond the standard library — this runs before Next, in
 * plain Node, and a dev banner that needs its own install is a dev banner that
 * breaks on a clean checkout.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/**
 * Status marks: a tick, a cross and a bang, each inside a circle.
 *
 * Those are Nerd Font glyphs (Font Awesome's check-circle, times-circle and
 * exclamation-circle) in the Private Use Area, so they need a Nerd Font or
 * FontAwesome in the terminal — which is what a p10k/Starship setup has. A
 * terminal without one draws an empty box instead; SHM_STATUS_PLAIN=1 switches
 * to the BMP characters every monospace font ships.
 */
const PLAIN = process.env.SHM_STATUS_PLAIN === "1";
const OK = `${GREEN}${PLAIN ? "✔" : "\uf058"}${RESET}`;
const BAD = `${RED}${PLAIN ? "✘" : "\uf057"}${RESET}`;
const MEH = `${YELLOW}${PLAIN ? "!" : "\uf06a"}${RESET}`;

/**
 * Next loads .env itself, but this runs before Next exists. Reading the two
 * keys we need by hand beats pulling in dotenv for a banner.
 */
function envFromFile(file, key) {
  try {
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith(`${key}=`));
    if (!line) return undefined;
    return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

async function probe(url, { timeout = 6000 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return { ok: res.ok, status: res.status, res };
  } catch (err) {
    return { ok: false, error: err.name === "TimeoutError" ? "timeout" : err.message };
  }
}

/**
 * A quick tunnel's hostname is handed out a few seconds BEFORE Cloudflare's
 * edge will route it: in that window a request fails outright or gets a 530
 * (error 1033, "tunnel not found"). Probing once at that moment reports a
 * healthy tunnel as broken, so keep asking for a while before believing a
 * failure. A success is believed immediately.
 */
async function probeSettled(url, { attempts = 8, delayMs = 1500 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await probe(url);
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

/** Turns a host into the name a person would use for it. */
function vendorOf(endpoint) {
  if (!endpoint) return null;
  const h = endpoint.toLowerCase();
  if (h.includes("supabase.co") || h.includes("supabase.com")) return "Supabase";
  if (h.includes("upstash.io")) return "Upstash";
  if (h.includes("neon.tech")) return "Neon";
  if (/^(localhost|127\.0\.0\.1|postgres|redis)\b/.test(h)) return "local";
  return null;
}

function line(mark, label, value, note) {
  const name = label.padEnd(11);
  const tail = note ? ` ${DIM}${note}${RESET}` : "";
  return `  ${mark} ${name} ${value}${tail}`;
}

export async function printStatus({ url, port }) {
  const root = process.cwd();
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    envFromFile(join(root, ".env"), "NEXT_PUBLIC_API_URL") ||
    "http://localhost:3001/api";
  // The API base usually ends in /api; health is mounted at the root too.
  const apiOrigin = new URL(apiUrl).origin;
  const engineUrl = process.env.SHM_ENGINE_URL || "http://localhost:8000";

  const [tunnel, local, ready, engine] = await Promise.all([
    probeSettled(url),
    probe(`http://127.0.0.1:${port}`),
    probe(`${apiOrigin}/ready`, { timeout: 8000 }),
    probe(`${engineUrl}/health`, { timeout: 4000 }),
  ]);

  const rows = [];

  rows.push(
    line(
      tunnel.ok ? OK : BAD,
      "Cloudflare",
      `${BOLD}${url}${RESET}`,
      tunnel.ok ? `HTTP ${tunnel.status}` : tunnel.error || `HTTP ${tunnel.status}`,
    ),
  );
  rows.push(
    line(local.ok ? OK : BAD, "Next", `http://127.0.0.1:${port}`, local.ok ? `HTTP ${local.status}` : local.error),
  );

  // The backend is the only thing that can speak authoritatively about the
  // database and Redis: it holds the credentials and the live connections. When
  // it is down those lines report that, rather than falling back to a
  // reachability check that would answer a different question.
  let body = null;
  if (ready.res) {
    try {
      body = await ready.res.json();
    } catch {
      body = null;
    }
  }

  if (!body) {
    rows.push(line(BAD, "Backend", apiOrigin, ready.error || `HTTP ${ready.status}`));
    for (const name of ["Supabase", "Redis"]) {
      rows.push(line(MEH, name, `${DIM}unknown${RESET}`, "backend offline"));
    }
  } else {
    const checks = body.checks || {};
    const detail = body.detail || {};
    const mark = (v) => (v === "ok" ? OK : v === "disabled" ? MEH : BAD);

    rows.push(
      line(
        body.status === "ready" ? OK : MEH,
        "Backend",
        apiOrigin,
        `HTTP ${ready.status} · ${body.status}`,
      ),
    );

    const dbVendor = vendorOf(detail.database);
    rows.push(
      line(
        mark(checks.database),
        dbVendor === "Supabase" ? "Supabase" : "Database",
        detail.database || `${DIM}?${RESET}`,
        dbVendor && dbVendor !== "Supabase" ? dbVendor : undefined,
      ),
    );

    const redisVendor = vendorOf(detail.redis);
    rows.push(
      line(
        mark(checks.redis),
        "Redis",
        detail.redis || `${DIM}not configured${RESET}`,
        redisVendor === "local" ? "local" : redisVendor || undefined,
      ),
    );

  }

  rows.push(
    line(
      engine.ok ? OK : MEH,
      "Engine",
      engineUrl,
      engine.ok ? `HTTP ${engine.status}` : "not running (docker compose up -d python-shm)",
    ),
  );

  const width = 68;
  console.log(`\n${DIM}${"─".repeat(width)}${RESET}`);
  console.log(`  ${BOLD}SHM dev${RESET}  ${DIM}services${RESET}\n`);
  console.log(rows.join("\n"));
  console.log(`${DIM}${"─".repeat(width)}${RESET}\n`);
}
