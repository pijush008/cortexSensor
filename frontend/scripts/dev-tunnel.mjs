/**
 * Start the dev server behind a Cloudflare tunnel, in one command.
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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { printStatus } from "./dev-status.mjs";

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
    shutdown(code ?? 1);
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
      console.error(`next exited (${code}); stopping the tunnel too.`);
      shutdown(code ?? 1);
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
