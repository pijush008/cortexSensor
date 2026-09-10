# Payment-Gated Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registering an organization opens a real Razorpay payment page, a verified webhook activates the account and sends a welcome email naming the plan and its expiry.

**Architecture:** The user row, tenant and a `pending` subscription are already written at registration; only a signed webhook may activate them. This plan adds the missing middle: order creation on the payment provider, a purpose-scoped token that lets an admin who cannot yet log in start their own checkout, and a welcome email hung off the single existing activation point.

**Tech Stack:** TypeScript, Express 4, Prisma 5, PostgreSQL, Vitest + supertest, Razorpay Orders API, Next.js 15 (App Router), Nodemailer.

**Spec:** `docs/superpowers/specs/2026-09-10-payment-gated-registration-design.md`

## Global Constraints

- Activation happens **only** in the webhook branch at `backend/src/modules/billing/billing.service.ts:219-239`. No other code path may set a subscription to `active`.
- An unconfigured deployment must **refuse**, never pretend. `isConfigured()` false ⇒ 503 with a clear message.
- Signature verification is over the **raw** request body. `billing/webhook` is mounted with `express.raw` ahead of the JSON parser; do not move it.
- Amounts are integer **paise** (`billingPlan.priceMonthly`, e.g. Starter = `499900`). Never floats.
- Razorpay `current_end` is UNIX **seconds**; multiply by 1000.
- Our own subscription id travels in Razorpay `notes`, because a webhook must be attributable without trusting the browser (`razorpay.provider.ts` already reads `entity.notes`).
- Secrets live in `backend/.env` only. Never commit them; `.env.example` gets placeholders.
- Every task ends green: `npx tsc --noEmit` exits 0 and `npm run test:run` passes.
- Backend tests share one Postgres and run with `fileParallelism: false`. Run the whole suite, not single files, before committing.

### Deviation from the spec, deliberate

The spec says the checkout token carries `subscriptionId`. It carries **`userId`** instead: `subscription` is unique by `adminId` (`tenant.provisioning.ts:124` upserts on it), so userId resolves to exactly one subscription, and `utils/jwt.ts` already signs userId-shaped payloads. Same authority, one less lookup at mint time, consistent with `signPasswordResetToken`.

---

## File Structure

**Create**
- `backend/src/modules/billing/checkout.service.ts` — resolves plan + subscription, calls the provider, returns order details
- `backend/scripts/replay-webhook.ts` — dev-only signed webhook replay
- `backend/test/checkout-token.test.ts`
- `backend/test/checkout-start.test.ts`
- `backend/test/welcome-email.test.ts`
- `frontend/src/app/(auth)/register/checkout.ts` — Razorpay script loader + modal open

**Modify**
- `backend/src/utils/jwt.ts` — add `signCheckoutToken` / `verifyCheckoutToken`
- `backend/src/modules/billing/provider.ts` — add `createOrder` to the interface; `GenericHmacProvider` throws
- `backend/src/modules/billing/razorpay.provider.ts` — implement `createOrder`
- `backend/src/modules/billing/billing.routes.ts` — replace the 501 stub; add `POST /billing/checkout/start`
- `backend/src/modules/billing/billing.service.ts:239` — send the welcome email after activation
- `backend/src/utils/email.ts` — add `renderWelcomeEmail`
- `backend/src/config/index.ts` — add `billing.signupPlanCode`
- `backend/src/modules/rbac/tenant.provisioning.ts:10` — read the plan code from config
- `backend/src/modules/auth/auth.service.ts:385` — return `checkoutToken`
- `frontend/src/app/(auth)/register/page.tsx` — checkout + confirming states
- `backend/.env.example`

---

## Task 1: Plan code moves to config

**Files:**
- Modify: `backend/src/config/index.ts`
- Modify: `backend/src/modules/rbac/tenant.provisioning.ts:10`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: `config.billing.signupPlanCode: string` (default `"starter"`)

- [ ] **Step 1: Add the config value**

In `backend/src/config/index.ts`, inside the existing `billing: {` block, add:

```ts
    /**
     * Plan every new organization is put on at sign-up, BY CODE.
     *
     * Named rather than inferred: picking "the first active plan" once put new
     * customers on `complimentary`, the unlimited internal plan, silently
     * removing every limit. Changing the price is an UPDATE on the row; this
     * only chooses which row.
     */
    signupPlanCode: process.env.DEFAULT_SIGNUP_PLAN || "starter",
```

- [ ] **Step 2: Point provisioning at it**

In `backend/src/modules/rbac/tenant.provisioning.ts`, replace line 10:

```ts
const DEFAULT_PLAN_CODE = "starter";
```

with:

```ts
import { config } from "../../config";
// Single source of truth: checkout charges for the same plan sign-up assigns.
const DEFAULT_PLAN_CODE = config.billing.signupPlanCode;
```

(If `config` is already imported in this file, do not add a second import.)

- [ ] **Step 3: Document it**

Append to the `# Billing` section of `backend/.env.example`:

