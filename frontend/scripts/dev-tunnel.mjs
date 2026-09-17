/**
 * Start the WHOLE development stack in one command.
 *
 * `npm run dev` brings up, in order: the container services (Postgres, Redis,
 * the analysis engine), the API, the Cloudflare tunnel, and Next — then prints
 * what actually connected. Starting only the web app left the console loading
 * against an API that was not running, which looks like a broken app rather
 * than a missing step.
 *
 * The containers are left running on exit. They are detached infrastructure,
 * slow to start and harmless to leave; `npm run services:down` stops them. The
 * processes this script spawns are killed with it.
 *
 * The ordering is the whole point. A quick tunnel's hostname is only known once
 * cloudflared has connected, and Next's dev server must be told that hostname
 * BEFORE it starts — it refuses to serve /_next/* to a host it was not told
 * about, and the browser then reloads the page endlessly while looking
 * perfectly healthy. So: tunnel first, read the hostname, then Next.
 *
 * Next is bound to 127.0.0.1 rather than every interface. The tunnel reaches it
 * over loopback, so nothing is lost — but the dev server stops being reachable
 * from other machines on the network, which is most of the point of putting it
 * behind Cloudflare.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { printStatus } from "./dev-status.mjs";

/** Repository root: frontend/scripts/ -> frontend/ -> repo. */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PORT = process.env.PORT || "3000";
const CLOUDFLARED =
  process.env.CLOUDFLARED_BIN || join(homedir(), ".local/bin/cloudflared");

if (!existsSync(CLOUDFLARED)) {
  console.error(
    `cloudflared not found at ${CLOUDFLARED}\n` +
      "Install it, or set CLOUDFLARED_BIN to its path:\n" +
      "  curl -L -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/.local/bin/cloudflared",
  );
  process.exit(1);
}

/** The port the API's `npm run dev` binds; see backend/src/config. */
const API_PORT = process.env.API_PORT || "3001";

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  /**
   * Signal the whole PROCESS GROUP, and follow up with SIGKILL.
   *
   * Two things defeated the polite version. `npx next dev` is a wrapper that
   * spawns the real server as a grandchild, so killing the child alone left
   * next-server holding port 3000 after the tunnel had gone. And SIGTERM on
   * its own was not enough: the wrapper does not pass it on promptly, so the
   * launcher exited while its group was still very much alive.
   *
   * Each child is spawned detached, so it leads its own group and `-pid`
   * reaches every descendant. SIGTERM first to let them close cleanly, then
   * SIGKILL for anything still holding the port.
   */
  const signalGroup = (signal) => {
    for (const c of children) {
      try {
        process.kill(-c.pid, signal);
      } catch {
        // already gone
      }
    }
  };

  signalGroup("SIGTERM");
  setTimeout(() => {
    signalGroup("SIGKILL");
    process.exit(code);
  }, 1500);
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown(0));

/** Resolves once something is listening, or false when the wait runs out. */
function waitForPort(port, host = "127.0.0.1", timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((done) => {
    const attempt = () => {
      const sock = createConnection({ port, host });
      const retry = () => {
        sock.destroy();
        if (Date.now() >= deadline) return done(false);
        setTimeout(attempt, 500);
      };
      sock.once("connect", () => { sock.end(); done(true); });
      sock.once("error", retry);
      sock.setTimeout(1500, retry);
    };
    attempt();
  });
}

// ── 0. Nothing else may already be on our ports ─────────────────────────────
//
// The usual way this fails: a previous `npm run dev` is still running in
// another terminal. Without this check the second run gets a long way — the
// containers come up, a NEW tunnel is created and announced — and only then
// does Next die with EADDRINUSE. Worse, the banner in between lies: the port
// check finds the OLD Next answering and probes the new tunnel before it is
// routable, so it prints "fetch failed" against a tunnel that was never the
// problem. Refuse up front, and say who is holding the port.
//
// The stale process is not killed here. It is not necessarily ours — port 3000
// is every framework's default — and it is not this script's place to shoot
// something another terminal is showing.
for (const [port, what] of [[PORT, "Next"], [API_PORT, "the API"]]) {
  if (await waitForPort(port, "127.0.0.1", 0)) {
    console.error(
      `Port ${port} is already in use, so ${what} cannot start.\n` +
        `${holderOf(port)}` +
        "Most likely a previous `npm run dev` is still running in another " +
        "terminal — stop it there with Ctrl-C, or kill the process above, " +
        "then run this again.",
    );
    process.exit(1);
  }
}

