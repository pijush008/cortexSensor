/**
 * Razorpay checkout, opened straight after registration.
 *
 * The browser is never told whether the payment succeeded. Razorpay's callback
 * and its dismiss handler both lead to the same place — "start watching" —
 * because a browser returning from a checkout page proves nothing: it can be
 * replayed, forged, or fired before the charge settles. Only the signed webhook
 * activates an account, so all this file does is open the modal and report that
 * it closed.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads checkout.js once, resolving when window.Razorpay is usable. */
export function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return reject(new Error("Checkout can only be opened in a browser"));
    }
    if (window.Razorpay) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-razorpay]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Could not load the payment page")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.dataset.razorpay = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load the payment page"));
    document.body.appendChild(script);
  });
}

export interface CheckoutOpts {
  orderId: string;
  keyId: string;
  amountPaise: number;
  currency: string;
  planName: string;
  companyName: string;
  email: string;
  /** Called when the modal closes, however it closed. */
  onClosed: () => void;
}

export async function openRazorpayCheckout(opts: CheckoutOpts): Promise<void> {
  await loadRazorpay();

  if (!window.Razorpay) {
    throw new Error("Could not load the payment page");
  }

  const rz = new window.Razorpay({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amountPaise,
    currency: opts.currency,
    name: "Cloudglance Sensinglab",
    description: `${opts.planName} plan — ${opts.companyName}`,
    prefill: { email: opts.email },
    handler: () => opts.onClosed(),
    modal: { ondismiss: () => opts.onClosed() },
  });

  rz.open();
}

/** Rupees from integer paise, for display only. */
export function formatAmount(amountPaise: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amountPaise / 100);
}