```
# Plan new organizations are placed on at sign-up, by CODE (see billing_plans).
# Change the PRICE by updating that row; this only selects which row.
DEFAULT_SIGNUP_PLAN=starter
```

- [ ] **Step 4: Verify nothing broke**

Run: `cd backend && npx tsc --noEmit && npm run test:run`
Expected: tsc exits 0; suite passes as before.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/index.ts backend/src/modules/rbac/tenant.provisioning.ts backend/.env.example
git commit -m "refactor(billing): select the sign-up plan by config, not a literal"
```

---

## Task 2: Provider gains order creation

**Files:**
- Modify: `backend/src/modules/billing/provider.ts`
- Modify: `backend/src/modules/billing/razorpay.provider.ts`
- Test: `backend/test/razorpay-provider.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: `config.billing.razorpay.{keyId,keySecret}`
- Produces:
  ```ts
  export interface CreateOrderInput {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }
  export interface CreatedOrder {
    orderId: string;
    amountPaise: number;
    currency: string;
  }
  // on PaymentProvider:
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  ```

- [ ] **Step 1: Write the failing test**

Append to `backend/test/razorpay-provider.test.ts`:

```ts
describe("createOrder", () => {
  test("posts amount in paise and returns the order id", async () => {
    const calls: Array<{ url: string; body: unknown; auth: string }> = [];
    const fakeFetch = async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: JSON.parse(String(init.body)),
        auth: String((init.headers as Record<string, string>).Authorization),
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "order_TEST123", amount: 499900, currency: "INR" }),
      } as unknown as Response;
    };

    const provider = new RazorpayProvider(fakeFetch);
    const order = await provider.createOrder({
      amountPaise: 499900,
      currency: "INR",
      receipt: "sub-42",
      notes: { subscriptionId: "42" },
    });

    expect(order).toEqual({ orderId: "order_TEST123", amountPaise: 499900, currency: "INR" });
    expect(calls[0].url).toBe("https://api.razorpay.com/v1/orders");
    expect(calls[0].body).toMatchObject({
      amount: 499900,
      currency: "INR",
      notes: { subscriptionId: "42" },
    });
    // Our subscription id must ride along, or the webhook cannot be attributed.
    expect(calls[0].auth.startsWith("Basic ")).toBe(true);
  });

  test("a provider error surfaces rather than returning a bogus order", async () => {
    const fakeFetch = async () =>
      ({ ok: false, status: 401, text: async () => "unauthorized" }) as unknown as Response;
    const provider = new RazorpayProvider(fakeFetch);
    await expect(
      provider.createOrder({ amountPaise: 100, currency: "INR", receipt: "r", notes: {} }),
    ).rejects.toThrow(/razorpay order creation failed/i);
  });
});
```

Ensure the file imports `RazorpayProvider`, `describe`, `test`, `expect`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx vitest run test/razorpay-provider.test.ts`
Expected: FAIL — `createOrder is not a function`.

- [ ] **Step 3: Extend the interface**

In `backend/src/modules/billing/provider.ts`, above `export interface PaymentProvider {`:

```ts
export interface CreateOrderInput {
  /** Integer minor units. Rupees are never floats here. */
  amountPaise: number;
  currency: string;
  /** Our reference, echoed back by the provider for reconciliation. */
  receipt: string;
  /**
   * Carried through to the webhook. Our own subscription id lives here so an
   * incoming event can be attributed to a tenant without trusting the browser.
   */
  notes: Record<string, string>;
}

export interface CreatedOrder {
  orderId: string;
  amountPaise: number;
  currency: string;
}
```

Add to `PaymentProvider`:

```ts
  /**
   * Opens an order with the provider. Throws when the adapter cannot take a
   * payment, so an unconfigured deployment fails loudly instead of handing the
   * browser an order that does not exist.
   */
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
```

Add to `GenericHmacProvider`:

```ts
  async createOrder(): Promise<CreatedOrder> {
    // The generic adapter verifies and parses webhooks; it has no API to open
    // an order against. Refusing keeps the "never pretend" property.
    throw new Error(
      "The configured payment provider cannot start a checkout. Set BILLING_PROVIDER=razorpay and supply credentials.",
    );
  }
```

- [ ] **Step 4: Implement it on the Razorpay adapter**

In `backend/src/modules/billing/razorpay.provider.ts`, import the new types and give the class an injectable fetch:

```ts
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";

  // Injectable so the test can assert what we send without a network call.
  constructor(private readonly fetchImpl: FetchLike = fetch) {}
```

Add the method:

```ts
  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const rp = config.billing.razorpay;
    const auth = Buffer.from(`${rp.keyId}:${rp.keySecret}`).toString("base64");

    const res = await this.fetchImpl("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `Razorpay order creation failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }

    const order = (await res.json()) as {
      id: string;
      amount: number;
      currency: string;
    };
    return {
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
    };
  }
```

- [ ] **Step 5: Run tests**

Run: `cd backend && npx vitest run test/razorpay-provider.test.ts && npx tsc --noEmit`
Expected: PASS; tsc 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/billing/provider.ts backend/src/modules/billing/razorpay.provider.ts backend/test/razorpay-provider.test.ts
git commit -m "feat(billing): add order creation to the payment provider boundary"
```

---

## Task 3: Checkout token

**Files:**
- Modify: `backend/src/utils/jwt.ts`
- Test: `backend/test/checkout-token.test.ts` (create)

**Interfaces:**
- Consumes: `config.jwtRefreshSecret`
- Produces:
  ```ts
  export function signCheckoutToken(userId: number): Promise<string>;
  export function verifyCheckoutToken(token: string): JwtPayload & { purpose: string };
  ```
  `verifyCheckoutToken` throws unless `purpose === "checkout"`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/checkout-token.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  signAccessToken,
  signCheckoutToken,
  signPasswordResetToken,
  verifyCheckoutToken,
} from "../src/utils/jwt";

