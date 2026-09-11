"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { describeError, type DescribedError } from "@/lib/errors";
import { Activity, Lock, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "login" | "forgot" | "sent";

/**
 * The measurement pipeline, described.
 *
 * This panel previously animated invented telemetry — "message_rate=412/s",
 * "strain_spike=38με", "battery=19%", "modal_drift=+0.42% Δt=+2.4°C". Those
 * are readings, and they came from nowhere. On a product that monitors bridges
 * and dams, a number that looks like a measurement but is not one is the most
 * dangerous thing the interface can print, and a sign-in page is no exception.
 *
 * It now names the stages of the pipeline instead. No values, so nothing here
 * can be mistaken for data.
 */
const PIPELINE = [
  "sensor        strain, vibration, displacement, temperature",
  "gateway       validate · timestamp · buffer when offline",
  "ingest        deduplicate · calibrate · flag data quality",
  "analysis      spectral estimation against a stored baseline",
  "alert         severity by rule, with the evidence attached",
];

/** Google's mark, inlined so the button needs no external request. */
function GoogleMark() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.2 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyLoginOtp } = useAuthStore();

  // Set once a platform operator has cleared the password step and a code has
  // been mailed. Until the code is accepted there is no session.
  const [otpUserId, setOtpUserId] = useState<number | null>(null);
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<DescribedError | null>(null);
  // Asked of the server rather than assumed, so the button never appears in a
  // deployment where it cannot work.
  const [googleAvailable, setGoogleAvailable] = useState(false);
  // Development builds show the control in a disabled state so it is visibly
  // present but unusable; production shows nothing at all.
  const showGoogleAsUnconfigured = process.env.NODE_ENV !== "production";
  const [loading, setLoading] = useState(false);
  const [streamHead, setStreamHead] = useState(0);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setStreamHead((h) => h + 1), 2200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api
      .get<{ data: { available: boolean } }>("/auth/google/status")
      .then(({ data }) => setGoogleAvailable(Boolean(data.data?.available)))
      // A failure here means no button, which is the safe direction.
      .catch(() => setGoogleAvailable(false));
  }, []);

  // Google redirects back here with a fixed reason code when it refuses. The
  // codes are mapped to text on THIS side; the server never sends prose through
  // the URL, so a crafted link cannot put arbitrary words on the page.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (!reason) return;

    const messages: Record<string, { title: string; description: string }> = {
      google_admin: {
        title: "Use your email and password",
        description:
          "That address belongs to an administrator account, which signs in with a password rather than through Google.",
      },
      google_unverified: {
        title: "Google hasn't verified that address",
        description:
          "Verify your email address with Google, then try again.",
      },
      google_cancelled: {
        title: "Sign-in cancelled",
        description: "You can try again, or sign in with your email and password.",
      },
      google_state: {
        title: "That sign-in attempt expired",
        description: "Start again from this page.",
      },
      google_unavailable: {
        title: "Google sign-in is unavailable",
        description: "Sign in with your email and password instead.",
      },
      google_failed: {
        title: "Google sign-in didn't complete",
        description: "Try again, or sign in with your email and password.",
      },
    };

    const known = messages[reason];
    if (known) {
      setError({ kind: "unauthorized", retryable: false, ...known });
    }
    // Clear it from the address bar so a refresh does not replay the message.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCursor((c) => !c), 900);
    return () => clearInterval(id);
  }, []);

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpUserId === null) return;
    setError(null);
    setLoading(true);
    try {
      await verifyLoginOtp(otpUserId, otp);
      router.push("/dashboard");
    } catch (err) {
      setError(describeError(err, { secondFactorAttempt: true }));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const outcome = await login(username, password);
      if (outcome.otpRequired) {
        // No session yet. The code decides whether one is issued.
        setOtpUserId(outcome.userId);
        setOtp("");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      // Routed through describeError so the user sees "Too many attempts,
      // try again shortly" rather than axios's raw "Request failed with
      // status code 429". Every other data surface already does this; the
      // sign-in form was the one that did not.
      //
      // Flagged as a credential attempt so a 401 reads "Incorrect email or
      // password" instead of "Your session has expired" — advice that makes no
      // sense on the page you sign in from.
      setError(describeError(err, { credentialAttempt: true }));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/forgotPassword", { username });
      // "sent", regardless of whether that address has an account. The server
      // answers identically either way so this screen cannot be used to
      // discover which addresses are registered, and the UI must not undo that
      // by reacting differently.
      setMode("sent");
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };



  const activePipeline = [0, 1, 2].map(
    (i) => PIPELINE[(streamHead - i + PIPELINE.length * 4) % PIPELINE.length],
  );

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left editorial panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        {/* The photograph, shown plainly. It previously sat at 22% opacity
            under a lavender gradient, a dot grid and a cyan blur — four
            layers of colour over a real structure. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/structures/cable-stayed.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/company-logo.png"
            alt="Cloudglance Sensinglab Pvt Ltd"
            className="h-9 w-auto object-contain"
          />
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.28em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            Console · v1.0
          </span>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 font-mono text-[0.6875rem] uppercase tracking-[0.24em] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            Structural monitoring
          </p>
          <h2 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            See damage before it becomes a defect.
          </h2>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/95 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            Continuous strain, vibration and deflection telemetry from every
            structure you manage — instrumented, analyzed, and acted upon.
          </p>

          {/* pipeline description — deliberately no values (see PIPELINE) */}
          <div className="mt-10 rounded-xl border border-shm-navy-900/12 bg-white/75 p-4 font-mono backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-shm-navy-700" />
              <span className="text-[0.5625rem] uppercase tracking-[0.2em] text-slate-600">
                Measurement pipeline · edge → cloud
              </span>
            </div>
            <div className="space-y-1.5">
              {activePipeline.map((line) => (
                <p
                  key={line}
                  className="anim-tick-in truncate text-[0.6875rem] leading-relaxed text-shm-navy-800"
                >
                  <span className="text-shm-green-text">➜</span> {line}
                </p>
              ))}
              <p className="text-[0.6875rem] text-shm-navy-800">
                <span className="text-shm-green-text">➜</span> engineer
                <span
                  className={cursor ? "text-shm-green-text" : "text-transparent"}
                >
                  _
                </span>
              </p>
            </div>
          </div>

          <div className="mt-10 flex gap-3">
            {[
              { icon: Activity, label: "Live telemetry" },
              { icon: ShieldCheck, label: "RBAC + audit" },
              { icon: Lock, label: "End-to-end TLS" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-lg border border-shm-navy-900/12 bg-white/60 px-3.5 py-2.5"
              >
                <Icon
                  className="h-4 w-4 text-shm-navy-700"
                  strokeWidth={1.75}
                />
                <span className="text-[0.75rem] text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative font-mono text-[0.6875rem] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
          © {new Date().getFullYear()} Cloudglance Sensinglab Pvt Ltd · All rights reserved
        </p>
      </div>

      {/* Right form panel */}
      <div className="relative flex w-full items-center justify-center p-6 sm:p-8 lg:w-1/2">
        <div
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(17,17,17,0.08) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="relative w-full max-w-md">
          <div className="mb-8 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/company-logo.png"
              alt="Cloudglance Sensinglab Pvt Ltd"
              className="h-8 w-auto"
            />
          </div>

          <Reveal>
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_-28px_rgba(17,17,17,0.35)] sm:p-8">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.24em] text-shm-navy-500">
                {mode === "login" ? "Access console" : "Account recovery"}
              </p>
              <h2 className="mt-2 text-[1.375rem] font-semibold tracking-tight text-slate-900">
                {mode === "login" && "Welcome back"}
                {mode === "forgot" && "Reset your password"}
                {mode === "sent" && "Check your email"}
              </h2>
              <p className="mt-1 text-[0.8125rem] text-slate-500">
                {mode === "login" && "Sign in to the monitoring console."}
                {mode === "forgot" &&
                  "Enter your email address and we'll send you a link to choose a new password."}
                {/* Worded so it is true whether or not that address has an
                    account. The server answers identically either way, and
                    saying "we've sent you a link" outright would give away
                    which addresses are registered. */}
                {mode === "sent" &&
                  "If that address has an account, a reset link is on its way. The link can be used once and expires in an hour."}
              </p>

              {error && (
                <div
                  className="anim-tick-in mt-5 rounded-lg border border-shm-red/20 bg-shm-red/5 px-3.5 py-2.5 text-[0.8125rem] text-shm-red"
                  role="alert"
                >
                  <p className="font-medium">{error.title}</p>
                  <p className="mt-0.5 text-shm-red/85">{error.description}</p>
                </div>
              )}

              {/* Second factor. Replaces the credential form entirely rather
                  than appearing beside it: the password step is finished, and
                  leaving those fields on screen invites re-submitting them. */}
              {otpUserId !== null ? (
                <form onSubmit={handleOtp} className="mt-6 space-y-4">
                  <p className="text-[0.8125rem] leading-relaxed text-slate-600">
                    A six-digit sign-in code has been emailed to{" "}
                    <span className="font-medium text-shm-navy-900">{username}</span>.
                    It expires in 10 minutes.
                  </p>
                  <Input
                    label="Sign-in code"
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || otp.length < 6}
                  >
                    {loading ? "Verifying…" : "Verify and sign in"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpUserId(null);
                      setOtp("");
                      setError(null);
                    }}
                    className="w-full text-[0.8125rem] text-slate-500 underline"
                  >
                    Use a different account
                  </button>
                </form>
              ) : (
              <form
                onSubmit={mode === "login" ? handleLogin : handleForgot}
                className="mt-6 space-y-4"
              >
                {(mode === "login" || mode === "forgot") && (
                  <Input
                    type="email"
                    label="Email"
                    placeholder="you@company.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                )}

                {mode === "login" && (
                  <Input
                    type="password"
                    label="Password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                )}

                {mode !== "sent" && (
                  <Button type="submit" className="w-full" size="lg" loading={loading}>
                    {mode === "login" ? "Sign in" : "Email me a reset link"}
                  </Button>
                )}
              </form>
              )}

              {/* Google sign-in, shown only when the server reports it is
                  configured. Offering a button that answers 503 would be worse
                  than not offering one. */}
              {otpUserId === null &&
                mode === "login" &&
                (googleAvailable || showGoogleAsUnconfigured) && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-slate-400">
                      or
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  {googleAvailable ? (
                    /* A full page navigation, not fetch: the OAuth flow needs
                       the browser to visit Google and come back with cookies. */
                    <a
                      href="/api/v1/auth/google"
                      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                    >
                      <GoogleMark />
                      Continue with Google
                    </a>
                  ) : (
                    <div
                      className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-400"
                      aria-disabled="true"
                      title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this"
                    >
                      <span className="opacity-40">
                        <GoogleMark />
                      </span>
                      Continue with Google
                    </div>
                  )}
                  <p className="mt-2 text-center text-[0.71875rem] text-slate-400">
                    {googleAvailable
                      ? "Signs you in as a standard user."
                      : "Not configured yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. (Shown in development only.)"}
                  </p>
                </>
              )}

              <div className="mt-6 space-y-2 text-center text-[0.8125rem]">
                {mode === "login" && (
                  <button
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                    }}
                    className="text-shm-navy-600 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
                {mode === "login" && (
                  <p className="text-slate-500">
                    New organization?{" "}
                    <Link
                      href="/register"
                      className="text-shm-navy-600 hover:underline"
                    >
                      Create an account
                    </Link>
                  </p>
                )}
                {(mode === "sent" || mode === "forgot") && (
                  <button
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    ← Back to login
                  </button>
                )}
              </div>
            </div>
          </Reveal>

          <p className="mt-6 text-center font-mono text-[0.65625rem] uppercase tracking-[0.18em] text-slate-400">
            Infrahealth-sensing from anywhere
          </p>
        </div>
      </div>
    </div>
  );
}
