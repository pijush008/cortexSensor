"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Mail, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { describeError, type DescribedError } from "@/lib/errors";
import { formatAmount, openRazorpayCheckout } from "./checkout";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Registration for a new organization.
 *
 * The page is deliberately explicit about what happens next, because what
 * happens next is unusual: creating the account does NOT let you in. An
 * organization is activated when its payment is confirmed by the provider, so
 * a person who registers and then finds they cannot sign in has not hit a
 * fault — they have reached the next step. Saying so here is cheaper than a
 * support conversation later.
 */

interface SignupPlan {
  code: string;
  name: string;
  amountPaise: number;
  currency: string;
  maxStructures: number | null;
  maxSensors: number | null;
  maxUsers: number | null;
}

const MIN_PASSWORD = 8;

/** Must match saveImageUpload's cap on the server, which is authoritative. */
const MAX_LOGO_BYTES = 600 * 1024;
const ACCEPTED_LOGO = "image/png,image/jpeg,image/webp";

/** How long to watch for the activating webhook before handing off to email. */
const CONFIRM_TIMEOUT_MS = 120_000;
const CONFIRM_POLL_MS = 4_000;

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [companyName, setCompanyName] = useState("");
  // The data URI posted to the API, and a separate name for the filename shown
  // in the picker. Held as state rather than read off the input at submit time,
  // because reading a File is asynchronous.
  const [companyLogo, setCompanyLogo] = useState("");
  const [logoName, setLogoName] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [lastName, setLastName] = useState("");
  const [emailId, setEmailId] = useState("");
  const [phoneNo, setPhoneNo] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<DescribedError | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  // Development aid: when the server has no SMTP credentials it returns the
  // verification link it could not email, so the flow can still be completed.
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(true);

  const router = useRouter();
  const signIn = useAuthStore((s) => s.login);

  // Plan selection, loaded from the server so the price shown is the price
  // charged — a hardcoded figure here would drift from billing_plans.
  const [plans, setPlans] = useState<SignupPlan[]>([]);
  const [planCode, setPlanCode] = useState<string>("");

  // Payment, which begins the moment registration returns.
  const [paying, setPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<DescribedError | null>(
    null,
  );
  const [amountLabel, setAmountLabel] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  // Set when the payment modal closes. The browser is not told whether the
  // charge succeeded, so this only means "start watching for the webhook".
  const [confirming, setConfirming] = useState(false);
  const [activated, setActivated] = useState(false);
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [autoSignInFailed, setAutoSignInFailed] = useState(false);

  useEffect(() => {
    api
      .get<{ plans: SignupPlan[] }>("/billing/plans")
      .then(({ data }) => {
        setPlans(data.plans ?? []);
        setPlanCode((current) => current || data.plans?.[0]?.code || "");
      })
      .catch(() => setPlans([]));
  }, []);

  /**
   * Waits for the webhook to activate the organization.
   *
   * Bounded deliberately. A webhook can be delayed, and a spinner that never
   * resolves is worse than a clear hand-off to email.
   */
  useEffect(() => {
    if (!confirming || activated) return;
    const startedAt = Date.now();

    const id = setInterval(async () => {
      if (Date.now() - startedAt > CONFIRM_TIMEOUT_MS) {
        clearInterval(id);
        setConfirmTimedOut(true);
        return;
      }
      try {
        // Token-scoped, so it works with no session. Retrying the sign-in
        // endpoint instead would exhaust its 20-attempt rate limit in a minute.
        const { data } = await api.post<{ active?: boolean }>(
          "/billing/checkout/status",
          { checkoutToken },
        );
        if (!data.active) return;

        clearInterval(id);
        setActivated(true);

        // Straight to the dashboard: the person just paid, and making them
        // retype the credentials they set sixty seconds ago is friction with
        // no security value — the payment already proved far more.
        try {
          await signIn(emailId, password);
          router.push("/dashboard");
        } catch {
          // Activated, but the automatic sign-in failed. The account is fine;
          // say so and let them sign in by hand rather than implying a problem.
          setAutoSignInFailed(true);
        }
      } catch {
        // Not active yet, or the token expired. Keep waiting until the bound.
      }
    }, CONFIRM_POLL_MS);

    return () => clearInterval(id);
  }, [confirming, activated, checkoutToken, emailId, password, router, signIn]);

  /**
   * Reads the chosen file into a data URI.
   *
   * The checks here are a courtesy so the person sees the problem before a round
   * trip; the server repeats all of them and is the authority. It verifies the
   * actual magic bytes, which a browser's reported MIME type does not prove.
   */
  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_LOGO.split(",").includes(file.type)) {
      setLogoError("Use a PNG, JPG or WebP image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`That file is ${Math.round(file.size / 1024)} KB. The limit is ${MAX_LOGO_BYTES / 1024} KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCompanyLogo(String(reader.result ?? ""));
      setLogoName(file.name);
    };
    reader.onerror = () => setLogoError("That file could not be read");
    reader.readAsDataURL(file);
  };

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mismatch || tooShort) return;
    if (!companyLogo) {
      setLogoError("Choose a logo for your company");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<{
        emailSent?: boolean;
        devVerificationUrl?: string;
        checkoutToken?: string;
      }>("/register/admin", {
        firstName,
        lastName,
        emailId,
        phoneNo,
        password,
        companyName,
        companyLogo,
      });
      setEmailSent(data.emailSent !== false);
      setDevVerifyUrl(data.devVerificationUrl ?? null);
      setRegistered(true);

      // The account exists but is inactive, and the person cannot sign in to
      // pay. Open checkout immediately with the token registration handed back.
      if (data.checkoutToken) {
        setCheckoutToken(data.checkoutToken);
        await startPayment(data.checkoutToken);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Opens the provider's payment page.
   *
   * A failure here is NOT a registration failure — the account was created.
   * Saying so matters, because someone told only "that didn't work" will try to
   * register again and hit "Email already exists".
   */
  const startPayment = async (token: string) => {
    setCheckoutError(null);
    setPaying(true);
    try {
      const { data: order } = await api.post<{
        orderId: string;
        keyId: string;
        amountPaise: number;
        currency: string;
        planName: string;
      }>("/billing/checkout/start", { checkoutToken: token, planCode });

      setAmountLabel(formatAmount(order.amountPaise, order.currency));
      setPlanName(order.planName);

      await openRazorpayCheckout({
        ...order,
        companyName,
        email: emailId,
        onClosed: () => setConfirming(true),
      });
    } catch (err) {
      setCheckoutError(describeError(err));
    } finally {
      setPaying(false);
    }
  };

  if (registered) {
    return (
      <Shell title="Account created" subtitle="Two things left before you can sign in.">
        <ol className="space-y-4">
          <Step
            icon={Mail}
            title="Verify your email"
            body={
              emailSent
                ? `We've sent a link to ${emailId}. Opening it confirms the address is yours.`
                : `No email could be sent — this deployment has no mail credentials configured. The account exists; the address just cannot be confirmed by email yet.`
            }
          />
          <Step
            icon={CreditCard}
            title={
              activated
                ? autoSignInFailed
                  ? "Payment confirmed"
                  : "Taking you to your dashboard…"
                : confirmTimedOut
                  ? "Payment is still being confirmed"
                  : confirming
                    ? "Confirming your payment…"
                    : paying
                      ? "Opening the payment page…"
                      : "Complete payment"
            }
            body={
              activated
                ? autoSignInFailed
                  ? "Your organization is active, but signing you in automatically did not work. Use the sign-in page with the details you just set."
                  : "Payment confirmed. Signing you in and opening your dashboard."
                : confirmTimedOut
                  ? "The payment provider has not confirmed the charge yet. This can take a few minutes — we'll email you the moment it completes, and signing in will work from then on."
                  : confirming
                    ? "Waiting for the payment provider to confirm the charge. Your organization is activated by that confirmation, not by this page, so it is safe to close this window."
                    : paying
                      ? `Opening a secure payment page${amountLabel ? ` for ${amountLabel}` : ""}${planName ? ` — ${planName} plan` : ""}.`
                      : "Your organization is activated when your payment is confirmed. Until then, signing in will tell you the account is not active yet — that is expected, not a fault."
            }
          />
        </ol>

        {/* A checkout failure is NOT a registration failure. Saying so stops
            someone re-registering and hitting "Email already exists". */}
        {checkoutError && (
          <div className="mt-6 rounded-lg border border-shm-red/25 bg-shm-red/5 p-3.5">
            <p className="text-[0.8125rem] font-medium text-shm-red">
              Your account was created, but the payment page could not be
              opened.
            </p>
            <p className="mt-1 text-[0.8125rem] text-slate-600">
              {checkoutError.description}
            </p>
            <p className="mt-2 text-[0.75rem] text-slate-500">
              Do not register again — the account already exists. Sign in once
              payment has been completed, or contact support.
            </p>
          </div>
        )}

        {/* Shown only when the server could not send the message, and only
            outside production. Without it there is no way to finish signing up
            on a machine with no SMTP account. */}
        {devVerifyUrl && (
          <div className="mt-6 rounded-lg border border-dashed border-shm-navy-300 bg-shm-navy-50/60 p-3.5">
            <p className="text-[0.75rem] font-medium uppercase tracking-[0.14em] text-shm-navy-700">
              Development only
            </p>
            <p className="mt-1 text-[0.8125rem] text-slate-600">
              Mail is not configured, so the verification link is shown here
              instead of being emailed.
            </p>
            <a
              href={devVerifyUrl}
              className="mt-2 inline-block break-all font-mono text-[0.75rem] text-shm-navy-700 underline"
            >
              {devVerifyUrl}
            </a>
          </div>
        )}

        <div className="mt-7">
          <Link href="/login">
            <Button variant="outline" className="w-full">
              Back to sign in
            </Button>
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Create your organization"
      subtitle="For engineering teams monitoring their own structures."
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Chosen before paying, and priced from the server so what is shown
            is what is charged. */}
        {plans.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[0.8125rem] font-medium text-shm-navy-900">
              Choose a plan
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {plans.map((p) => {
                const selected = planCode === p.code;
                return (
                  <label
                    key={p.code}
                    className={[
                      "cursor-pointer rounded-xl border p-3.5 transition-colors",
                      selected
                        ? "border-shm-navy-900 bg-shm-lavender/40"
                        : "border-slate-200 bg-white hover:border-shm-navy-300",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={p.code}
                      checked={selected}
                      onChange={() => setPlanCode(p.code)}
                      className="sr-only"
                    />
                    <span className="flex items-baseline justify-between">
                      <span className="text-[0.875rem] font-semibold text-shm-navy-900">
                        {p.name}
                      </span>
                      <span className="font-mono text-[0.8125rem] text-shm-navy-800">
                        {formatAmount(p.amountPaise, p.currency)}
                        <span className="text-[0.6875rem] text-slate-500">/mo</span>
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-slate-600">
                      {[
                        p.maxStructures && `${p.maxStructures} structures`,
                        p.maxSensors && `${p.maxSensors} sensors`,
                        p.maxUsers && `${p.maxUsers} users`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-shm-red/20 bg-shm-red/5 px-3.5 py-2.5 text-[0.8125rem] text-shm-red"
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5 text-shm-red/85">{error.description}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            placeholder="Asha"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Last name"
            placeholder="Rao"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <Input
          label="Company name"
          placeholder="Acme Structures Pvt Ltd"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />

        {/* A purpose-built control rather than a bare file input: the default
            one gives no preview, and seeing the mark before submitting is the
            whole point of choosing it. */}
        <div className="space-y-1.5">
          <label className="text-[0.8125rem] font-medium text-slate-700">
            Company logo
          </label>
          <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-2.5">
            <Avatar
              src={companyLogo || null}
              name={companyName}
              fallback={companyName || "C"}
              size="lg"
              className="h-12 w-12 rounded-md text-base"
            />
            <div className="min-w-0 flex-1">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-[0.78125rem] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {companyLogo ? "Change" : "Choose file"}
                <input
                  type="file"
                  accept={ACCEPTED_LOGO}
                  onChange={onLogoChange}
                  className="sr-only"
                />
              </label>
              <p className="mt-1 truncate text-[0.71875rem] text-slate-500">
                {logoName || `PNG, JPG or WebP · up to ${MAX_LOGO_BYTES / 1024} KB`}
              </p>
            </div>
          </div>
          {logoError && (
            <p className="text-xs font-medium text-shm-red">{logoError}</p>
          )}
        </div>

        <Input
          type="email"
          label="Work email"
          placeholder="you@company.com"
          value={emailId}
          onChange={(e) => setEmailId(e.target.value)}
          required
        />

        <Input
          type="tel"
          label="Phone"
          placeholder="+91 98765 43210"
          value={phoneNo}
          onChange={(e) => setPhoneNo(e.target.value)}
          required
        />

        <Input
          type="password"
          label="Password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={tooShort ? `Use at least ${MIN_PASSWORD} characters` : undefined}
          required
        />

        <Input
          type="password"
          label="Confirm password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "These don't match" : undefined}
          required
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={mismatch || tooShort || !companyLogo}
        >
          Create account
        </Button>

        <p className="text-center text-[0.78125rem] text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-shm-navy-600 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-shm-lavender-soft/40 px-5 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_-28px_rgba(17,17,17,0.35)] sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/company-logo.png"
          alt="Cloudglance Sensinglab Pvt Ltd"
          className="h-8 w-auto"
        />
        <h1 className="mt-6 text-[1.375rem] font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-[0.8125rem] text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Mail;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-shm-lavender-soft">
        <Icon className="h-4 w-4 text-shm-navy-700" strokeWidth={1.75} />
      </span>
      <div>
        <p className="flex items-center gap-1.5 text-[0.875rem] font-medium text-slate-900">
          <CheckCircle2 className="hidden h-3.5 w-3.5" aria-hidden="true" />
          {title}
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-slate-600">{body}</p>
      </div>
    </li>
  );
}