describe("checkout token", () => {
  test("round-trips the user id", async () => {
    const token = await signCheckoutToken(4242);
    expect(verifyCheckoutToken(token).userId).toBe(4242);
  });

  test("rejects an access token — a session is not permission to charge", async () => {
    const access = await signAccessToken(4242);
    expect(() => verifyCheckoutToken(access)).toThrow();
  });

  test("rejects a password-reset token: same secret, different purpose", async () => {
    const reset = await signPasswordResetToken(4242);
    expect(() => verifyCheckoutToken(reset)).toThrow(/purpose/i);
  });

  test("rejects a tampered token", async () => {
    const token = await signCheckoutToken(4242);
    const tampered = token.slice(0, -3) + "aaa";
    expect(() => verifyCheckoutToken(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx vitest run test/checkout-token.test.ts`
Expected: FAIL — `signCheckoutToken is not exported`.

- [ ] **Step 3: Implement**

Append to `backend/src/utils/jwt.ts`:

```ts
/**
 * Authorises ONE thing: starting payment for the account that just registered.
 *
 * A new organization admin cannot sign in — the account is inactive until a
 * webhook confirms payment — so there is no session to authenticate a checkout
 * with. This token fills exactly that hole and nothing wider: no session, no
 * read access, thirty minutes.
 *
 * Signed with the refresh secret and stamped with a purpose, like the
 * password-reset token, so an access token cannot be presented in its place.
 */
export function signCheckoutToken(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: JwtPayload & { purpose: string } = {
      userId,
      purpose: "checkout",
    };
    const options: jwt.SignOptions = { expiresIn: "30m", issuer: "shm-api" };
    jwt.sign(payload, config.jwtRefreshSecret, options, (err, token) => {
      if (err || !token) {
        reject(err || new Error("Checkout token generation failed"));
      } else {
        resolve(token);
      }
    });
  });
}

export function verifyCheckoutToken(token: string): JwtPayload & {
  purpose: string;
} {
  const decoded = jwt.verify(token, config.jwtRefreshSecret, {
    issuer: "shm-api",
  }) as JwtPayload & { purpose?: string };

  // Checked explicitly: the reset token is signed with the same secret and
  // would otherwise verify here, letting a password-reset link start a charge.
  if (decoded.purpose !== "checkout") {
    throw new Error("Token purpose is not checkout");
  }
  return decoded as JwtPayload & { purpose: string };
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx vitest run test/checkout-token.test.ts && npx tsc --noEmit`
Expected: 4 passing; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/jwt.ts backend/test/checkout-token.test.ts
git commit -m "feat(auth): add a purpose-scoped checkout token"
```

---

## Task 4: Start-checkout endpoint

**Files:**
- Create: `backend/src/modules/billing/checkout.service.ts`
- Modify: `backend/src/modules/billing/billing.routes.ts` (replace the 501 stub, add the new route)
- Test: `backend/test/checkout-start.test.ts` (create)

**Interfaces:**
- Consumes: `verifyCheckoutToken`, `paymentProvider.createOrder`, `config.billing.signupPlanCode`
- Produces:
  ```ts
  export async function startCheckoutForUser(userId: number): Promise<{
    orderId: string; keyId: string; amountPaise: number;
    currency: string; planName: string;
  }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/test/checkout-start.test.ts`:

```ts
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { signCheckoutToken } from "../src/utils/jwt";
import { TINY_PNG } from "./fixtures/registration";

const EMAIL = "checkout-start@example.com";

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { emailId: EMAIL } });
  if (!user) return;
  await prisma.subscription.deleteMany({ where: { adminId: user.id } });
  await prisma.membership.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

describe("POST /api/billing/checkout/start", () => {
  let token = "";

  beforeAll(async () => {
    await cleanup();
    await request(app).post("/api/register/admin").send({
      firstName: "Check", lastName: "Out", emailId: EMAIL,
      phoneNo: "9876543210", password: "Password1!",
      companyName: "Checkout Co", companyLogo: TINY_PNG,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { emailId: EMAIL } });
    token = await signCheckoutToken(user.id);
  });

  afterAll(cleanup);

  test("rejects a missing token", async () => {
    const res = await request(app).post("/api/billing/checkout/start").send({});
    expect(res.status).toBe(401);
  });

  test("rejects a token of the wrong purpose", async () => {
    const res = await request(app)
      .post("/api/billing/checkout/start")
      .send({ checkoutToken: "not-a-jwt" });
    expect(res.status).toBe(401);
  });

  test("refuses when billing is unconfigured rather than pretending", async () => {
    // test/setup.ts leaves BILLING_PROVIDER unset, so the generic adapter is
    // active and cannot open an order.
    const res = await request(app)
      .post("/api/billing/checkout/start")
      .send({ checkoutToken: token });
    expect([503, 500]).toContain(res.status);
    expect(String(res.body.message)).toMatch(/not configured|cannot start a checkout/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx vitest run test/checkout-start.test.ts`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the service**

Create `backend/src/modules/billing/checkout.service.ts`:

```ts
import prisma from "../../config/prisma";
import { config } from "../../config";
import { BadRequestError } from "../../utils/AppError";
import { paymentProvider } from "./provider";

export interface StartedCheckout {
  orderId: string;
  /** Publishable key. The secret never leaves the server. */
  keyId: string;
  amountPaise: number;
  currency: string;
  planName: string;
}

/**
 * Opens an order for the subscription belonging to `userId`.
 *
 * The amount is read from the plan row, never from the request: a client that
 * could name its own price would be able to buy a year for one paisa.
 */
export async function startCheckoutForUser(
  userId: number,
): Promise<StartedCheckout> {
  const subscription = await prisma.subscription.findUnique({
    where: { adminId: userId },
    include: { plan: true },
  });

  if (!subscription) {
    throw new BadRequestError("No subscription exists for this account");
  }
  if (subscription.status === "active") {
    throw new BadRequestError("This subscription is already active");
  }

  const plan =
    subscription.plan ??
    (await prisma.billingPlan.findFirst({
      where: { code: config.billing.signupPlanCode, isActive: true },
    }));

  if (!plan) {
    throw new BadRequestError("No billing plan is configured for sign-up");
  }

  const order = await paymentProvider.createOrder({
    amountPaise: plan.priceMonthly,
    currency: plan.currency,
    receipt: `sub-${subscription.id}`,
    // Read back by the webhook adapter to attribute the payment.
    notes: { subscriptionId: String(subscription.id) },
  });

  return {
    orderId: order.orderId,
    keyId: config.billing.razorpay.keyId,
    amountPaise: order.amountPaise,
    currency: order.currency,
    planName: plan.name,
  };
}
```

- [ ] **Step 4: Wire the route**

In `backend/src/modules/billing/billing.routes.ts`, add near the other imports:

```ts
import { startCheckoutForUser } from "./checkout.service";
import { verifyCheckoutToken } from "../../utils/jwt";
```

Add this route (before `export default router;`):

```ts
/**
 * Start payment for an account that cannot sign in yet.
 *
 * Unauthenticated by necessity: a new organization admin is inactive until a
 * webhook confirms payment, so requiring a session here would mean needing a
 * session to pay and a payment to get a session. The checkout token is the
 * narrow substitute — one subscription, thirty minutes, no read access.
 */
router.post("/billing/checkout/start", async (req: AuthRequest, res: Response) => {
  const token = String((req.body ?? {}).checkoutToken ?? "");
  let userId: number;
  try {
    userId = Number(verifyCheckoutToken(token).userId);
  } catch {
    return res.status(401).json({
      status_code: 401,
      message: "This payment link is invalid or has expired. Register again to get a new one.",
    });
  }

  if (!isBillingConfigured()) {
    return res.status(503).json({
      status_code: 503,
      message: "No payment provider is configured on this deployment, so checkout cannot be started.",
    });
  }

  try {
    return res.status(200).json({ status_code: 200, ...(await startCheckoutForUser(userId)) });
  } catch (error) {
    const err = error as { statusCode?: number; message: string };
    return res
      .status(err.statusCode || 503)
      .json({ status_code: err.statusCode || 503, message: err.message });
  }
});
```

Then replace the **501 body** in the existing `POST /billing/checkout` handler with:

```ts
      return res.status(200).json({
        status_code: 200,
        ...(await startCheckoutForUser(ctx.userId)),
      });
```

- [ ] **Step 5: Run the suite**

Run: `cd backend && npx tsc --noEmit && npm run test:run`
Expected: tsc 0; `checkout-start.test.ts` 3 passing; nothing else regressed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/billing/checkout.service.ts backend/src/modules/billing/billing.routes.ts backend/test/checkout-start.test.ts
git commit -m "feat(billing): open a real order instead of returning 501"
```

---

## Task 5: Return the checkout token from registration

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts:385-396`
- Test: `backend/test/registration-branding.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: `signCheckoutToken`
- Produces: the admin registration response gains `checkoutToken: string`

- [ ] **Step 1: Write the failing test**

Append to `backend/test/registration-branding.test.ts` (inside its top-level `describe`):

```ts
test("an admin registration returns a checkout token so payment can start", async () => {
  const email = `tok-${Date.now()}@example.com`;
  const res = await request(app).post("/api/register/admin").send({
    firstName: "Tok", lastName: "En", emailId: email,
    phoneNo: "9876543210", password: "Password1!",
    companyName: "Token Co", companyLogo: TINY_PNG,
  });

  expect(res.status).toBe(200);
  expect(typeof res.body.checkoutToken).toBe("string");
  expect(res.body.checkoutToken.length).toBeGreaterThan(20);

  const user = await prisma.user.findUniqueOrThrow({ where: { emailId: email } });
  expect(verifyCheckoutToken(res.body.checkoutToken).userId).toBe(user.id);

  await prisma.subscription.deleteMany({ where: { adminId: user.id } });
  await prisma.membership.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});
```

Add `import { verifyCheckoutToken } from "../src/utils/jwt";` to that file's imports.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx vitest run test/registration-branding.test.ts`
Expected: FAIL — `checkoutToken` is undefined.

- [ ] **Step 3: Implement**

In `backend/src/modules/auth/auth.service.ts`, add to the imports from `../../utils/jwt`: `signCheckoutToken`.

Replace the return at line 385 with:

```ts
  // Issued for admins only. A contractor or authority is added into an
  // organization that has already paid, so they have nothing to check out.
  const checkoutToken =
    userType === "admin" ? await signCheckoutToken(userId) : undefined;

  return {
    status_code: 200,
    message: sent
      ? "User added successfully"
      : "Account created, but the verification email could not be sent. Contact your administrator.",
    emailSent: sent,
    ...(checkoutToken ? { checkoutToken } : {}),
    ...(!sent && config.nodeEnv !== "production"
      ? { devVerificationUrl: verificationLink }
      : {}),
  };
```

If `userType` is not in scope at that point, thread it down from the caller rather than re-deriving it.

- [ ] **Step 4: Run the suite**

Run: `cd backend && npx tsc --noEmit && npm run test:run`
Expected: tsc 0; suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts backend/test/registration-branding.test.ts
git commit -m "feat(auth): hand the new admin a checkout token at registration"
```

---

## Task 6: Welcome email on activation

**Files:**
- Modify: `backend/src/utils/email.ts`
- Modify: `backend/src/modules/billing/billing.service.ts:239`
- Test: `backend/test/welcome-email.test.ts` (create)

**Interfaces:**
- Consumes: `sendEmail`, `isEmailConfigured`
- Produces:
  ```ts
  export function renderWelcomeEmail(input: {
    firstName: string; companyName: string; planName: string;
    amountPaise: number; currency: string; validTill: Date; signInUrl: string;
  }): { subject: string; html: string; text: string };
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/test/welcome-email.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { renderWelcomeEmail } from "../src/utils/email";

describe("welcome email", () => {
  const rendered = renderWelcomeEmail({
    firstName: "Asha",
    companyName: "Cortex Structures",
    planName: "Starter",
    amountPaise: 499900,
    currency: "INR",
    validTill: new Date("2026-10-10T00:00:00Z"),
    signInUrl: "https://shm.example.com/login",
  });

  test("names the organization and the plan", () => {
    expect(rendered.subject).toContain("Cortex Structures");
    expect(rendered.html).toContain("Starter");
  });

  test("renders paise as rupees, not raw minor units", () => {
    expect(rendered.html).toContain("4,999");
    expect(rendered.html).not.toContain("499900");
  });

  test("states the expiry date", () => {
    expect(rendered.html).toMatch(/10 October 2026|2026-10-10/);
  });

  test("has a plain-text alternative", () => {
    expect(rendered.text).toContain("Starter");
    expect(rendered.text).not.toContain("<");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx vitest run test/welcome-email.test.ts`
Expected: FAIL — `renderWelcomeEmail is not exported`.

- [ ] **Step 3: Implement the renderer**

Append to `backend/src/utils/email.ts`:

```ts
export interface WelcomeEmailInput {
  firstName: string;
  companyName: string;
  planName: string;
  /** Integer minor units, as stored on the plan. */
  amountPaise: number;
  currency: string;
  validTill: Date;
  signInUrl: string;
}

/**
 * Rendering is separated from sending so the wording can be tested without
 * SMTP, and so a send failure cannot be confused with a rendering failure.
 */
export function renderWelcomeEmail(input: WelcomeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: input.currency,
    minimumFractionDigits: 0,
  }).format(input.amountPaise / 100);

  const validTill = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(input.validTill);

  const subject = `Welcome to Cloudglance — ${input.companyName} is active`;

  const html = `
    <p>Hello ${input.firstName},</p>
    <p><strong>${input.companyName}</strong> is now active on the Cloudglance
       structural health monitoring platform.</p>
    <table cellpadding="6">
      <tr><td>Plan</td><td><strong>${input.planName}</strong></td></tr>
      <tr><td>Amount paid</td><td>${amount}</td></tr>
      <tr><td>Valid till</td><td>${validTill}</td></tr>
    </table>
    <p><a href="${input.signInUrl}">Sign in to your console</a></p>
    <p>You can now create projects and add contractor and authority users to them.</p>
  `.trim();

  const text = [
    `Hello ${input.firstName},`,
    ``,
    `${input.companyName} is now active on the Cloudglance structural health monitoring platform.`,
    ``,
    `Plan: ${input.planName}`,
    `Amount paid: ${amount}`,
    `Valid till: ${validTill}`,
    ``,
    `Sign in: ${input.signInUrl}`,
  ].join("\n");

  return { subject, html, text };
}
```

- [ ] **Step 4: Send it from the activation branch**

In `backend/src/modules/billing/billing.service.ts`, immediately after
`await activateOwnerAfterPayment(subscription.adminId);` (line 239):

```ts
      // Sent HERE because this is the only place an account becomes usable.
      //
      // Deliberately not awaited into the webhook's success: Razorpay retries
      // any non-2xx, and failing this delivery over an SMTP hiccup would replay
      // an activation that already happened. A missing welcome email is an
      // annoyance; a re-run activation is a correctness problem.
      try {
        const admin = await prisma.user.findUnique({
          where: { id: subscription.adminId },
          select: { firstName: true, emailId: true },
        });
        const tenant = subscription.tenantId
          ? await prisma.tenant.findUnique({
              where: { id: subscription.tenantId },
              select: { name: true },
            })
          : null;
        const plan = await prisma.billingPlan.findUnique({
          where: { id: subscription.planId },
          select: { name: true, priceMonthly: true, currency: true },
        });

        if (admin && plan) {
          const mail = renderWelcomeEmail({
            firstName: admin.firstName,
            companyName: tenant?.name ?? admin.firstName,
            planName: plan.name,
            amountPaise: event.amountMinor ?? plan.priceMonthly,
            currency: plan.currency,
            validTill: periodEnd,
            signInUrl: `${config.appBaseUrl}/login`,
          });
          await sendEmail({
            to: admin.emailId,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
        }
      } catch (mailError) {
        logger.warn("Welcome email could not be sent after activation", {
          adminId: subscription.adminId,
          error: (mailError as Error).message,
        });
      }
```

Add `renderWelcomeEmail` and `sendEmail` to the imports from `../../utils/email`. If `config.appBaseUrl` does not exist, use the same value the verification link is built from in `auth.service.ts` and reuse that helper rather than introducing a second base-URL source.

- [ ] **Step 5: Run the suite**

Run: `cd backend && npx tsc --noEmit && npm run test:run`
Expected: tsc 0; `welcome-email.test.ts` 4 passing; `payment-activation.test.ts` still green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/email.ts backend/src/modules/billing/billing.service.ts backend/test/welcome-email.test.ts
git commit -m "feat(billing): send a welcome email when a subscription activates"
```

---

## Task 7: Dev webhook replay CLI

**Files:**
- Create: `backend/scripts/replay-webhook.ts`
- Modify: `backend/package.json` (scripts)

**Interfaces:**
- Consumes: `config.billing.razorpay.webhookSecret`
- Produces: `npm run dev:replay-webhook -- <subscriptionId>`

- [ ] **Step 1: Write the script**

Create `backend/scripts/replay-webhook.ts`:

```ts
/**
 * Replays a correctly-signed payment webhook against the local API.
 *
 * Razorpay cannot reach localhost, so without this the activation path can only
 * be exercised behind a tunnel. This posts the same bytes with the same HMAC
 * the provider would, so it exercises verification and activation for real —
 * it does not bypass them.
 */
import crypto from "crypto";
import { config } from "../src/config";

async function main() {
  if (config.nodeEnv === "production") {
    throw new Error("replay-webhook is a development tool and refuses to run in production");
  }

  const subscriptionId = process.argv[2];
  if (!subscriptionId) {
    throw new Error("usage: npm run dev:replay-webhook -- <subscriptionId>");
  }

  const secret = config.billing.razorpay.webhookSecret;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not set; the webhook would reject this");
  }

  const periodEndSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          notes: { subscriptionId: String(subscriptionId) },
          current_end: periodEndSeconds,
          amount: 499900,
          currency: "INR",
        },
      },
    },
  });

  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const url = `http://localhost:${config.port}/api/billing/webhook`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": signature },
    body,
  });

  console.log(`${res.status} ${await res.text()}`);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `backend/package.json` `"scripts"`, add:

```json
    "dev:replay-webhook": "ts-node scripts/replay-webhook.ts",
```

- [ ] **Step 3: Verify it refuses without a secret**

Run: `cd backend && npm run dev:replay-webhook -- 1`
Expected (with no `RAZORPAY_WEBHOOK_SECRET` in `.env`): exits 1 with "RAZORPAY_WEBHOOK_SECRET is not set".

- [ ] **Step 4: Typecheck and commit**

Run: `cd backend && npx tsc --noEmit`

```bash
git add backend/scripts/replay-webhook.ts backend/package.json
git commit -m "chore(billing): add a signed webhook replay for local testing"
```

---

## Task 8: Frontend checkout and confirming states

**Files:**
- Create: `frontend/src/app/(auth)/register/checkout.ts`
- Modify: `frontend/src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `POST /billing/checkout/start`, `GET /billing/entitlement`
- Produces: `openRazorpayCheckout(opts): Promise<void>`

- [ ] **Step 1: Write the checkout helper**

Create `frontend/src/app/(auth)/register/checkout.ts`:

```ts
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/** Loads checkout.js once; resolves when window.Razorpay is available. */
export function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load the payment page")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.dataset.razorpay = "true";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment page"));
    document.body.appendChild(s);
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
  onClosed: () => void;
}

export async function openRazorpayCheckout(opts: CheckoutOpts): Promise<void> {
  await loadRazorpay();
  const rz = new window.Razorpay!({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amountPaise,
    currency: opts.currency,
    name: "Cloudglance Sensinglab",
    description: `${opts.planName} plan — ${opts.companyName}`,
    prefill: { email: opts.email },
    // Both paths lead to the same place: the browser never decides whether the
    // payment succeeded. The webhook does. We only start watching for it.
    handler: () => opts.onClosed(),
    modal: { ondismiss: () => opts.onClosed() },
  });
  rz.open();
}
```

- [ ] **Step 2: Drive it from the register page**

In `frontend/src/app/(auth)/register/page.tsx`, after a successful `api.post("/register/admin", …)`:

```tsx
      const { data } = await api.post<{
        emailSent?: boolean;
        devVerificationUrl?: string;
        checkoutToken?: string;
      }>("/register/admin", { /* unchanged body */ });

      setEmailSent(data.emailSent !== false);
      setDevVerifyUrl(data.devVerificationUrl ?? null);
      setRegistered(true);

      if (data.checkoutToken) {
        try {
          const { data: co } = await api.post<{
            orderId: string; keyId: string; amountPaise: number;
            currency: string; planName: string;
          }>("/billing/checkout/start", { checkoutToken: data.checkoutToken });

          await openRazorpayCheckout({
            ...co,
            companyName,
            email: emailId,
            onClosed: () => setConfirming(true),
          });
        } catch (err) {
          // Registration succeeded; only payment could not start. Say exactly
          // that, so the person does not think they must register again.
          setCheckoutError(describeError(err));
        }
      }
```

Add state: `const [confirming, setConfirming] = useState(false);` and
`const [checkoutError, setCheckoutError] = useState<DescribedError | null>(null);`

- [ ] **Step 3: Add the confirming state with a bound**

Add this effect:

```tsx
  useEffect(() => {
    if (!confirming) return;
    const started = Date.now();
    const id = setInterval(async () => {
      // A webhook can be delayed. Two minutes, then hand off to email rather
      // than spin forever.
      if (Date.now() - started > 120_000) {
        clearInterval(id);
        setConfirmTimedOut(true);
        return;
      }
      try {
        const { data } = await api.get<{ status?: string }>("/billing/entitlement");
        if (data.status === "active") {
          clearInterval(id);
          setActivated(true);
        }
      } catch {
        // Not signed in yet is expected here; keep polling until the bound.
      }
    }, 4000);
    return () => clearInterval(id);
  }, [confirming]);
```

Render, in order of precedence: `activated` → "Your organization is active. Sign in."; `confirmTimedOut` → "Payment is still being confirmed. We'll email you when it completes."; `confirming` → a spinner with "Confirming your payment…"; otherwise the existing two-step instruction list.

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

Note: `next build` currently fails for an unrelated reason — `@fontsource-variable/inter` is declared in `package.json` but not installed, and `package-lock.json` is root-owned so `npm install` cannot write it. Fix that first with `sudo chown $USER frontend/package-lock.json && npm install`, or verify inside the container.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(auth)/register"
git commit -m "feat(register): open the payment page and wait for activation"
```

---

## Task 9: Attach a member to a project at creation

**Files:**
- Modify: `backend/src/modules/auth/auth.types.ts` (registerSchema)
- Modify: `backend/src/modules/auth/auth.service.ts` (member branch)
- Test: `backend/test/isolation.test.ts` (extend)

**Interfaces:**
- Consumes: `registerSchema`
- Produces: `POST /register/{contractor,authority}` accepts optional `projectId: number`

- [ ] **Step 1: Write the failing test**

Append inside the existing top-level `describe` of `backend/test/isolation.test.ts`:

Add it inside the existing `describe("cross-tenant isolation (admin A vs admin B)")`
block, which already provides `adminA` (`{ userId, tenantId, cookie }`) and
`projectIdA` from its `beforeAll`:

```ts
test("a contractor created with a projectId sees that project and no other", async () => {
  const email = `scoped-${Date.now()}@example.com`;
  const created = await request(app)
    .post("/api/register/contractor")
    .set("Cookie", adminA.cookie)
    .send({
      firstName: "Scoped", lastName: "Contractor", emailId: email,
      phoneNo: "9876543210", password: "Password1!",
      projectId: projectIdA,
    });
  expect(created.status).toBe(200);

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectIdA } });
  const member = await prisma.user.findUniqueOrThrow({ where: { emailId: email } });
  expect(project.contractorId).toBe(member.id);

  // Restore the fixture: later tests in this file assert on an unassigned project.
  await prisma.project.update({ where: { id: projectIdA }, data: { contractorId: null } });
  await prisma.membership.deleteMany({ where: { userId: member.id } });
  await prisma.user.delete({ where: { id: member.id } });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx vitest run test/isolation.test.ts`
Expected: FAIL — `project.contractorId` is null.

- [ ] **Step 3: Accept the field**

In `backend/src/modules/auth/auth.types.ts`, add to `registerSchema`:

```ts
  /**
   * Optional project to attach the new member to, applied in the same
   * transaction as the user. Without it a contractor exists with access to
   * nothing until somebody edits a project, which reads as a broken account.
   */
  projectId: z.coerce.number().int().positive().optional(),
```

- [ ] **Step 4: Apply it**

In the member branch of `register` in `backend/src/modules/auth/auth.service.ts`, after the user and membership are created:

```ts
  if (payload.projectId) {
    // Scoped to the caller's own organization: assigning into someone else's
    // project would hand a stranger's data to a user we just made.
    const project = await prisma.project.findFirst({
      where: { id: payload.projectId, createdBy: Number(payload.admin_id) },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestError("That project does not exist in your organization");
    }
    await prisma.project.update({
      where: { id: project.id },
      data:
        userType === "contractor"
          ? { contractorId: userId }
          : { authorityId: userId },
    });
  }
```

- [ ] **Step 5: Run the suite**

Run: `cd backend && npx tsc --noEmit && npm run test:run`
Expected: tsc 0; the new test passes; all 9 pre-existing isolation tests still pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth/auth.types.ts backend/src/modules/auth/auth.service.ts backend/test/isolation.test.ts
git commit -m "feat(auth): attach a contractor or authority to a project at creation"
```

---

## Task 10: End-to-end verification (needs credentials)

**Files:** none — this is a manual gate.

**Blocked until** `backend/.env` contains `BILLING_ENABLED`, `BILLING_PROVIDER=razorpay`, the three Razorpay keys, and the Gmail credentials. Tasks 1-9 can all be completed and merged without them.

- [ ] **Step 1: Confirm configuration is live**

Run: `docker compose restart backend && curl -s localhost:3001/api/health`
Then check the log shows no "outbound mail is not configured" warning on a fresh registration.

- [ ] **Step 2: Register through the UI**

Open `http://localhost:3000/register`, complete the form. The Razorpay modal must open showing the Starter amount, ₹4,999.

- [ ] **Step 3: Pay with a test card**

Use Razorpay's test card `4111 1111 1111 1111`, any future expiry, any CVV.

- [ ] **Step 4: Deliver the webhook**

Either run `cloudflared tunnel --url http://localhost:3001` with that URL registered in the Razorpay dashboard, or:

Run: `cd backend && npm run dev:replay-webhook -- <subscriptionId>`

- [ ] **Step 5: Confirm the outcome**

```bash
docker exec shm-postgres-1 psql -U shm -d shm_dev -c \
  "SELECT s.status, s.\"currentPeriodEnd\", u.\"emailId\" FROM subscriptions s JOIN users u ON u.id=s.\"adminId\" ORDER BY s.id DESC LIMIT 1;"
```

Expected: `active`, a date ~30 days out. The welcome email arrives naming the Starter plan and that date. Signing in now succeeds where it previously returned "This account is not active yet."

- [ ] **Step 6: Confirm scoping**

As that admin, create a project, then create a contractor with `projectId` set. Sign in as the contractor: exactly one project is listed, and another admin's project returns 403.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §1 checkout token + start route | 3, 4 |
| §2 provider order creation | 2 |
| §3 amount from plan, config-selected | 1 |
| §4 frontend checkout + bounded polling | 8 |
| §5 welcome email, non-fatal send | 6 |
| §6 optional projectId on member creation | 9 |
| §7 tunnel and replay CLI | 7, 10 |
| §8 configuration | 1 (`.env.example`), 10 (real values) |
| §9 sequencing | Task order |
| §10 verification | Every task's run step, plus 10 |

No spec section is unimplemented. §11 (out of scope) is correctly absent.

**Placeholder scan:** none. Every code step carries real code; every run step names the command and the expected result.

**Type consistency:** `CreateOrderInput`/`CreatedOrder` (Task 2) are consumed unchanged by `startCheckoutForUser` (Task 4). `signCheckoutToken`/`verifyCheckoutToken` (Task 3) are used by Tasks 4 and 5 with the same signatures. `renderWelcomeEmail`'s input (Task 6) matches its call site in the same task. `StartedCheckout`'s fields match what Task 8 destructures.

**Known inherited breakage, not caused by this plan:** `frontend` cannot `next build` locally until `@fontsource-variable/inter` is installed, which needs `package-lock.json` chowned off root. Called out in Task 8 Step 4.
