/**
 * Replays a correctly-signed payment webhook against the local API.
 *
 * Razorpay cannot reach localhost, and an account is activated by a signed
 * webhook and by nothing else. Without this the only way to finish a local
 * signup is to stand up a public tunnel.
 *
 * This does NOT bypass anything: it posts the same bytes with the same HMAC the
 * provider would, so signature verification, event parsing, idempotency and the
 * activation path all run for real. It is a delivery mechanism, not a shortcut.
 *
 *   npm run dev:replay-webhook -- <subscriptionId>
 *   npm run dev:replay-webhook -- --email someone@example.com
 */
import crypto from "crypto";
import { config } from "../src/config";
import prisma from "../src/config/prisma";

async function resolveSubscriptionId(): Promise<number> {
  const args = process.argv.slice(2);
  const emailFlag = args.indexOf("--email");

  if (emailFlag !== -1) {
    const email = args[emailFlag + 1];
    if (!email) throw new Error("--email needs an address");
    const user = await prisma.user.findUnique({ where: { emailId: email } });
    if (!user) throw new Error(`No user with email ${email}`);
    const sub = await prisma.subscription.findUnique({
      where: { adminId: user.id },
    });
    if (!sub) throw new Error(`No subscription for ${email}`);
    return sub.id;
  }

  const positional = args.find((a) => !a.startsWith("--"));
  if (positional) return Number(positional);

  // Convenience for the common case: the signup you just made.
  const latest = await prisma.subscription.findFirst({
    where: { status: "pending" },
    orderBy: { id: "desc" },
  });
  if (!latest) {
    throw new Error(
      "No pending subscription found. Pass a subscription id or --email <address>.",
    );
  }
  console.log(`No id given; using the most recent pending subscription ${latest.id}.`);
  return latest.id;
}

async function main() {
  if (config.nodeEnv === "production") {
    throw new Error(
      "replay-webhook is a development tool and refuses to run in production",
    );
  }

  const secret =
    config.billing.razorpay.webhookSecret || config.billing.webhookSecret;
  if (!secret) {
    throw new Error(
      "No webhook secret configured. Set RAZORPAY_WEBHOOK_SECRET (or BILLING_WEBHOOK_SECRET) in backend/.env — the endpoint would reject an unsigned request.",
    );
  }

  const subscriptionId = await resolveSubscriptionId();

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!subscription) {
    throw new Error(`No subscription with id ${subscriptionId}`);
  }

  // Seconds, not milliseconds — the adapter multiplies by 1000, and passing
  // milliseconds here dates the paid period to the year 57000.
  const periodEndSeconds =
    Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  const isRazorpay = config.billing.provider === "razorpay";

  // Shaped for whichever adapter is active, so the same script works before and
  // after Razorpay credentials are added.
  const body = isRazorpay
    ? JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              notes: { subscriptionId: String(subscriptionId) },
              current_end: periodEndSeconds,
              amount: subscription.plan.priceMonthly,
              currency: subscription.plan.currency,
            },
          },
        },
      })
    : JSON.stringify({
        id: `dev-replay-${Date.now()}`,
        type: "payment.succeeded",
        data: {
          // OUR id, not a provider id: nothing has ever written
          // providerSubscriptionId for a one-time payment.
          localSubscriptionId: subscriptionId,
          amount: subscription.plan.priceMonthly,
          currency: subscription.plan.currency,
          currentPeriodEnd: new Date(periodEndSeconds * 1000).toISOString(),
        },
      });

  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const url = `http://localhost:${config.port}/api/billing/webhook`;
  console.log(
    `Replaying ${isRazorpay ? "razorpay" : "generic"} payment webhook for subscription ${subscriptionId} -> ${url}`,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": signature },
    body,
  });

  const text = await res.text();
  console.log(`${res.status} ${text}`);

  if (!res.ok) process.exit(1);

  const after = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { status: true, currentPeriodEnd: true },
  });
  console.log(
    `subscription ${subscriptionId} is now ${after?.status}, valid till ${after?.currentPeriodEnd?.toISOString() ?? "unset"}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
