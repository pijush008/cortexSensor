"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { describeError, type DescribedError } from "@/lib/errors";

/**
 * Where the emailed reset link lands.
 *
 * The token travels in the query string because that is what an email client
 * can carry. It is single-use and expires in an hour, and this page never
 * stores it anywhere — it is read from the URL, posted once, and forgotten.
 */

const MIN_LENGTH = 8;

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<DescribedError | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // A link with no token at all: say so here rather than posting an empty
  // token and reporting the server's rejection as if the person did something
  // wrong.
  if (!token) {
    return (
      <div className="space-y-4">
        <p className="text-[0.8125rem] text-slate-600">
          This link is incomplete. Reset links expire after an hour and can be
          used once — request a new one and use the most recent email.
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full">
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-[0.8125rem] text-slate-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-shm-green" />
          <span>
            Your password has been changed, and any other sessions on your
            account have been signed out.
          </span>
        </p>
        <Button className="w-full" onClick={() => router.push("/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < MIN_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here for a quick answer, and again on the server, which is the
    // rule that actually holds — this endpoint can be posted to directly.
    if (password !== confirm) return;
    if (password.length < MIN_LENGTH) return;

    setLoading(true);
    try {
      await api.post("/resetPassword", { token, password });
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-shm-red/20 bg-shm-red/5 px-3.5 py-2.5 text-[0.8125rem] text-shm-red"
        >
          <p className="font-medium">{error.title}</p>
          <p className="mt-0.5 text-shm-red/85">{error.description}</p>
        </div>
      )}

      <Input
        type="password"
        label="New password"
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={tooShort ? `Use at least ${MIN_LENGTH} characters` : undefined}
        required
      />

      <Input
        type="password"
        label="Confirm new password"
        placeholder="Type it again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? "These don't match" : undefined}
        required
      />

      <Button
        type="submit"
        className="w-full"
        size="lg"
        loading={loading}
        disabled={!password || mismatch || tooShort}
      >
        Set new password
      </Button>

      <p className="text-center text-[0.78125rem] text-slate-500">
        <Link
          href="/login"
          className="inline-flex min-h-6 items-center hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-shm-lavender-soft/40 px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_-28px_rgba(17,17,17,0.35)] sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/company-logo.png"
          alt="Cloudglance Sensinglab Pvt Ltd"
          className="h-8 w-auto"
        />
        <h1 className="mt-6 text-[1.375rem] font-semibold tracking-tight text-slate-900">
          Choose a new password
        </h1>
        <p className="mt-1 text-[0.8125rem] text-slate-500">
          Pick something you don&apos;t use anywhere else.
        </p>

        <div className="mt-6">
          {/* useSearchParams needs a Suspense boundary in the App Router. */}
          <Suspense fallback={<div className="h-40" />}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