/** Best-effort "who has this port" for the error message. Linux only; fine. */
function holderOf(port) {
  try {
    const out = execFileSync("ss", ["-ltnpH", `sport = :${port}`], {
      encoding: "utf8",
      timeout: 2000,
    });
    const m = out.match(/users:\(\("([^"]+)",pid=(\d+)/);
    return m ? `  held by: ${m[1]} (pid ${m[2]})\n` : "";
  } catch {
    return "";
  }
}

// ── 1. Container services ───────────────────────────────────────────────────
// Postgres, Redis and the analysis engine. `up -d` is idempotent: already
// running is a no-op, so this costs nothing on the second run of the day.
console.log("Starting services (postgres, redis, engine)…");
const services = spawnSync(
  "docker",
  ["compose", "up", "-d", "postgres", "redis", "python-shm"],
  { cwd: REPO, stdio: "inherit" },
);
if (services.status !== 0) {
  console.error(
    "\ndocker compose failed. Is the Docker daemon running?\n" +
      "To start only the web app, without services or the API: " +
      "npm run dev:local",
  );
  process.exit(1);
}

if (!(await waitForPort(5432))) {
  console.error("Postgres did not accept connections within 60s.");
  process.exit(1);
}

// ── 2. The API ──────────────────────────────────────────────────────────────
console.log("Starting the API…");
const backend = spawn("npm", ["--prefix", "backend", "run", "dev"], {
  cwd: REPO,
  stdio: "inherit",
  detached: true,
  env: {
    ...process.env,
    // The gRPC client defaults to the container's /proto mount, which does not
    // exist when the API runs on the host.
    SHM_ENGINE_PROTO_PATH:
      process.env.SHM_ENGINE_PROTO_PATH ??
      join(REPO, "proto", "shm", "engine", "v1", "engine.proto"),
  },
});
children.push(backend);
backend.on("exit", (code) => {
  if (!shuttingDown) console.error(`the API exited (${code}).`);
});

console.log("Starting Cloudflare tunnel…");

const tunnel = spawn(
  CLOUDFLARED,
  ["tunnel", "--url", `http://localhost:${PORT}`, "--no-autoupdate"],
  { stdio: ["ignore", "pipe", "pipe"], detached: true },
);
children.push(tunnel);

tunnel.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`cloudflared exited (${code}); stopping.`);
    shutdown(code || 1);
  }
});

let url = null;

function onTunnelOutput(chunk) {
  // The ASSIGNED hostname, not any trycloudflare address that appears in the
  // output. cloudflared logs its own control endpoint — api.trycloudflare.com —
  // while negotiating, and a looser pattern matched that first: the script then
  // announced a URL that was never a tunnel. Quick tunnels always get a
  // multi-word hostname, so requiring a hyphen excludes the control endpoint.
  const match = chunk
    .toString()
    .match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/);
  if (!match || url) return;

  url = match[0];
  const host = url.replace(/^https:\/\//, "");

  console.log("\nStarting Next…\n");

  const next = spawn(
    "npx",
    ["next", "dev", "--turbopack", "-H", "127.0.0.1", "-p", PORT],
    {
      stdio: "inherit",
      detached: true,
      env: { ...process.env, DEV_ALLOWED_ORIGINS: host },
    },
  );
  children.push(next);

  next.on("exit", (code) => {
    if (!shuttingDown) {
      // The npx wrapper reports 0 even when next-server died on EADDRINUSE,
      // so an unplanned exit is a failure whatever the code says.
      console.error(`next exited (${code}); stopping the tunnel too.`);
      shutdown(code || 1);
    }
  });

  // Next owns the terminal (stdio is inherited), so there is no output to watch
  // for readiness. Poll the port instead, then print the service banner once —
  // after compilation, so it lands at the bottom where it can be read rather
  // than scrolling away above Next's own startup noise.
  waitForNextThenReport();
}

async function waitForNextThenReport() {
  for (let i = 0; i < 120 && !shuttingDown; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}`, { signal: AbortSignal.timeout(2000) });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (shuttingDown) return;
  try {
    await printStatus({ url, port: PORT });
  } catch (err) {
    // A banner is a convenience. It must never be the reason a dev server dies.
    console.error(`(status banner failed: ${err.message})`);
  }
}

// cloudflared prints its banner to stderr; the hostname can appear in either.
tunnel.stdout.on("data", onTunnelOutput);
tunnel.stderr.on("data", onTunnelOutput);

// A tunnel that never reports a hostname is a hang, not a start; say so.
setTimeout(() => {
  if (!url) {
    console.error("No tunnel hostname after 60s. Check network access to Cloudflare.");
    shutdown(1);
  }
}, 60_000);
