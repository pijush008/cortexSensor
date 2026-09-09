"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { describeError, type DescribedError } from "@/lib/errors";
import { Activity, Lock, Radio, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "login" | "forgot" | "otp";

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

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState<DescribedError | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamHead, setStreamHead] = useState(0);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setStreamHead((h) => h + 1), 2200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCursor((c) => !c), 900);
    return () => clearInterval(id);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
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
      setMode("otp");
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{
        status_code: number;
        message: string | null;
        resetToken?: string;
      }>("/validateOTP", { userId, inputOTP: otp });
      setResetToken(data.resetToken || "");
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/changePassword", { userId, newPassword, resetToken });
      setMode("login");
      setPassword("");
      setOtp("");
      setResetToken("");
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
      <div className="bg-blueprint relative hidden w-1/2 flex-col justify-between overflow-hidden bg-shm-lavender p-12 lg:flex">
        {/* Real civil-engineering structure photo, rendered monochrome */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/structures/cable-stayed.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-[0.22] mix-blend-multiply"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-shm-lavender/95 via-shm-lavender/70 to-shm-cyan-soft/50" />
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25px 25px, rgba(26,18,37,0.12) 1px, transparent 0)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-shm-cyan/30 blur-3xl" />

        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/company-logo.jpeg"
            alt="SHM Console"
            className="h-9 w-auto object-contain"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-shm-navy-700">
            Console · v1.0
          </span>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.24em] text-shm-navy-700">
            Structural monitoring
          </p>
          <h2 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-shm-navy-900">
            See damage before it becomes a defect.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-700">
            Continuous strain, vibration and deflection telemetry from every
            structure you manage — instrumented, analyzed, and acted upon.
          </p>

          {/* pipeline description — deliberately no values (see PIPELINE) */}
          <div className="mt-10 rounded-xl border border-shm-navy-900/12 bg-white/75 p-4 font-mono backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-shm-navy-700" />
              <span className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
                Measurement pipeline · edge → cloud
              </span>
            </div>
            <div className="space-y-1.5">
              {activePipeline.map((line) => (
                <p
                  key={line}
                  className="anim-tick-in truncate text-[11px] leading-relaxed text-shm-navy-800"
                >
                  <span className="text-shm-green-text">➜</span> {line}
                </p>
              ))}
              <p className="text-[11px] text-shm-navy-800">
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
                <span className="text-[12px] text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative font-mono text-[11px] text-shm-navy-700">
          © {new Date().getFullYear()} Arctano Sensors · All rights reserved
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
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shm-navy-800">
              <Activity className="h-5 w-5 text-white" strokeWidth={1.75} />
            </div>
            <span className="text-lg font-bold tracking-tight text-shm-navy-900">
              StructGuard
            </span>
          </div>

          <Reveal>
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_-28px_rgba(17,17,17,0.35)] sm:p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-shm-navy-500">
                {mode === "login" ? "Access console" : "Account recovery"}
              </p>
              <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">
                {mode === "login" && "Welcome back"}
                {mode === "forgot" && "Reset your password"}
                {mode === "otp" && !newPassword && "Verify OTP"}
                {mode === "otp" && newPassword && "Set a new password"}
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                {mode === "login" && "Sign in to the monitoring console."}
                {mode === "forgot" &&
                  "We'll send a verification code to your email."}
                {mode === "otp" &&
                  !newPassword &&
                  "Enter the code sent to your registered email."}
                {mode === "otp" &&
                  newPassword &&
                  "Choose a new password for your account."}
              </p>

              {error && (
                <div
                  className="anim-tick-in mt-5 rounded-lg border border-shm-red/20 bg-shm-red/5 px-3.5 py-2.5 text-[13px] text-shm-red"
                  role="alert"
                >
                  <p className="font-medium">{error.title}</p>
                  <p className="mt-0.5 text-shm-red/85">{error.description}</p>
                </div>
              )}

              <form
                onSubmit={
                  mode === "login"
                    ? handleLogin
                    : mode === "forgot"
                      ? handleForgot
                      : mode === "otp" && !newPassword
                        ? handleOtp
                        : handleChangePassword
                }
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

                {mode === "forgot" && (
                  <Input
                    type="text"
                    label="User ID"
                    placeholder="Enter your user ID"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    required
                  />
                )}

                {mode === "otp" && !newPassword && (
                  <Input
                    type="text"
                    label="OTP"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                )}

                {mode === "otp" && newPassword && (
                  <Input
                    type="password"
                    label="New Password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading}
                >
                  {loading
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "forgot"
                        ? "Send OTP"
                        : newPassword
                          ? "Change password"
                          : "Verify OTP"}
                </Button>
              </form>

              <div className="mt-6 space-y-2 text-center text-[13px]">
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
                {(mode === "otp" || mode === "forgot") && (
                  <button
                    onClick={() => {
                      setMode("login");
                      setError(null);
                      setNewPassword("");
                    }}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    ← Back to login
                  </button>
                )}
              </div>
            </div>
          </Reveal>

          <p className="mt-6 text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-slate-400">
            Secured by Arctano Sensors
          </p>
        </div>
      </div>
    </div>
  );
}
